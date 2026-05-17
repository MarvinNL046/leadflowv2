# V1 → V2 Feature-usage audit

**Bron:** Neon production cluster `ep-wandering-sound-agfbhsdj-pooler`, workspace 12 (Staycool) + globaal.
**Snapshot:** 2026-05-17 — telt 110+ tables, alle rijen + laatste activity per tabel.
**Doel:** scherp afbakenen wat naar v2 (TanStack Start + Convex) gaat en wat in v1 blijft tot cutover.

## Scope-beslissingen (Marvin 2026-05-17)

| Feature | V2 status | Reden |
|---|---|---|
| CRM core (contacts, opportunities, pipelines, notes) | ✅ MUST PORT | Hoofdfunctionaliteit, dagelijks gebruik |
| Kanban (pipeline_stages + opportunities + stage_history) | ✅ MUST PORT | Dashboard hoofdscherm |
| Messaging (chat, email_log, message_log) | ✅ MUST PORT | "Berichten pagina" zoals Marvin noemde |
| Workflows (auto-SMS/mail naar nieuwe leads) | ✅ MUST PORT | Vervangt Mia's request-info in v2 |
| Meta lead-ads webhook + processing | ✅ MUST PORT | 80% leads komt hier vandaan |
| Voidfix SMS + WhatsApp gateways | ✅ MUST PORT | Outbound messaging primary |
| Email outbound (Resend) | ✅ MUST PORT | Outbound messaging primary |
| Webhook/outbox pattern | ✅ MUST PORT | Reliability infrastructure |
| Custom fields | ✅ MUST PORT | Hot in productie (969 values) |
| Marketplace lead-resale | ✅ PORT (schema + UI) | Productvisie ondanks 0 customers |
| Homepage (user-facing) | ✅ PORT | Onderdeel van wetryleadflow.com app |
| Notifications | ✅ MUST PORT | UX feedback layer |
| **Mia AI Control Room** | ❌ NOT IN V2 | Marvin: workflow-auto-SMS doet hetzelfde simpler |
| Invoicing + Quotations + Credit notes + Payments | ❌ SKIP | 0 rows = nooit gebruikt; Marvin gebruikt Moneybird |
| Email campaigns | ❌ SKIP | 0 campaigns aangemaakt |
| Calendar / appointments | ❌ SKIP | Gebruikt Google Calendar direct |
| Landing pages | ❌ SKIP | 3 rows, geen activity sinds februari |
| Support tickets | ❌ SKIP | Intern support feature, ws=0 |
| Google Business reviews | ❌ SKIP | 0 connections, nooit live |
| Twilio (legacy VoIP) | ❌ SKIP | Vervangen door Voidfix |
| Conversation AI (eerste poging) | ❌ SKIP | 0 sessions, vervangen door Mia in v1 (en die ook niet in v2) |

## Detail per tabel (volledige scan workspace 12)

### MUST PORT — actief gebruikte tabellen

| Tabel | Rows totaal | Rows ws12 | Laatste activity | V2 doel |
|---|---|---|---|---|
| `contacts` | 5979 | 5979 | 2026-05-17 | Convex `contacts` table |
| `opportunities` | 417 | 417 | 2026-05-17 | Convex `opportunities` |
| `opportunity_stage_history` | 1071 | (global) | n/a | Audit-trail voor Kanban |
| `pipelines` | 1 | 1 | 2026-01-09 | Convex `pipelines` |
| `pipeline_stages` | 7 | (global) | 2026-01-22 | Convex `pipelineStages` |
| `notes` | 454 | 454 | 2026-05-17 | Convex `notes` |
| `custom_field_definitions` | 8 | 8 | 2026-05-04 | Convex `customFieldDefs` |
| `custom_field_values` | 969 | (global) | 2026-05-17 | Convex `customFieldValues` |
| `notifications` | 306 | 306 | 2026-05-17 | Convex `notifications` |
| `chat_conversations` | 4 | 4 | 2026-04-23 | Convex `chatConversations` |
| `chat_messages` | 30 | (global) | 2026-04-22 | Convex `chatMessages` |
| `message_log` | 1766 | 1737 | 2026-05-17 | Convex `messageLog` (SMS+WA outbound trail) |
| `email_log` | 1111 | 1009 | 2026-05-17 | Convex `emailLog` |
| `email_threads` | 7937 | 7937 | 2026-05-17 | Convex `emailThreads` |
| `email_messages` | 11072 | (global) | 2026-05-17 | Convex `emailMessages` |
| `email_connections` | 1 | 1 | 2026-05-17 | Convex `emailConnections` (IMAP/SMTP per ws) |
| `email_templates` | 4 | 4 | 2026-01-23 | Convex `emailTemplates` |
| `lead_attribution` | 440 | (global) | 2026-05-17 | Convex `leadAttribution` |
| `meta_lead_raw` | 360 | 0¹ | 2026-05-17 | Convex `metaLeadRaw` |
| `meta_forms` | 27 | 0¹ | 2026-04-26 | Convex `metaForms` (form-schema cache) |
| `meta_pages` | 1 | 0¹ | 2026-04-26 | Convex `metaPages` |
| `meta_connections` | 1 | 0¹ | 2026-04-26 | Convex `metaConnections` |
| `meta_messaging_config` | 1 | 0¹ | 2026-04-26 | Convex `metaMessagingConfig` |
| `webhook_events` | 10020 | (global) | 2026-05-17 | Convex `webhookEvents` (dedupe trail) |
| `outbox_events` | 1505 | 1505 | 2026-05-17 | Convex pattern (Convex heeft scheduler — mogelijk vereenvoudigen) |
| `workflows` | 5 | 5 | 2026-02-14 | Convex `workflows` |
| `workflow_nodes` | 65 | (global) | 2026-02-14 | Convex `workflowNodes` |
| `workflow_edges` | 71 | (global) | n/a | Convex `workflowEdges` |
| `workflow_executions` | 290 | (global) | n/a | Convex `workflowExecutions` |
| `workflow_execution_logs` | 1153 | (global) | n/a | Convex `workflowExecLogs` (of korter — Convex log retention overweegen) |
| `website_lead_api_keys` | 2 | 2 | 2026-05-16 | Convex `websiteLeadApiKeys` |
| `website_lead_logs` | 90 | (global) | 2026-05-16 | Convex `websiteLeadLogs` |
| `voidfix_sms_config` | 1 | 0¹ | n/a | Convex `voidfixSmsConfig` |
| `platform_sms_config` | 1 | (global) | 2026-01-11 | Convex `platformSmsConfig` (default fallback device) |
| `whatsapp_web_config` | 1 | 0¹ | n/a | Convex `whatsappWebConfig` |
| `whatsapp_templates` | 59 | 0¹ | n/a | Convex `whatsappTemplates` |
| `lead_ingest_routes` | 1 | 1 | 2026-02-10 | Convex `leadIngestRoutes` (per-form routing) |
| `crm_settings` | 2 | 1 | 2026-02-06 | Convex `crmSettings` |
| `feature_flags` | 5 | (global) | 2025-12-21 | Convex `featureFlags` (klein, behoud) |
| `feature_flag_overrides` | 0 | n/a | n/a | Convex `featureFlagOverrides` |
| `users` | 3 | (global) | 2026-04-22 | Convex `users` |
| `orgs` | 3 | (global) | 2026-05-07 | Convex `orgs` |
| `workspaces` | 2 | 0¹ | n/a | Convex `workspaces` |
| `memberships` | 3 | 0¹ | n/a | Convex `memberships` |
| `push_subscriptions` | 4 | 4 | 2026-04-22 | Convex `pushSubscriptions` (web push notifs) |

¹ `0 rows ws12` op meta_*, voidfix_*, whatsapp_* etc. komt omdat `workspace_id` op die tabellen NOT NULL is bij join, maar de Staycool config zit onder `org_id`. Geen probleem — data bestaat wel, indirect gekoppeld.

### Marketplace (PORT schema + UI per Marvin's beslissing — productvisie)

| Tabel | Rows totaal | Activity | V2 doel |
|---|---|---|---|
| `marketplace_lead_rates` | 71 | 2026-04-25 | Pricing matrix per niche, geseed maar geen verkopen |
| `marketplace_api_keys` | 47 | 2026-04-26 | Buyer-side API keys, geseed |
| `marketplace_leads` | 2 | 2026-04-26 | Lead pool — 2 leads geprobeerd, geen koop |
| `marketplace_lead_views` | 8 | n/a | Buyer-side viewing trail |
| `platform_leads_pool` | 48 | 2026-05-15 | Cross-tenant lead pool |
| `marketplace_buyer_preferences` | 1 | n/a | 1 buyer-account aangemaakt, geen activity |
| `marketplace_org_profiles` | 1 | n/a | Buyer-profiel |
| `marketplace_wallets` | 1 | n/a | Geen transactions |
| `marketplace_invoice_sequences` | 0 | n/a | Bookkeeping skeleton |
| Rest marketplace_* | 0 | n/a | Skeleton tables |

→ Schema porten naar Convex, UI-routes (`/marketplace/*`) porten in lean form. Eerste echte buyer = drives feature uitbouw.

### SKIP — nul of stilstaande tabellen

| Tabel | Rows | Reden skip |
|---|---|---|
| `invoices` | 0 | Nooit factuur gemaakt |
| `quotations` | 0 | Nooit offerte gemaakt |
| `credit_notes` | 0 | Geen credits |
| `credit_note_line_items` | 0 | — |
| `line_items` | 0 | — |
| `payments` | 0 | — |
| `products` | 0 | Geen producten gedefinieerd |
| `expenses` | 0 | — |
| `recurring_invoices` | 0 | — |
| `invoice_settings` | 1 | Jan 2026 stale config |
| `email_campaigns` | 0 | Nooit campagne |
| `email_campaign_recipients` | 0 | — |
| `marketing_unsubscribes` | 0 | — |
| `calendar_events` | 1445 | Aanwezig maar Marvin gebruikt Google Calendar direct |
| `calendar_event_attendees` | 986 | — |
| `landing_pages` | 3 | Geen activity sinds februari |
| `landing_page_forms` | 3 | — |
| `page_analytics` | 4 | Voor landing pages, ook skip |
| `page_templates` | 16 | — |
| `page_template_categories` | 4 | — |
| `support_tickets` | 9 | ws12=0, intern feature niet gebruikt |
| `support_ticket_replies` | 1 | — |
| `google_business_connections` | 0 | Nooit gekoppeld |
| `google_business_reviews` | 0 | — |
| `twilio_connections` | 1 | Legacy, vervangen door Voidfix |
| `voip_connections` | 1 | 1 row, jan 2026 — niet meer gebruikt |
| `conversation_ai_configs` | 0 | Oude AI poging |
| `conversation_ai_knowledge` | 0 | — |
| `conversation_ai_sessions` | 0 | — |
| `ai_tasks` | live (Mia, vandaag) | NIET in v2 per Marvin |
| `ai_feedback` | live (Mia, vandaag) | NIET in v2 |
| `ai_learning_logs` | live (Mia, vandaag) | NIET in v2 |
| `chat_canned_responses` | 0 | Nooit canned reply opgeslagen |
| `route_optimization_configs` | 0 | — |
| `referrals` | 0 | Referral feature niet live |
| `referral_codes` | 0 | — |
| `referral_commissions` | 0 | — |
| `feedback_votes` | 0 | — |
| `inbound_webhooks` | 0 | — |
| `webhook_endpoints` | 0 | — |
| `webhook_deliveries` | 0 | — |
| `cron_job_configs` | 4 | Skip — Convex heeft eigen scheduler |
| `cron_job_runs` | 0 | — |
| `lead_field_mappings` | 0 | — |
| `lead_verifications` | 48 | 2026-04-26 stale, evaluate of dit nog nut heeft |
| `outbound_email_log` | 2 | 2026-04-25 — vermoedelijk legacy, email_log is de live |
| `workspace_snapshots` | 20 | Backup-feature, Convex heeft eigen backups |
| `workspace_availability` | 2 | Calendar-related, ook skip |
| `message_usage` | 5 | Niet duidelijk wat het tracking — vraag bij Marvin |
| `custom_domains` | 1 | Geen klant gebruikt custom domain nog |
| `client_subscriptions` | 1 | Subscription tracking — Stripe-side beter |
| `marketplace_referrals` | 0 | — |
| `marketplace_purchases` | 0 | — |
| `marketplace_wallet_transactions` | 0 | — |
| `marketplace_invoices` | 0 | — |
| `marketplace_reviews` | 0 | — |
| `social_comments` | 585 | ws=0, lijkt niet ws-bound — voor v2 evalueren |
| `social_posts` | 108 | Idem |
| `product_audits` | 16 | Admin tool, intern |
| `changelogs` | 187 | App changelog, kan herstart |
| `changelog_reads` | 23 | — |
| `xp_transactions` | 615 | Gamification — evalueer wel/niet (niet door Marvin bevestigd) |
| `user_achievements` | 11 | XP-gerelateerd |

## V2 schema-impact

**Tables naar v2: ~45** (uit ~110 in v1 → 60% reductie).

Convex idiomen om in v2 te gebruiken:
- `workspaceId` index op alle multi-tenant tables (1e index parameter)
- Single `messages` table met `channel: "sms" | "whatsapp" | "email"` enum i.p.v. drie aparte logs (huidige v1 heeft email_log + message_log + email_messages + email_threads — overlap)
- `outbox_events` mogelijk vervangbaar door Convex scheduler + actions (geen aparte tabel nodig)
- `webhook_events` blijft (dedupe-trail), maar `webhook_deliveries` skip (Convex heeft retry built-in)
- `cron_job_*` vervalt — Convex heeft cron API

**Geschatte data-migratie volume** (alleen MUST PORT, alleen Staycool ws12):
- `contacts` 5979 rijen
- `email_threads` 7937 rijen
- `email_messages` ~11k rijen (subset workspace)
- `message_log` 1737 rijen
- `lead_attribution` ~440 rijen
- `meta_lead_raw` 360 rijen
- `webhook_events` ~10k rijen (mogelijk niet alles porten — laatste 90d wel)
- Rest <1000 rows per tabel

Totaal: ~30-40k records voor Staycool, ETL-tijd <5 min met Convex bulk-import.

## Volgende stappen

1. **Integration-extract docs** per service (Meta / Voidfix WA / Voidfix SMS / Resend / Workflow engine / Stack Auth). Self-contained markdown per integratie zodat in v2 repo direct herbouwbaar.
2. **Convex schema** TypeScript-defs voor de ~45 in-scope tables.
3. **ETL skeleton script** Neon → Convex per tabel, idempotent via natural keys.

Marvin geeft volgorde aan; ik werk per stuk met check-ins zodat de v2-aannames niet wegdrijven.
