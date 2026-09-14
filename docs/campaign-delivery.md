# Campaign delivery and recovery

Campaigns prepare and deduplicate their entire audience before starting delivery. Drafts and scheduled campaigns display a separately calculated, timestamped audience estimate. The sending resolver is the same as the counting resolver; contacts may still change between counting and sending.

## Delivery invariants

- Render first, then persist a batch and claim its recipients in one transaction. Persisted requests contain at most 20 recipients and 700,000 UTF-8 bytes.
- Check mailability again immediately before the first provider attempt. After an attempt, never change that request's body.
- Every retry uses the persisted body and `broadcast-batch-<batch ID>` idempotency key. Retry network failures, 408, 429 and 5xx, honoring Retry-After. Stop before 23 hours, below Resend's 24-hour idempotency lifetime, or after six attempts. Ambiguous outcomes require review.
- Split a request only after an explicit 422 recipient validation rejection, which accepted no recipients. A timeout must never be split or requeued under a new key.
- Commit complete provider IDs, recipient statuses, messages and counters together. Duplicate completions are no-ops. Never label an incomplete success response as sent.
- A watchdog resumes due jobs. Twelve-minute leases prevent concurrent workers from issuing the same job. A second watchdog restarts abandoned pending work, but never sends a partially prepared list or blindly repeats legacy `sending` rows.
- Cancellation prevents new requests; a request already accepted by Resend cannot be recalled. Its receipt can still be recorded.

## Webhooks and metrics

Delivery, bounce, open and click counters deduplicate by the message's first observed event. Out-of-order events do not downgrade an open to delivered or a bounce to opened. An unmatched signed Resend receipt returns 503 so the provider retries if the event arrived before the send transaction committed. Tracking and corresponding webhook subscriptions must be enabled in Resend to receive those metrics. Historical zeros do not establish zero engagement.

## Recovery

The public recovery button resumes only never-claimed pending rows from a completely prepared failed campaign. It does not retry failed or ambiguous rows.

Operations may use `broadcastRecovery:reconcileVerified` only after matching each provider receipt to campaign subject, recipient address and send window. This writes receipts without sending mail. `retryVerifiedRejected` is restricted to the legacy terminal batch-error shape and a confirmed rejection at the campaign failure time; it must not be used for timeouts or accepted requests. Original failed message history is retained.

Deploy the backward-compatible Convex schema/functions before the frontend that calls them. Do not remove the legacy claim/record internal functions while old scheduled executions may exist. Rollback should not discard `broadcastBatches` or receipts: quarantine pending jobs before reverting to a sender without idempotency support.

## Validation

The campaign regression suite covers competing claims, duplicate completions, lost responses, incomplete responses, validation splitting, opt-outs between preparation and delivery, retry timing/expiry, cancellation, multi-page audience counts, access checks, out-of-order tracking and guarded legacy recovery. The full repository test suite, TypeScript check, Vite build and Convex production schema dry-run are release checks. Provider calls in tests are mocked.

The requested seventh maintenance variant is created only by `campaignDrip7:createDraft`, reusing the first sent campaign's segment. It is not scheduled or sent by the migration.
