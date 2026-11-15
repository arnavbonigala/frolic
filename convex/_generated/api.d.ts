/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_cache from "../ai/cache.js";
import type * as ai_copy from "../ai/copy.js";
import type * as ai_openai from "../ai/openai.js";
import type * as ai_pick from "../ai/pick.js";
import type * as avatars_portraits from "../avatars/portraits.js";
import type * as avatars_routes from "../avatars/routes.js";
import type * as checkins from "../checkins.js";
import type * as clock from "../clock.js";
import type * as crew from "../crew.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as dailyPick from "../dailyPick.js";
import type * as dailyPickBank from "../dailyPickBank.js";
import type * as drops from "../drops.js";
import type * as e2e_admin from "../e2e/admin.js";
import type * as e2e_routes from "../e2e/routes.js";
import type * as etas from "../etas.js";
import type * as frolics from "../frolics.js";
import type * as garden from "../garden.js";
import type * as http from "../http.js";
import type * as keiki_auth from "../keiki/auth.js";
import type * as keiki_env from "../keiki/env.js";
import type * as keiki_imFreeCall from "../keiki/imFreeCall.js";
import type * as keiki_lib from "../keiki/lib.js";
import type * as keiki_notice from "../keiki/notice.js";
import type * as keiki_outbound from "../keiki/outbound.js";
import type * as keiki_refs from "../keiki/refs.js";
import type * as keiki_routes from "../keiki/routes.js";
import type * as keiki_tools from "../keiki/tools.js";
import type * as lib_copy from "../lib/copy.js";
import type * as lib_core from "../lib/core.js";
import type * as lib_heroArt from "../lib/heroArt.js";
import type * as lib_hold from "../lib/hold.js";
import type * as lib_hooks from "../lib/hooks.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_matcher from "../lib/matcher.js";
import type * as lib_photo from "../lib/photo.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as limits from "../limits.js";
import type * as memory_account from "../memory/account.js";
import type * as memory_client from "../memory/client.js";
import type * as memory_context from "../memory/context.js";
import type * as memory_e2eBeat from "../memory/e2eBeat.js";
import type * as memory_events from "../memory/events.js";
import type * as memory_fakeSupermemory from "../memory/fakeSupermemory.js";
import type * as memory_ingest from "../memory/ingest.js";
import type * as memory_mapping from "../memory/mapping.js";
import type * as memory_read from "../memory/read.js";
import type * as memory_stats from "../memory/stats.js";
import type * as memory_taste from "../memory/taste.js";
import type * as memory_why from "../memory/why.js";
import type * as places_data from "../places/data.js";
import type * as places_seed from "../places/seed.js";
import type * as plans_crons from "../plans/crons.js";
import type * as plans_crowd from "../plans/crowd.js";
import type * as plans_drop from "../plans/drop.js";
import type * as plans_engine from "../plans/engine.js";
import type * as plans_inputs from "../plans/inputs.js";
import type * as plans_memoryContext from "../plans/memoryContext.js";
import type * as plans_queries from "../plans/queries.js";
import type * as plans_time from "../plans/time.js";
import type * as plans_travel from "../plans/travel.js";
import type * as plans_weather from "../plans/weather.js";
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
import type * as whop_actions from "../whop/actions.js";
import type * as whop_art from "../whop/art.js";
import type * as whop_client from "../whop/client.js";
import type * as whop_config from "../whop/config.js";
import type * as whop_links from "../whop/links.js";
import type * as whop_money from "../whop/money.js";
import type * as whop_page from "../whop/page.js";
import type * as whop_pay from "../whop/pay.js";
import type * as whop_routes from "../whop/routes.js";
import type * as whop_signature from "../whop/signature.js";
import type * as whop_split from "../whop/split.js";
import type * as whop_webhooks from "../whop/webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/cache": typeof ai_cache;
  "ai/copy": typeof ai_copy;
  "ai/openai": typeof ai_openai;
  "ai/pick": typeof ai_pick;
  "avatars/portraits": typeof avatars_portraits;
  "avatars/routes": typeof avatars_routes;
  checkins: typeof checkins;
  clock: typeof clock;
  crew: typeof crew;
  crons: typeof crons;
  daily: typeof daily;
  dailyPick: typeof dailyPick;
  dailyPickBank: typeof dailyPickBank;
  drops: typeof drops;
  "e2e/admin": typeof e2e_admin;
  "e2e/routes": typeof e2e_routes;
  etas: typeof etas;
  frolics: typeof frolics;
  garden: typeof garden;
  http: typeof http;
  "keiki/auth": typeof keiki_auth;
  "keiki/env": typeof keiki_env;
  "keiki/imFreeCall": typeof keiki_imFreeCall;
  "keiki/lib": typeof keiki_lib;
  "keiki/notice": typeof keiki_notice;
  "keiki/outbound": typeof keiki_outbound;
  "keiki/refs": typeof keiki_refs;
  "keiki/routes": typeof keiki_routes;
  "keiki/tools": typeof keiki_tools;
  "lib/copy": typeof lib_copy;
  "lib/core": typeof lib_core;
  "lib/heroArt": typeof lib_heroArt;
  "lib/hold": typeof lib_hold;
  "lib/hooks": typeof lib_hooks;
  "lib/identity": typeof lib_identity;
  "lib/matcher": typeof lib_matcher;
  "lib/photo": typeof lib_photo;
  "lib/rateLimits": typeof lib_rateLimits;
  limits: typeof limits;
  "memory/account": typeof memory_account;
  "memory/client": typeof memory_client;
  "memory/context": typeof memory_context;
  "memory/e2eBeat": typeof memory_e2eBeat;
  "memory/events": typeof memory_events;
  "memory/fakeSupermemory": typeof memory_fakeSupermemory;
  "memory/ingest": typeof memory_ingest;
  "memory/mapping": typeof memory_mapping;
  "memory/read": typeof memory_read;
  "memory/stats": typeof memory_stats;
  "memory/taste": typeof memory_taste;
  "memory/why": typeof memory_why;
  "places/data": typeof places_data;
  "places/seed": typeof places_seed;
  "plans/crons": typeof plans_crons;
  "plans/crowd": typeof plans_crowd;
  "plans/drop": typeof plans_drop;
  "plans/engine": typeof plans_engine;
  "plans/inputs": typeof plans_inputs;
  "plans/memoryContext": typeof plans_memoryContext;
  "plans/queries": typeof plans_queries;
  "plans/time": typeof plans_time;
  "plans/travel": typeof plans_travel;
  "plans/weather": typeof plans_weather;
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
  "whop/actions": typeof whop_actions;
  "whop/art": typeof whop_art;
  "whop/client": typeof whop_client;
  "whop/config": typeof whop_config;
  "whop/links": typeof whop_links;
  "whop/money": typeof whop_money;
  "whop/page": typeof whop_page;
  "whop/pay": typeof whop_pay;
  "whop/routes": typeof whop_routes;
  "whop/signature": typeof whop_signature;
  "whop/split": typeof whop_split;
  "whop/webhooks": typeof whop_webhooks;
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
