/// <reference types="vite/client" />
import generatedApi from "../../../convex/_generated/api.d.ts?raw";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import schema from "../../../convex/schema";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";

import * as ai_cache from "../../../convex/ai/cache";
import * as ai_copy from "../../../convex/ai/copy";
import * as ai_openai from "../../../convex/ai/openai";
import * as ai_pick from "../../../convex/ai/pick";
import * as avatars_portraits from "../../../convex/avatars/portraits";
import * as avatars_routes from "../../../convex/avatars/routes";
import * as checkins from "../../../convex/checkins";
import * as clock from "../../../convex/clock";
import * as crew from "../../../convex/crew";
import * as crews from "../../../convex/crews";
import * as crons from "../../../convex/crons";
import * as daily from "../../../convex/daily";
import * as dailyPick from "../../../convex/dailyPick";
import * as dailyPickBank from "../../../convex/dailyPickBank";
import * as drops from "../../../convex/drops";
import * as e2e_admin from "../../../convex/e2e/admin";
import * as e2e_routes from "../../../convex/e2e/routes";
import * as e2e_friends from "../../../convex/e2e/friends";
import * as e2e_rehearse from "../../../convex/e2e/rehearse";
import * as etas from "../../../convex/etas";
import * as frolics from "../../../convex/frolics";
import * as garden from "../../../convex/garden";
import * as http from "../../../convex/http";
import * as keiki_auth from "../../../convex/keiki/auth";
import * as keiki_env from "../../../convex/keiki/env";
import * as keiki_imFreeCall from "../../../convex/keiki/imFreeCall";
import * as keiki_lib from "../../../convex/keiki/lib";
import * as keiki_notice from "../../../convex/keiki/notice";
import * as keiki_outbound from "../../../convex/keiki/outbound";
import * as keiki_refs from "../../../convex/keiki/refs";
import * as keiki_routes from "../../../convex/keiki/routes";
import * as keiki_tools from "../../../convex/keiki/tools";
import * as lib_copy from "../../../convex/lib/copy";
import * as lib_core from "../../../convex/lib/core";
import * as lib_crews from "../../../convex/lib/crews";
import * as lib_heroArt from "../../../convex/lib/heroArt";
import * as lib_hold from "../../../convex/lib/hold";
import * as lib_hooks from "../../../convex/lib/hooks";
import * as lib_identity from "../../../convex/lib/identity";
import * as lib_names from "../../../convex/lib/names";
import * as lib_matcher from "../../../convex/lib/matcher";
import * as lib_photo from "../../../convex/lib/photo";
import * as lib_rateLimits from "../../../convex/lib/rateLimits";
import * as limits from "../../../convex/limits";
import * as memory_account from "../../../convex/memory/account";
import * as memory_client from "../../../convex/memory/client";
import * as memory_context from "../../../convex/memory/context";
import * as memory_e2eBeat from "../../../convex/memory/e2eBeat";
import * as memory_events from "../../../convex/memory/events";
import * as memory_fakeSupermemory from "../../../convex/memory/fakeSupermemory";
import * as memory_ingest from "../../../convex/memory/ingest";
import * as memory_mapping from "../../../convex/memory/mapping";
import * as memory_read from "../../../convex/memory/read";
import * as memory_stats from "../../../convex/memory/stats";
import * as memory_taste from "../../../convex/memory/taste";
import * as memory_why from "../../../convex/memory/why";
import * as places_data from "../../../convex/places/data";
import * as places_sets_animals_nights_museums from "../../../convex/places/sets/animals_nights_museums";
import * as places_sets_classes from "../../../convex/places/sets/classes";
import * as places_sets_emeryville_alameda_games from "../../../convex/places/sets/emeryville_alameda_games";
import * as places_sets_escape_karaoke_dance from "../../../convex/places/sets/escape_karaoke_dance";
import * as places_sets_games_and_skating from "../../../convex/places/sets/games_and_skating";
import * as places_seed from "../../../convex/places/seed";
import * as plans_crons from "../../../convex/plans/crons";
import * as plans_crowd from "../../../convex/plans/crowd";
import * as plans_drop from "../../../convex/plans/drop";
import * as plans_engine from "../../../convex/plans/engine";
import * as plans_inputs from "../../../convex/plans/inputs";
import * as plans_memoryContext from "../../../convex/plans/memoryContext";
import * as plans_queries from "../../../convex/plans/queries";
import * as plans_time from "../../../convex/plans/time";
import * as plans_travel from "../../../convex/plans/travel";
import * as plans_weather from "../../../convex/plans/weather";
import * as reveal from "../../../convex/reveal";
import * as snaps from "../../../convex/snaps";
import * as taps from "../../../convex/taps";
import * as users from "../../../convex/users";
import * as web_devSeed from "../../../convex/web/devSeed";
import * as web_hero from "../../../convex/web/hero";
import * as web_heroes from "../../../convex/web/heroes";
import * as web_ogImage from "../../../convex/web/ogImage";
import * as web_pageTemplate from "../../../convex/web/pageTemplate";
import * as web_routes from "../../../convex/web/routes";
import * as web_share from "../../../convex/web/share";
import * as whop_actions from "../../../convex/whop/actions";
import * as whop_art from "../../../convex/whop/art";
import * as whop_client from "../../../convex/whop/client";
import * as whop_config from "../../../convex/whop/config";
import * as whop_links from "../../../convex/whop/links";
import * as whop_money from "../../../convex/whop/money";
import * as whop_page from "../../../convex/whop/page";
import * as whop_pay from "../../../convex/whop/pay";
import * as whop_routes from "../../../convex/whop/routes";
import * as whop_signature from "../../../convex/whop/signature";
import * as whop_split from "../../../convex/whop/split";
import * as whop_webhooks from "../../../convex/whop/webhooks";
import * as you from "../../../convex/you";

export type Visibility = "public" | "internal";
export type ExportKind =
  | "query"
  | "mutation"
  | "action"
  | "internalQuery"
  | "internalMutation"
  | "internalAction";

export type SurfaceEntry = {
  name: string;
  module: string;
  ref: FunctionReference<any>;
};

type T = any;

const MODULE_TABLE: Record<string, Record<string, unknown>> = {
  "ai/cache": ai_cache as unknown as Record<string, unknown>,
  "ai/copy": ai_copy as unknown as Record<string, unknown>,
  "ai/openai": ai_openai as unknown as Record<string, unknown>,
  "ai/pick": ai_pick as unknown as Record<string, unknown>,
  "avatars/portraits": avatars_portraits as unknown as Record<string, unknown>,
  "avatars/routes": avatars_routes as unknown as Record<string, unknown>,
  "checkins": checkins as unknown as Record<string, unknown>,
  "clock": clock as unknown as Record<string, unknown>,
  "crew": crew as unknown as Record<string, unknown>,
  "crews": crews as unknown as Record<string, unknown>,
  "crons": crons as unknown as Record<string, unknown>,
  "daily": daily as unknown as Record<string, unknown>,
  "dailyPick": dailyPick as unknown as Record<string, unknown>,
  "dailyPickBank": dailyPickBank as unknown as Record<string, unknown>,
  "drops": drops as unknown as Record<string, unknown>,
  "e2e/admin": e2e_admin as unknown as Record<string, unknown>,
  "e2e/routes": e2e_routes as unknown as Record<string, unknown>,
  "e2e/friends": e2e_friends as unknown as Record<string, unknown>,
  "e2e/rehearse": e2e_rehearse as unknown as Record<string, unknown>,
  "etas": etas as unknown as Record<string, unknown>,
  "frolics": frolics as unknown as Record<string, unknown>,
  "garden": garden as unknown as Record<string, unknown>,
  "http": http as unknown as Record<string, unknown>,
  "keiki/auth": keiki_auth as unknown as Record<string, unknown>,
  "keiki/env": keiki_env as unknown as Record<string, unknown>,
  "keiki/imFreeCall": keiki_imFreeCall as unknown as Record<string, unknown>,
  "keiki/lib": keiki_lib as unknown as Record<string, unknown>,
  "keiki/notice": keiki_notice as unknown as Record<string, unknown>,
  "keiki/outbound": keiki_outbound as unknown as Record<string, unknown>,
  "keiki/refs": keiki_refs as unknown as Record<string, unknown>,
  "keiki/routes": keiki_routes as unknown as Record<string, unknown>,
  "keiki/tools": keiki_tools as unknown as Record<string, unknown>,
  "lib/copy": lib_copy as unknown as Record<string, unknown>,
  "lib/core": lib_core as unknown as Record<string, unknown>,
  "lib/crews": lib_crews as unknown as Record<string, unknown>,
  "lib/heroArt": lib_heroArt as unknown as Record<string, unknown>,
  "lib/hold": lib_hold as unknown as Record<string, unknown>,
  "lib/hooks": lib_hooks as unknown as Record<string, unknown>,
  "lib/identity": lib_identity as unknown as Record<string, unknown>,
  "lib/names": lib_names as unknown as Record<string, unknown>,
  "lib/matcher": lib_matcher as unknown as Record<string, unknown>,
  "lib/photo": lib_photo as unknown as Record<string, unknown>,
  "lib/rateLimits": lib_rateLimits as unknown as Record<string, unknown>,
  "limits": limits as unknown as Record<string, unknown>,
  "memory/account": memory_account as unknown as Record<string, unknown>,
  "memory/client": memory_client as unknown as Record<string, unknown>,
  "memory/context": memory_context as unknown as Record<string, unknown>,
  "memory/e2eBeat": memory_e2eBeat as unknown as Record<string, unknown>,
  "memory/events": memory_events as unknown as Record<string, unknown>,
  "memory/fakeSupermemory": memory_fakeSupermemory as unknown as Record<string, unknown>,
  "memory/ingest": memory_ingest as unknown as Record<string, unknown>,
  "memory/mapping": memory_mapping as unknown as Record<string, unknown>,
  "memory/read": memory_read as unknown as Record<string, unknown>,
  "memory/stats": memory_stats as unknown as Record<string, unknown>,
  "memory/taste": memory_taste as unknown as Record<string, unknown>,
  "memory/why": memory_why as unknown as Record<string, unknown>,
  "places/data": places_data as unknown as Record<string, unknown>,
  "places/sets/animals_nights_museums": places_sets_animals_nights_museums as unknown as Record<string, unknown>,
  "places/sets/classes": places_sets_classes as unknown as Record<string, unknown>,
  "places/sets/emeryville_alameda_games": places_sets_emeryville_alameda_games as unknown as Record<string, unknown>,
  "places/sets/escape_karaoke_dance": places_sets_escape_karaoke_dance as unknown as Record<string, unknown>,
  "places/sets/games_and_skating": places_sets_games_and_skating as unknown as Record<string, unknown>,
  "places/seed": places_seed as unknown as Record<string, unknown>,
  "plans/crons": plans_crons as unknown as Record<string, unknown>,
  "plans/crowd": plans_crowd as unknown as Record<string, unknown>,
  "plans/drop": plans_drop as unknown as Record<string, unknown>,
  "plans/engine": plans_engine as unknown as Record<string, unknown>,
  "plans/inputs": plans_inputs as unknown as Record<string, unknown>,
  "plans/memoryContext": plans_memoryContext as unknown as Record<string, unknown>,
  "plans/queries": plans_queries as unknown as Record<string, unknown>,
  "plans/time": plans_time as unknown as Record<string, unknown>,
  "plans/travel": plans_travel as unknown as Record<string, unknown>,
  "plans/weather": plans_weather as unknown as Record<string, unknown>,
  "reveal": reveal as unknown as Record<string, unknown>,
  "snaps": snaps as unknown as Record<string, unknown>,
  "taps": taps as unknown as Record<string, unknown>,
  "users": users as unknown as Record<string, unknown>,
  "web/devSeed": web_devSeed as unknown as Record<string, unknown>,
  "web/hero": web_hero as unknown as Record<string, unknown>,
  "web/heroes": web_heroes as unknown as Record<string, unknown>,
  "web/ogImage": web_ogImage as unknown as Record<string, unknown>,
  "web/pageTemplate": web_pageTemplate as unknown as Record<string, unknown>,
  "web/routes": web_routes as unknown as Record<string, unknown>,
  "web/share": web_share as unknown as Record<string, unknown>,
  "whop/actions": whop_actions as unknown as Record<string, unknown>,
  "whop/art": whop_art as unknown as Record<string, unknown>,
  "whop/client": whop_client as unknown as Record<string, unknown>,
  "whop/config": whop_config as unknown as Record<string, unknown>,
  "whop/links": whop_links as unknown as Record<string, unknown>,
  "whop/money": whop_money as unknown as Record<string, unknown>,
  "whop/page": whop_page as unknown as Record<string, unknown>,
  "whop/pay": whop_pay as unknown as Record<string, unknown>,
  "whop/routes": whop_routes as unknown as Record<string, unknown>,
  "whop/signature": whop_signature as unknown as Record<string, unknown>,
  "whop/split": whop_split as unknown as Record<string, unknown>,
  "whop/webhooks": whop_webhooks as unknown as Record<string, unknown>,
  "you": you as unknown as Record<string, unknown>,
};

const AUDIT_SKIP = new Set(["http", "crons"]);

const globbed = (import.meta as unknown as {
  glob: (pattern: string) => Record<string, () => Promise<Record<string, unknown>>>;
}).glob("/convex/**/*.ts");

export const modules: Record<string, () => Promise<Record<string, unknown>>> = {
  ...globbed,
  ...Object.fromEntries(
    Object.entries(MODULE_TABLE).map(([module, value]) => [`/convex/${module}.ts`, async () => value]),
  ),
};

export function declaredModules(): string[] {
  const block = generatedApi.split("ApiFromModules<{")[1]?.split("}>;")[0] ?? "";
  return [...block.matchAll(/^\s*"?([A-Za-z0-9_/]+)"?:\s*typeof\s+[A-Za-z0-9_]+;/gm)].map((match) => match[1]);
}

export function surfaceDrift(): string[] {
  const declared = declaredModules().filter((module) => !AUDIT_SKIP.has(module));
  const listed = Object.keys(MODULE_TABLE).filter((module) => !AUDIT_SKIP.has(module));
  return [
    ...declared.filter((module) => !listed.includes(module)).map((module) => `convex/${module}.ts is missing from the audit table`),
    ...listed.filter((module) => !declared.includes(module)).map((module) => `convex/${module}.ts is in the audit table but not in api.d.ts`),
  ];
}

type Flags = { isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isPublic?: boolean; isInternal?: boolean };

function kindOf(value: unknown): ExportKind | null {
  if (typeof value !== "function") return null;
  const flags = value as Flags;
  const base = flags.isQuery ? "query" : flags.isMutation ? "mutation" : flags.isAction ? "action" : null;
  if (!base) return null;
  const internal = flags.isInternal === true || flags.isPublic === false;
  if (!internal) return base as ExportKind;
  return `internal${base.charAt(0).toUpperCase()}${base.slice(1)}` as ExportKind;
}

export async function describeExports(): Promise<Map<string, ExportKind>> {
  const map = new Map<string, ExportKind>();
  for (const [module, value] of Object.entries(MODULE_TABLE)) {
    if (AUDIT_SKIP.has(module)) continue;
    for (const [name, exported] of Object.entries(value)) {
      const kind = kindOf(exported);
      if (kind) map.set(`${module}:${name}`, kind);
    }
  }
  return map;
}

let cache: Promise<SurfaceEntry[]> | null = null;

export function discoverSurface(): Promise<SurfaceEntry[]> {
  if (cache) return cache;
  cache = (async () => {
    const entries: SurfaceEntry[] = [];
    for (const [module, value] of Object.entries(MODULE_TABLE)) {
      if (AUDIT_SKIP.has(module)) continue;
      for (const [name, exported] of Object.entries(value)) {
        if (!kindOf(exported)) continue;
        entries.push({ name, module, ref: makeFunctionReference(`${module}:${name}`) as FunctionReference<any> });
      }
    }
    return entries;
  })();
  return cache;
}

export async function publicQueries(): Promise<SurfaceEntry[]> {
  const kinds = await describeExports();
  const all = await discoverSurface();
  return all.filter((entry) => kinds.get(`${entry.module}:${entry.name}`) === "query");
}

export async function internalExports(): Promise<SurfaceEntry[]> {
  const kinds = await describeExports();
  const all = await discoverSurface();
  return all.filter((entry) =>
    String(kinds.get(`${entry.module}:${entry.name}`) ?? "").startsWith("internal"),
  );
}

export async function classifyFunctions(
  t: T,
): Promise<{ queries: SurfaceEntry[]; others: SurfaceEntry[] }> {
  const all = await discoverSurface();
  const queries: SurfaceEntry[] = [];
  const others: SurfaceEntry[] = [];
  for (const entry of all) {
    try {
      await t.query(entry.ref, {});
      queries.push(entry);
    } catch (err) {
      const message = String((err as Error)?.message ?? "");
      if (/is not a query/.test(message)) others.push(entry);
      else queries.push(entry);
    }
  }
  return { queries, others };
}

const PREFERRED_MODULE: Record<string, string[]> = {
  tapAs: ["taps"],
  tap: ["taps"],
  hopIn: ["frolics"],
  sitOut: ["frolics"],
  flip: ["reveal"],
  fade: ["reveal"],
  complete: ["reveal"],
  today: ["frolics"],
  crew: ["crew"],
  open: ["frolics"],
};

export async function findFunction(name: string): Promise<SurfaceEntry> {
  const all = await discoverSurface();
  const matches = all.filter((e) => e.name === name);
  if (matches.length === 0) {
    throw new Error(
      `MISSING FUNCTION: no module under convex/ exports "${name}". Present: ${all
        .map((e) => `${e.module}:${e.name}`)
        .join(", ")}`,
    );
  }
  for (const mod of PREFERRED_MODULE[name] ?? []) {
    const hit = matches.find((e) => e.module === mod);
    if (hit) return hit;
  }
  return matches[0];
}

export async function findOptional(...names: string[]): Promise<SurfaceEntry | null> {
  for (const name of names) {
    try {
      return await findFunction(name);
    } catch {
      continue;
    }
  }
  return null;
}

export async function mutate(t: T, names: string[], args: Record<string, unknown>): Promise<unknown> {
  const found = await findOptional(...names);
  if (!found) {
    throw new Error(`MISSING FUNCTION: none of ${names.join(", ")} is exported under convex/`);
  }
  return await t.mutation(found.ref, args);
}

export async function query(t: T, names: string[], args: Record<string, unknown>): Promise<unknown> {
  const found = await findOptional(...names);
  if (!found) {
    throw new Error(`MISSING FUNCTION: none of ${names.join(", ")} is exported under convex/`);
  }
  return await t.query(found.ref, args);
}

export function makeTest() {
  const t = convexTest(schema, modules);
  presence.register(t);
  rateLimiter.register(t);
  workflow.register(t);
  return t;
}

export async function settle(t: T, ms = 2500): Promise<void> {
  const { vi } = await import("vitest");
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}

export type Fixture = {
  groupId: Id<"groups">;
  frolicId: Id<"frolics">;
  planId: Id<"plans">;
  placeId: Id<"places">;
  users: Record<string, Id<"users">>;
  ids: Id<"users">[];
  tokens: Record<string, string>;
};

export type SeedOptions = {
  names?: string[];
  now?: number;
  windowStartOffset?: number;
  windowEndOffset?: number;
  durationMinutes?: number;
  deadlineOffset?: number;
  status?: "open" | "matched" | "on" | "faded" | "done";
  availability?: "now" | "window" | "busy" | "none";
};

const HOUR = 60 * 60 * 1000;

export function tokenFor(name: string): string {
  return `qa-device-token-${name.toLowerCase()}-0123456789abcdef`;
}

export async function seed(t: T, options: SeedOptions = {}): Promise<Fixture> {
  const names = options.names ?? ["Maya", "Dev", "Jordan", "Priya", "Sam"];
  const now = options.now ?? Date.UTC(2026, 10, 15, 19, 0, 0);
  const windowStart = now + (options.windowStartOffset ?? HOUR);
  const windowEnd = now + (options.windowEndOffset ?? 5 * HOUR);

  return await t.run(async (ctx: any) => {
    const tokenHash = async (token: string) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    };

    const users: Record<string, Id<"users">> = {};
    const ids: Id<"users">[] = [];
    const tokens: Record<string, string> = {};
    for (const name of names) {
      const token = tokenFor(name);
      const userId = await ctx.db.insert("users", {
        name,
        source: "app",
        tokenHash: await tokenHash(token),
      });
      users[name] = userId;
      ids.push(userId);
      tokens[name] = token;
    }

    const groupId = await ctx.db.insert("groups", {
      name: "Sunset Crew",
      createdBy: ids[0],
      timezone: "America/Los_Angeles",
    });

    const colors = ["pink", "cobalt", "moss", "marigold", "tomato", "lilac"];
    for (let i = 0; i < names.length; i++) {
      await ctx.db.insert("memberships", {
        groupId,
        userId: users[names[i]],
        color: colors[i % colors.length],
        joinedVia: "creator",
      });
      if ((options.availability ?? "window") !== "none") {
        await ctx.db.insert("availability", {
          groupId,
          userId: users[names[i]],
          day: "2026-11-15",
          state: options.availability ?? "window",
          window: { start: windowStart, end: windowEnd },
          minutesAway: 9,
          updatedAt: now,
        });
      }
    }

    const placeId = await ctx.db.insert("places", {
      slug: "indian-rock",
      name: "Indian Rock",
      title: "Sunset at Indian Rock",
      address: "Indian Rock Path, Berkeley",
      lat: 37.8936,
      lng: -122.2764,
      cost: 0,
      costPerPersonCents: 0,
      costLabel: "Free",
      payUpFront: false,
      priceVerified: true,
      tags: ["sunset", "free"],
      hours: [{ day: 6, open: 0, close: 24 }],
      indoor: false,
      sober: true,
      energy: "chill",
      needsDaylight: true,
      durationMinutes: options.durationMinutes ?? 120,
      meetSpot: "Top of the rock",
      source: "qa",
    });

    const planId = await ctx.db.insert("plans", {
      groupId,
      day: "2026-11-15",
      kind: "daily",
      placeId,
      title: "Sunset at Indian Rock",
      line: "Clear and 64",
      cost: 0,
      costLabel: "Free",
      payUpFront: false,
      chips: ["sunset"],
      startsAt: windowStart,
      durationMinutes: options.durationMinutes ?? 120,
      source: "scorer",
      whySource: "template",
      whyInputs: { placeName: "Indian Rock", topTags: ["sunset"], rainSwap: false },
      weatherSwap: false,
      generatedAt: now,
    });

    const frolicId = await ctx.db.insert("frolics", {
      groupId,
      day: "2026-11-15",
      kind: "daily",
      planId,
      status: options.status ?? "open",
      window: { start: windowStart, end: windowEnd },
      durationMinutes: options.durationMinutes ?? 120,
      deadline: now + (options.deadlineOffset ?? 2 * HOUR),
    });

    await ctx.db.insert("invites", {
      code: "QACODE01",
      groupId,
      createdBy: ids[0],
      kind: "frolic",
      frolicId,
      revoked: false,
    });

    return { groupId, frolicId, planId, placeId, users, ids, tokens };
  });
}

export type TapArgs = {
  kind?: "down" | "notToday";
  onlyIf?: string[];
  window?: { start: number; end: number };
  source?: "app" | "web" | "notification" | "imessage";
};

export async function tapById(t: T, f: Fixture, who: string, args: TapArgs = {}): Promise<unknown> {
  const found = await findOptional("tapAs");
  if (!found) {
    throw new Error("MISSING FUNCTION: taps.tapAs, the internal tap that takes a userId");
  }
  return await t.mutation(found.ref, {
    frolicId: f.frolicId,
    userId: f.users[who],
    kind: args.kind ?? "down",
    onlyIf: (args.onlyIf ?? []).map((n) => f.users[n]),
    window: args.window,
    source: args.source ?? "app",
  });
}

export async function tapByToken(
  t: T,
  f: Fixture,
  who: string,
  args: TapArgs = {},
  token?: string,
): Promise<unknown> {
  const { ref } = await findFunction("tap");
  return await t.mutation(ref, {
    deviceToken: token ?? f.tokens[who],
    frolicId: f.frolicId,
    kind: args.kind ?? "down",
    onlyIf: (args.onlyIf ?? []).map((n) => f.users[n]),
    window: args.window,
    source: args.source,
  });
}

export async function hopInAs(t: T, f: Fixture, who: string): Promise<unknown> {
  return await mutate(t, ["hopIn"], {
    deviceToken: f.tokens[who],
    frolicId: f.frolicId,
  });
}

export async function sitOutAs(t: T, f: Fixture, who: string): Promise<unknown> {
  return await mutate(t, ["sitOut", "bail", "cantMakeIt"], {
    deviceToken: f.tokens[who],
    frolicId: f.frolicId,
  });
}

export async function readFrolic(t: T, frolicId: Id<"frolics">) {
  return await t.run(async (ctx: any) => await ctx.db.get("frolics", frolicId));
}

export async function readPending(t: T, frolicId: Id<"frolics">) {
  return await t.run(async (ctx: any) =>
    await ctx.db
      .query("reveals")
      .withIndex("by_frolicId", (q: any) => q.eq("frolicId", frolicId))
      .unique(),
  );
}

export async function readTaps(t: T, frolicId: Id<"frolics">) {
  return await t.run(async (ctx: any) =>
    await ctx.db
      .query("taps")
      .withIndex("by_frolicId", (q: any) => q.eq("frolicId", frolicId))
      .collect(),
  );
}

export async function readAttendees(t: T, frolicId: Id<"frolics">) {
  return await t.run(async (ctx: any) =>
    await ctx.db
      .query("attendees")
      .withIndex("by_frolicId", (q: any) => q.eq("frolicId", frolicId))
      .collect(),
  );
}

export async function matchState(t: T, frolicId: Id<"frolics">) {
  const frolic = await readFrolic(t, frolicId);
  const pending = await readPending(t, frolicId);
  const attendees = await readAttendees(t, frolicId);
  return { frolic, pending, attendees };
}
