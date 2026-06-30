/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiAgentConfig from "../aiAgentConfig.js";
import type * as aiLeadResponse from "../aiLeadResponse.js";
import type * as aiLeadResponse_helpers from "../aiLeadResponse/helpers.js";
import type * as auth from "../auth.js";
import type * as broadcasts from "../broadcasts.js";
import type * as broadcastsLogic from "../broadcastsLogic.js";
import type * as callAttemptStage from "../callAttemptStage.js";
import type * as consent from "../consent.js";
import type * as contactSearch from "../contactSearch.js";
import type * as contacts from "../contacts.js";
import type * as crmSettings from "../crmSettings.js";
import type * as crmSettingsLogic from "../crmSettingsLogic.js";
import type * as crons from "../crons.js";
import type * as customFields from "../customFields.js";
import type * as customFieldsLogic from "../customFieldsLogic.js";
import type * as dashboardLeadVisibility from "../dashboardLeadVisibility.js";
import type * as dashboardWindow from "../dashboardWindow.js";
import type * as emailBacklog from "../emailBacklog.js";
import type * as emailBlocks from "../emailBlocks.js";
import type * as emailShell from "../emailShell.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as files from "../files.js";
import type * as followUpInterval from "../followUpInterval.js";
import type * as followupLogic from "../followupLogic.js";
import type * as followups from "../followups.js";
import type * as googleCalendar from "../googleCalendar.js";
import type * as googleCalendarLogic from "../googleCalendarLogic.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_phone from "../lib/phone.js";
import type * as marketplace_apiKeys from "../marketplace/apiKeys.js";
import type * as marketplace_dedup from "../marketplace/dedup.js";
import type * as marketplace_intake from "../marketplace/intake.js";
import type * as marketplace_leadPricing from "../marketplace/leadPricing.js";
import type * as marketplace_leadScore from "../marketplace/leadScore.js";
import type * as marketplace_phone from "../marketplace/phone.js";
import type * as marketplace_pricing from "../marketplace/pricing.js";
import type * as marketplace_provinces from "../marketplace/provinces.js";
import type * as marketplace_provinces_data from "../marketplace/provinces-data.js";
import type * as marketplace_regions from "../marketplace/regions.js";
import type * as marketplace_types from "../marketplace/types.js";
import type * as messaging from "../messaging.js";
import type * as metaIngest from "../metaIngest.js";
import type * as metaOauth from "../metaOauth.js";
import type * as metaProcessor from "../metaProcessor.js";
import type * as migration from "../migration.js";
import type * as notes from "../notes.js";
import type * as opportunities from "../opportunities.js";
import type * as pipelineStats from "../pipelineStats.js";
import type * as pipelines from "../pipelines.js";
import type * as pipelinesLogic from "../pipelinesLogic.js";
import type * as segments from "../segments.js";
import type * as segmentsLogic from "../segmentsLogic.js";
import type * as templateRender from "../templateRender.js";
import type * as unsubscribeToken from "../unsubscribeToken.js";
import type * as userProfiles from "../userProfiles.js";
import type * as websiteLeads from "../websiteLeads.js";
import type * as workflowEngine from "../workflowEngine.js";
import type * as workflowExecutions from "../workflowExecutions.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiAgentConfig: typeof aiAgentConfig;
  aiLeadResponse: typeof aiLeadResponse;
  "aiLeadResponse/helpers": typeof aiLeadResponse_helpers;
  auth: typeof auth;
  broadcasts: typeof broadcasts;
  broadcastsLogic: typeof broadcastsLogic;
  callAttemptStage: typeof callAttemptStage;
  consent: typeof consent;
  contactSearch: typeof contactSearch;
  contacts: typeof contacts;
  crmSettings: typeof crmSettings;
  crmSettingsLogic: typeof crmSettingsLogic;
  crons: typeof crons;
  customFields: typeof customFields;
  customFieldsLogic: typeof customFieldsLogic;
  dashboardLeadVisibility: typeof dashboardLeadVisibility;
  dashboardWindow: typeof dashboardWindow;
  emailBacklog: typeof emailBacklog;
  emailBlocks: typeof emailBlocks;
  emailShell: typeof emailShell;
  emailTemplates: typeof emailTemplates;
  files: typeof files;
  followUpInterval: typeof followUpInterval;
  followupLogic: typeof followupLogic;
  followups: typeof followups;
  googleCalendar: typeof googleCalendar;
  googleCalendarLogic: typeof googleCalendarLogic;
  http: typeof http;
  integrations: typeof integrations;
  "lib/crypto": typeof lib_crypto;
  "lib/env": typeof lib_env;
  "lib/phone": typeof lib_phone;
  "marketplace/apiKeys": typeof marketplace_apiKeys;
  "marketplace/dedup": typeof marketplace_dedup;
  "marketplace/intake": typeof marketplace_intake;
  "marketplace/leadPricing": typeof marketplace_leadPricing;
  "marketplace/leadScore": typeof marketplace_leadScore;
  "marketplace/phone": typeof marketplace_phone;
  "marketplace/pricing": typeof marketplace_pricing;
  "marketplace/provinces": typeof marketplace_provinces;
  "marketplace/provinces-data": typeof marketplace_provinces_data;
  "marketplace/regions": typeof marketplace_regions;
  "marketplace/types": typeof marketplace_types;
  messaging: typeof messaging;
  metaIngest: typeof metaIngest;
  metaOauth: typeof metaOauth;
  metaProcessor: typeof metaProcessor;
  migration: typeof migration;
  notes: typeof notes;
  opportunities: typeof opportunities;
  pipelineStats: typeof pipelineStats;
  pipelines: typeof pipelines;
  pipelinesLogic: typeof pipelinesLogic;
  segments: typeof segments;
  segmentsLogic: typeof segmentsLogic;
  templateRender: typeof templateRender;
  unsubscribeToken: typeof unsubscribeToken;
  userProfiles: typeof userProfiles;
  websiteLeads: typeof websiteLeads;
  workflowEngine: typeof workflowEngine;
  workflowExecutions: typeof workflowExecutions;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
