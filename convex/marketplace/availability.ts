import type { Doc } from '../_generated/dataModel';
import { nicheHasSubservices, type Niche } from './types';

/** A timestamp alone must close a sale, even before an expiry job runs. */
export function isLeadForSale(lead: Doc<'marketplaceLeads'>, now = Date.now()): boolean {
  return (lead.status === 'published' || lead.status === 'sold_shared') &&
    (lead.expiresAt === undefined || lead.expiresAt > now);
}

export function matchesServiceTypes(lead: Doc<'marketplaceLeads'>, types: string[] | null | undefined): boolean {
  if (types == null || !nicheHasSubservices(lead.niche as Niche)) return true;
  // Unknown is not evidence of a match when a buyer selected specific services.
  return lead.serviceType !== undefined && types.includes(lead.serviceType);
}
