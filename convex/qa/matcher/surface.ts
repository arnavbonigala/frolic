import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import schema from "../../schema";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";

type T = any;

const rawModules = (import.meta as unknown as {
  glob: (pattern: string) => Record<string, () => Promise<Record<string, unknown>>>;
}).glob("/convex/**/*.ts");

export const modules: Record<string, () => Promise<Record<string, unknown>>> = rawModules;

function rawSourceMap(): Record<string, () => Promise<string>> {
  return (
    import.meta as unknown as {
      glob: (
        pattern: string,
        options: { query: string; import: string },
      ) => Record<string, () => Promise<string>>;
    }
  ).glob("/convex/**/*.ts", { query: "?raw", import: "default" });
}

export type Visibility = "public" | "internal";
export type ExportKind =
  | "query"
  | "mutation"
  | "action"
  | "internalQuery"
  | "internalMutation"
  | "internalAction";

let visibilityCache: Promise<Map<string, ExportKind>> | null = null;

export function describeExports(): Promise<Map<string, ExportKind>> {
  if (visibilityCache) return visibilityCache;
  visibilityCache = (async () => {
    const map = new Map<string, ExportKind>();
    const rawSources = rawSourceMap();
    const paths = new Set([...Object.keys(rawSources), ...Object.keys(modules)]);
    for (const path of paths) {
      const read = rawSources[path];
      if (SKIP.some((s) => path.includes(s))) continue;
      if (!read) continue;
      const source = await read();
      const module = toModuleName(path);
      const pattern =
        /export\s+const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(internalQuery|query|internalMutation|mutation|internalAction|action)\s*\(/g;
      for (const match of source.matchAll(pattern)) {
        map.set(`${module}:${match[1]}`, match[2] as ExportKind);
      }
    }
    return map;
  })();
  return visibilityCache;
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

const SKIP = ["_generated", "/qa/", "node_modules", "convex.config", "schema.ts", "http.ts", "crons.ts"];

function toModuleName(path: string): string {
  return path.replace(/^\/convex\//, "").replace(/\.ts$/, "");
}

export type SurfaceEntry = {
  name: string;
  module: string;
  ref: FunctionReference<any>;
};

let cache: Promise<SurfaceEntry[]> | null = null;

export function discoverSurface(): Promise<SurfaceEntry[]> {
  if (cache) return cache;
  cache = (async () => {
    const entries: SurfaceEntry[] = [];
    for (const path of Object.keys(rawModules)) {
      if (SKIP.some((s) => path.includes(s))) continue;
      let mod: Record<string, unknown>;
      try {
        mod = (await rawModules[path]()) as Record<string, unknown>;
      } catch {
        continue;
      }
      const module = toModuleName(path);
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value !== "function") continue;
        entries.push({
          name,
          module,
          ref: makeFunctionReference(`${module}:${name}`) as FunctionReference<any>,
        });
      }
    }
    return entries;
  })();
  return cache;
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
