import {v} from 'convex/values';
import {paginationOptsValidator} from 'convex/server';
import {query,mutation} from './_generated/server';
import {requireWorkspacePermission,canManageCompany} from './lib/permissions';
import {hasWorkspaceProviders} from './companyProviders';
import {requireAdmin} from './marketplace/admin';

export const product=v.union(v.literal('frostwork'),v.literal('cashflow'));
// Existing suite access is tied to the explicitly assigned company, never
// to a global admin flag. A request is NOT an entitlement or a subscription.
export const status=query({
  args:{workspaceId:v.id('workspaces')},
  returns:v.object({canRequest:v.boolean(),existingSuite:v.boolean(),requested:v.array(product)}),
  handler:async(ctx,{workspaceId})=>{
    const {orgId,membership}=await requireWorkspacePermission(ctx,workspaceId);
    const rows=await ctx.db.query('appRequests').withIndex('by_orgId_and_product',q=>q.eq('orgId',orgId)).take(3);
    return {canRequest:canManageCompany(membership.role),existingSuite:await hasWorkspaceProviders(ctx,workspaceId),requested:rows.map(r=>r.product)};
  },
});
export const request=mutation({
  args:{workspaceId:v.id('workspaces'),product},returns:v.null(),
  handler:async(ctx,args)=>{
    const {orgId,userId}=await requireWorkspacePermission(ctx,args.workspaceId,'manage');
    if(await hasWorkspaceProviders(ctx,args.workspaceId))return null;
    const existing=await ctx.db.query('appRequests').withIndex('by_orgId_and_product',q=>q.eq('orgId',orgId).eq('product',args.product)).unique();
    if(!existing)await ctx.db.insert('appRequests',{orgId,product:args.product,requestedBy:userId,requestedAt:Date.now()});
    return null;
  },
});
export const list=query({
  args:{paginationOpts:paginationOptsValidator},
  returns:v.object({page:v.array(v.object({id:v.id('appRequests'),company:v.string(),product,requestedAt:v.number()})),isDone:v.boolean(),continueCursor:v.string()}),
  handler:async(ctx,args)=>{
    await requireAdmin(ctx);
    const result=await ctx.db.query('appRequests').order('desc').paginate({...args.paginationOpts,numItems:Math.min(50,args.paginationOpts.numItems)});
    const page=await Promise.all(result.page.map(async r=>({id:r._id,company:(await ctx.db.get(r.orgId))?.name??'Verwijderd bedrijf',product:r.product,requestedAt:r.requestedAt})));
    return {page,isDone:result.isDone,continueCursor:result.continueCursor};
  },
});
