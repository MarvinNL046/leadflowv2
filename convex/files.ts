import {action, internalMutation, internalQuery, mutation} from './_generated/server';
import {internal} from './_generated/api';
import {ConvexError, v} from 'convex/values';
import {requireCompanyPermission, requireWorkspacePermission} from './lib/permissions';

/** Legacy direct uploads cannot establish company ownership. Fail closed. */
export const generateUploadUrl = mutation({
  args:{}, returns:v.string(),
  handler:async()=>{throw new ConvexError('Vernieuw de pagina om een afbeelding te uploaden');},
});
export const assertUploadAccess = internalQuery({
  args:{workspaceId:v.id('workspaces')}, returns:v.null(),
  handler:async(ctx,{workspaceId})=>{await requireWorkspacePermission(ctx,workspaceId,'manage');return null;},
});
export const registerImage = internalMutation({
  args:{workspaceId:v.id('workspaces'),storageId:v.id('_storage')}, returns:v.null(),
  handler:async(ctx,{workspaceId,storageId})=>{
    const {orgId,userId}=await requireWorkspacePermission(ctx,workspaceId,'manage');
    await ctx.db.insert('companyImages',{orgId,workspaceId,storageId,uploadedBy:userId});
    return null;
  },
});
export function imageContentType(bytes:ArrayBuffer) {
  const b=new Uint8Array(bytes);
  if(b.length===0||b.length>5*1024*1024)throw new ConvexError('Afbeelding mag maximaal 5 MB zijn');
  if([137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n))return 'image/png';
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
  throw new ConvexError('Gebruik een PNG-, JPEG- of WebP-afbeelding');
}
/** Public email images, never private attachments. Accept bytes, not a client
 * storageId, so a caller cannot claim a file uploaded by another company. */
export const uploadImage = action({
  args:{workspaceId:v.id('workspaces'),bytes:v.bytes()}, returns:v.string(),
  handler:async(ctx,{workspaceId,bytes}):Promise<string>=>{
    await ctx.runQuery(internal.files.assertUploadAccess,{workspaceId});
    const type=imageContentType(bytes);
    const storageId=await ctx.storage.store(new Blob([bytes],{type}));
    try{await ctx.runMutation(internal.files.registerImage,{workspaceId,storageId});}
    catch(error){await ctx.storage.delete(storageId);throw error;}
    const url=await ctx.storage.getUrl(storageId);
    if(!url)throw new ConvexError('Upload niet gevonden');
    return url;
  },
});
export const resolveStorageUrl = mutation({
  args:{storageId:v.id('_storage')}, returns:v.string(),
  handler:async(ctx,{storageId})=>{
    const image=await ctx.db.query('companyImages').withIndex('by_storage',q=>q.eq('storageId',storageId)).unique();
    if(!image)throw new ConvexError('Afbeelding niet beschikbaar');
    await requireCompanyPermission(ctx,image.orgId,'manage');
    const url=await ctx.storage.getUrl(storageId);
    if(!url)throw new ConvexError('Afbeelding niet beschikbaar');
    return url;
  },
});
