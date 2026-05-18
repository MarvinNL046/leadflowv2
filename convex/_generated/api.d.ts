/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as contacts from "../contacts.js";
import type * as http from "../http.js";
import type * as messaging from "../messaging.js";
import type * as metaIngest from "../metaIngest.js";
import type * as metaProcessor from "../metaProcessor.js";
import type * as migration from "../migration.js";
import type * as notes from "../notes.js";
import type * as opportunities from "../opportunities.js";
import type * as pipelines from "../pipelines.js";
import type * as userProfiles from "../userProfiles.js";
import type * as workflowEngine from "../workflowEngine.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  contacts: typeof contacts;
  http: typeof http;
  messaging: typeof messaging;
  metaIngest: typeof metaIngest;
  metaProcessor: typeof metaProcessor;
  migration: typeof migration;
  notes: typeof notes;
  opportunities: typeof opportunities;
  pipelines: typeof pipelines;
  userProfiles: typeof userProfiles;
  workflowEngine: typeof workflowEngine;
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
