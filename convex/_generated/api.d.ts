/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checkins from "../checkins.js";
import type * as clock from "../clock.js";
import type * as crew from "../crew.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as e2e_admin from "../e2e/admin.js";
import type * as e2e_routes from "../e2e/routes.js";
import type * as etas from "../etas.js";
import type * as frolics from "../frolics.js";
import type * as http from "../http.js";
import type * as keiki_outbound from "../keiki/outbound.js";
import type * as keiki_routes from "../keiki/routes.js";
import type * as lib_core from "../lib/core.js";
import type * as lib_hooks from "../lib/hooks.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_matcher from "../lib/matcher.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as limits from "../limits.js";
import type * as memory_account from "../memory/account.js";
import type * as memory_client from "../memory/client.js";
import type * as memory_context from "../memory/context.js";
import type * as memory_events from "../memory/events.js";
import type * as memory_fakeSupermemory from "../memory/fakeSupermemory.js";
import type * as memory_ingest from "../memory/ingest.js";
import type * as memory_mapping from "../memory/mapping.js";
import type * as memory_read from "../memory/read.js";
import type * as memory_stats from "../memory/stats.js";
import type * as memory_taste from "../memory/taste.js";
import type * as plans_crons from "../plans/crons.js";
import type * as reveal from "../reveal.js";
import type * as snaps from "../snaps.js";
import type * as taps from "../taps.js";
import type * as users from "../users.js";
import type * as web_devSeed from "../web/devSeed.js";
import type * as web_hero from "../web/hero.js";
import type * as web_heroes from "../web/heroes.js";
import type * as web_ogImage from "../web/ogImage.js";
import type * as web_pageTemplate from "../web/pageTemplate.js";
import type * as web_routes from "../web/routes.js";
import type * as web_share from "../web/share.js";
import type * as whop_money from "../whop/money.js";
import type * as whop_routes from "../whop/routes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checkins: typeof checkins;
  clock: typeof clock;
  crew: typeof crew;
  crons: typeof crons;
  daily: typeof daily;
  "e2e/admin": typeof e2e_admin;
  "e2e/routes": typeof e2e_routes;
  etas: typeof etas;
  frolics: typeof frolics;
  http: typeof http;
  "keiki/outbound": typeof keiki_outbound;
  "keiki/routes": typeof keiki_routes;
  "lib/core": typeof lib_core;
  "lib/hooks": typeof lib_hooks;
  "lib/identity": typeof lib_identity;
  "lib/matcher": typeof lib_matcher;
  "lib/rateLimits": typeof lib_rateLimits;
  limits: typeof limits;
  "memory/account": typeof memory_account;
  "memory/client": typeof memory_client;
  "memory/context": typeof memory_context;
  "memory/events": typeof memory_events;
  "memory/fakeSupermemory": typeof memory_fakeSupermemory;
  "memory/ingest": typeof memory_ingest;
  "memory/mapping": typeof memory_mapping;
  "memory/read": typeof memory_read;
  "memory/stats": typeof memory_stats;
  "memory/taste": typeof memory_taste;
  "plans/crons": typeof plans_crons;
  reveal: typeof reveal;
  snaps: typeof snaps;
  taps: typeof taps;
  users: typeof users;
  "web/devSeed": typeof web_devSeed;
  "web/hero": typeof web_hero;
  "web/heroes": typeof web_heroes;
  "web/ogImage": typeof web_ogImage;
  "web/pageTemplate": typeof web_pageTemplate;
  "web/routes": typeof web_routes;
  "web/share": typeof web_share;
  "whop/money": typeof whop_money;
  "whop/routes": typeof whop_routes;
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

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
