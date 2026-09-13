import {v} from 'convex/values';
export const webhookChannel=v.union(v.literal('email'),v.literal('sms'),v.literal('whatsapp'));
export const webhookReason=v.union(v.literal('unmapped_session'),v.literal('conflicting_session'),v.literal('unmapped_account'),v.literal('unmatched_receipt'),v.literal('missing_sender'),v.literal('missing_recipient'),v.literal('invalid_payload'));
export const webhookOccurrence=v.object({reference:v.string(),seenAt:v.number(),providerMessageId:v.optional(v.string())});
