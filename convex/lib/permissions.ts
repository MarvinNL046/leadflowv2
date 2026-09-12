import {ConvexError} from 'convex/values';
import type {Id} from '../_generated/dataModel';
import type {QueryCtx} from '../_generated/server';
import {getUserId} from './identity';

export type CompanyRole = 'owner' | 'admin' | 'member';
export type CompanyPermission = 'crm' | 'manage';

/** Company-wide permissions. workspaceId on memberships is a default,
 * not a private workspace boundary. Platform admin never bypasses membership. */
export function canManageCompany(role: CompanyRole | undefined) {
  return role === 'owner' || role === 'admin';
}

export async function requireCompanyPermission(
  ctx: QueryCtx, orgId: Id<'orgs'>, permission: CompanyPermission = 'crm',
) {
  const userId = await getUserId(ctx);
  if (!userId) throw new ConvexError('Not authenticated');
  const memberships = await ctx.db.query('memberships')
    .withIndex('by_user_org', q => q.eq('userId',userId).eq('orgId',orgId)).take(101);
  if (!memberships.length || memberships.length > 100 || !await ctx.db.get(orgId)) {
    throw new ConvexError('Geen toegang tot dit bedrijf');
  }
  const membership = memberships.find(m => m.role === 'owner')
    ?? memberships.find(m => m.role === 'admin') ?? memberships[0];
  if (permission === 'manage' && !canManageCompany(membership.role)) {
    throw new ConvexError('Alleen een eigenaar of bedrijfsbeheerder kan deze actie uitvoeren');
  }
  return {userId, orgId, membership};
}

export async function requireWorkspacePermission(
  ctx: QueryCtx, workspaceId: Id<'workspaces'>, permission: CompanyPermission = 'crm',
) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new ConvexError('Workspace not found');
  return requireCompanyPermission(ctx, workspace.orgId, permission);
}
