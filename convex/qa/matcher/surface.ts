import { makeFunctionReference } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";

type T = any;

const moduleMap = (import.meta as unknown as {
  glob: (pattern: string) => Record<string, () => Promise<Record<string, unknown>>>;
}).glob("../../**/*.ts");

const SKIP = ["_generated", "/qa/", "node_modules", "convex.config", "schema.ts", "http.ts", "crons.ts"];

function toModuleName(path: string): string {
  return path.replace(/^\.\.\/\.\.\//, "").replace(/\.ts$/, "");
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
    for (const path of Object.keys(moduleMap)) {
      if (SKIP.some((s) => path.includes(s))) continue;
      let mod: Record<string, unknown>;
      try {
        mod = (await moduleMap[path]()) as Record<string, unknown>;
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
  tap: ["taps", "matcher/taps", "matcher/tap", "matcher", "matcher/index"],
  untap: ["taps", "matcher/taps", "matcher/untap", "matcher", "matcher/index"],
  hopIn: ["matcher/hopIn", "matcher/hopin", "hopIn", "frolics", "matcher"],
  bail: ["matcher/bail", "matcher/hopIn", "bail", "frolics", "matcher"],
  reveal: ["matcher/reveal", "reveal", "matcher/lifecycle", "matcher"],
  runReveal: ["matcher/reveal", "reveal", "matcher/lifecycle", "matcher"],
  match: ["matcher/match", "matcher/engine", "matcher"],
  selectSet: ["matcher/match", "matcher/engine", "matcher"],
  today: ["matcher/queries", "frolics", "today", "matcher"],
  frolic: ["matcher/queries", "frolics", "today", "matcher"],
  myTap: ["matcher/queries", "taps", "matcher"],
  crew: ["crew", "matcher/queries", "groups"],
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
  const preferred = PREFERRED_MODULE[name] ?? [];
  for (const mod of preferred) {
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

export type Fixture = {
  groupId: Id<"groups">;
  frolicId: Id<"frolics">;
  planId: Id<"plans">;
  placeId: Id<"places">;
  users: Record<string, Id<"users">>;
  ids: Id<"users">[];
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

export async function seed(t: T, options: SeedOptions = {}): Promise<Fixture> {
  const names = options.names ?? ["Maya", "Dev", "Jordan", "Priya", "Sam"];
  const now = options.now ?? Date.UTC(2026, 10, 15, 19, 0, 0);
  const windowStart = now + (options.windowStartOffset ?? HOUR);
  const windowEnd = now + (options.windowEndOffset ?? 5 * HOUR);

  return await t.run(async (ctx: any) => {
    const users: Record<string, Id<"users">> = {};
    const ids: Id<"users">[] = [];
    for (const name of names) {
      const userId = await ctx.db.insert("users", { name, source: "app" });
      users[name] = userId;
      ids.push(userId);
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
      lat: 37.8936,
      lng: -122.2764,
      cost: 0,
      tags: ["sunset", "free"],
      hours: [{ day: 6, open: 0, close: 24 }],
      indoor: false,
      sober: true,
    });

    const planId = await ctx.db.insert("plans", {
      groupId,
      day: "2026-11-15",
      kind: "daily",
      placeId,
      title: "Sunset at Indian Rock",
      line: "Clear and 64",
      cost: 0,
      startsAt: windowStart,
      durationMinutes: options.durationMinutes ?? 120,
      source: "scorer",
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

    return { groupId, frolicId, planId, placeId, users, ids };
  });
}

export async function tapAs(
  t: T,
  fixture: Fixture,
  who: string,
  args: {
    kind?: "down" | "notToday";
    onlyIf?: string[];
    window?: { start: number; end: number };
    source?: "app" | "web" | "notification" | "imessage";
  } = {},
): Promise<unknown> {
  const { ref } = await findFunction("tap");
  return await t.mutation(ref, {
    frolicId: fixture.frolicId,
    userId: fixture.users[who],
    kind: args.kind ?? "down",
    onlyIf: (args.onlyIf ?? []).map((n) => fixture.users[n]),
    window: args.window,
    source: args.source ?? "app",
  });
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

export async function readFrolic(
  t: T,
  frolicId: Id<"frolics">,
) {
  return await t.run(async (ctx: any) => await ctx.db.get("frolics", frolicId));
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

export async function publicQueryNames(): Promise<SurfaceEntry[]> {
  const all = await discoverSurface();
  return all.filter((e) => /^(today|frolic|frolics|crew|group|groups|myTap|tap|attendees|whoIsFree|free|presence|activity)$/i.test(e.name));
}
