import { v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isLeadForSale, matchesBuyer, matchesServiceTypes } from './availability';

export const coverageValidator = v.object({
  status: v.union(v.literal('covered'),v.literal('uncovered'),v.literal('unavailable'),v.literal('unknown')),
  matchingBuyers: v.number(), complete: v.boolean(), reasons: v.array(v.string()),
});

// Read once per admin page. An incomplete scan must never report definite zero coverage.
export async function loadCoverageBuyers(ctx: QueryCtx) {
  const rows = await ctx.db.query('marketplaceBuyerPreferences').withIndex('by_org').take(201);
  const candidates = [...new Map(rows.slice(0,200).map(p => [p.orgId,p])).values()];
  const checked = await Promise.all(candidates.map(async prefs => ({prefs, org:await ctx.db.get(prefs.orgId)})));
  return {buyers:checked.filter(b => b.org?.marketplaceEnabled).map(b => b.prefs), complete:rows.length<=200};
}

export function coverageForLead(lead:Doc<'marketplaceLeads'>, buyers:Doc<'marketplaceBuyerPreferences'>[], complete:boolean,
  purchases:Doc<'marketplacePurchases'>[], now=Date.now()) {
  const result = (status:'covered'|'uncovered'|'unavailable'|'unknown', matchingBuyers=0, reasons:string[]=[], fullyChecked=complete) =>
    ({status,matchingBuyers,reasons,complete:fullyChecked});
  if (!isLeadForSale(lead,now)) return result('unavailable',0,[],true);
  if (purchases.length>100) return result('unknown',0,[],false);
  const exclusive = lead.allowExclusive && purchases.length===0;
  const shared = lead.allowShared && !purchases.some(p=>p.mode==='exclusive') && purchases.filter(p=>p.mode==='shared').length<lead.maxSharedBuyers;
  if (!exclusive && !shared) return result('unavailable',0,[],true);
  const reasons = new Set<string>();
  let matches=0;
  for (const prefs of buyers) {
    if (!matchesBuyer(lead,prefs)) {
      // Show only relevant failures: service/region matter after the niche matches.
      if (!prefs.niches.includes(lead.niche)) { reasons.add('niche'); continue; }
      if (!matchesServiceTypes(lead,prefs.serviceTypes)) reasons.add(lead.serviceType ? 'service' : 'unknown_service');
      if (!(prefs.segments??['b2c','b2b']).includes(lead.segment)) reasons.add('segment');
      if (prefs.provinces!==undefined && (!lead.province || !prefs.provinces.includes(lead.province))) reasons.add(lead.province ? 'province' : 'unknown_province');
      continue;
    }
    if (purchases.some(p=>p.buyerOrgId===prefs.orgId)) { reasons.add('already_purchased'); continue; }
    if ((prefs.preferredMode==='exclusive'&&!exclusive) || (prefs.preferredMode==='shared'&&!shared)) { reasons.add('mode'); continue; }
    matches++;
  }
  if (matches) return result('covered',matches);
  if (!complete) return result('unknown',0,[],false);
  if (!buyers.length) reasons.add('no_active_buyers');
  return result('uncovered',0,[...reasons]);
}
