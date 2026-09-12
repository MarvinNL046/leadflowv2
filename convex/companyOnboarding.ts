import {ConvexError,v} from 'convex/values';
import {mutation,query,type MutationCtx} from './_generated/server';
import {ensureUserId} from './lib/identity';
import {requireWorkspacePermission,requireCompanyPermission} from './lib/permissions';
const inviteRole=v.union(v.literal('admin'),v.literal('member'));
async function verified(ctx:MutationCtx){const identity=await ctx.auth.getUserIdentity();if(!identity || identity.emailVerified!==true || !identity.email)throw new ConvexError('Log in met een geverifieerd e-mailadres.');const userId=await ensureUserId(ctx);if(!userId)throw new ConvexError('Niet ingelogd');return {userId,email:identity.email.trim().toLowerCase()};}
function field(value:string,label:string,max:number){const s=value.trim();if(!s || s.length>max)throw new ConvexError(`${label} is verplicht (maximaal ${max} tekens).`);return s;}
async function hash(code:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code))),b=>b.toString(16).padStart(2,'0')).join('');}
export const create=mutation({
 args:{name:v.string(),contactPhone:v.string(),workArea:v.string(),services:v.string()},returns:v.id('workspaces'),
 handler:async(ctx,args)=>{
  const {userId,email}=await verified(ctx);
  if(await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',userId)).first())throw new ConvexError('Je bent al gekoppeld aan een bedrijf. Meerdere bedrijven per account worden nog niet ondersteund.');
  if(await ctx.db.query('orgs').withIndex('by_owner',q=>q.eq('ownerId',userId)).first())throw new ConvexError('Je hebt al een bedrijfsomgeving. Neem contact op met de beheerder.');
  const name=field(args.name,'Bedrijfsnaam',120),contactPhone=field(args.contactPhone,'Telefoonnummer',40),workArea=field(args.workArea,'Werkgebied',250),services=field(args.services,'Diensten',500);
  if(!/^\+?[0-9 ()-]{6,40}$/.test(contactPhone))throw new ConvexError('Vul een geldig telefoonnummer in.');
  const orgId=await ctx.db.insert('orgs',{name,slug:`bedrijf-${userId}`,ownerId:userId,contactEmail:email,contactPhone,workArea,services,marketplaceEnabled:false});
  const workspaceId=await ctx.db.insert('workspaces',{orgId,name:'Mijn bedrijf',isDefault:true});
  await ctx.db.insert('memberships',{userId,orgId,workspaceId,role:'owner'});
  if(!await ctx.db.query('userProfiles').withIndex('by_user',q=>q.eq('userId',userId)).unique())await ctx.db.insert('userProfiles',{userId,locale:'nl',isSuperAdmin:false,lastLoginAt:Date.now()});
  const pipelineId=await ctx.db.insert('pipelines',{workspaceId,name:'Verkoop',isDefault:true});
  for(const [order,name] of ['Nieuw','Contact gelegd','Offerte verstuurd','Gewonnen','Verloren'].entries())await ctx.db.insert('pipelineStages',{pipelineId,name,order,isWonStage:order===3,isLostStage:order===4});
  return workspaceId;
 },
});
export const team=query({
 args:{workspaceId:v.id('workspaces')},returns:v.object({company:v.string(),canInviteAdmins:v.boolean(),members:v.array(v.object({id:v.id('memberships'),name:v.string(),email:v.string(),role:v.union(v.literal('owner'),inviteRole)})),invites:v.array(v.object({id:v.id('companyInvites'),email:v.string(),role:inviteRole,expiresAt:v.number()}))}),
 handler:async(ctx,args)=>{const {orgId,membership}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');const org=await ctx.db.get(orgId);const rows=await ctx.db.query('memberships').withIndex('by_org',q=>q.eq('orgId',orgId)).take(101);if(rows.length>100)throw new ConvexError('Neem contact op met de beheerder voor dit team.');const members=await Promise.all(rows.map(async m=>{const u=await ctx.db.get(m.userId);return {id:m._id,name:u?.name??'',email:u?.email??'',role:m.role};}));const invites=await ctx.db.query('companyInvites').withIndex('by_orgId_and_status',q=>q.eq('orgId',orgId).eq('status','pending')).take(50);return {company:org!.name,canInviteAdmins:membership.role==='owner',members,invites:invites.filter(i=>i.expiresAt>Date.now()).map(i=>({id:i._id,email:i.email,role:i.role,expiresAt:i.expiresAt}))};},
});
export const invite=mutation({
 args:{workspaceId:v.id('workspaces'),email:v.string(),role:inviteRole},returns:v.object({code:v.string(),expiresAt:v.number()}),
 handler:async(ctx,args)=>{
  const {userId,orgId,membership}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');await verified(ctx);
  if(args.role==='admin' && membership.role!=='owner')throw new ConvexError('Alleen een eigenaar kan bedrijfsbeheerders uitnodigen.');
  const email=args.email.trim().toLowerCase();if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ConvexError('Vul een geldig e-mailadres in.');
  const pending=await ctx.db.query('companyInvites').withIndex('by_orgId_and_status',q=>q.eq('orgId',orgId).eq('status','pending')).take(51);
  if(pending.length>50)throw new ConvexError('Te veel open uitnodigingen.');let kept=0;
  for(const i of pending){if(i.email===email || i.expiresAt<=Date.now())await ctx.db.patch(i._id,{status:'revoked'});else kept++;}
  if(kept>=50)throw new ConvexError('Maximaal vijftig open uitnodigingen. Trek eerst een uitnodiging in.');
  const code=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const expiresAt=Date.now()+7*86400000;
  await ctx.db.insert('companyInvites',{orgId,workspaceId:args.workspaceId,email,role:args.role,tokenHash:await hash(code),createdBy:userId,expiresAt,status:'pending'});return {code,expiresAt};
 },
});
export const revoke=mutation({args:{id:v.id('companyInvites')},returns:v.null(),handler:async(ctx,args)=>{const i=await ctx.db.get(args.id);if(!i)throw new ConvexError('Uitnodiging niet gevonden');const {membership}=await requireCompanyPermission(ctx,i.orgId,'manage');if(i.role==='admin' && membership.role!=='owner')throw new ConvexError('Alleen de eigenaar beheert uitnodigingen voor beheerders.');if(i.status==='pending')await ctx.db.patch(i._id,{status:'revoked'});return null;}});
export const accept=mutation({args:{code:v.string()},returns:v.id('workspaces'),handler:async(ctx,args)=>{
 const {userId,email}=await verified(ctx);const code=args.code.trim();if(!/^[a-f0-9]{64}$/.test(code))throw new ConvexError('Uitnodiging ongeldig of niet voor dit e-mailadres.');
 const tokenHash=await hash(code);const i=await ctx.db.query('companyInvites').withIndex('by_tokenHash',q=>q.eq('tokenHash',tokenHash)).unique();
 if(!i || i.email!==email || i.status!=='pending' || i.expiresAt<=Date.now())throw new ConvexError('Uitnodiging ongeldig, verlopen of niet voor dit e-mailadres.');
 const inviter=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',i.createdBy).eq('orgId',i.orgId)).take(101);
 if(!inviter.some(m=>m.role==='owner' || (i.role==='member' && m.role==='admin')))throw new ConvexError('De uitnodiger heeft geen geldige beheerrechten meer.');
 const workspace=await ctx.db.get(i.workspaceId);if(!workspace || workspace.orgId!==i.orgId || !await ctx.db.get(i.orgId))throw new ConvexError('Bedrijfsomgeving niet beschikbaar.');
 if(await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',userId)).first())throw new ConvexError('Je bent al gekoppeld aan een bedrijf. Gebruik een account zonder bedrijfsomgeving.');
 if((await ctx.db.query('memberships').withIndex('by_org',q=>q.eq('orgId',i.orgId)).take(100)).length>=100)throw new ConvexError('Dit team heeft het maximum van honderd leden bereikt.');
 await ctx.db.insert('memberships',{userId,orgId:i.orgId,workspaceId:i.workspaceId,role:i.role});
 if(!await ctx.db.query('userProfiles').withIndex('by_user',q=>q.eq('userId',userId)).unique())await ctx.db.insert('userProfiles',{userId,locale:'nl',isSuperAdmin:false,lastLoginAt:Date.now()});
 await ctx.db.patch(i._id,{status:'accepted',acceptedBy:userId,acceptedAt:Date.now()});return i.workspaceId;
}});
export const removeMember=mutation({args:{id:v.id('memberships')},returns:v.null(),handler:async(ctx,args)=>{const target=await ctx.db.get(args.id);if(!target)throw new ConvexError('Teamlid niet gevonden');const {membership,userId}=await requireCompanyPermission(ctx,target.orgId,'manage');const all=await ctx.db.query('memberships').withIndex('by_user_org',q=>q.eq('userId',target.userId).eq('orgId',target.orgId)).take(101);if(all.length>100 || all.some(m=>m.role==='owner') || target.userId===userId || (all.some(m=>m.role==='admin') && membership.role!=='owner'))throw new ConvexError('Je kunt dit lid niet verwijderen. Eigenaren worden hier niet verwijderd.');for(const m of all)await ctx.db.delete(m._id);return null;}});
