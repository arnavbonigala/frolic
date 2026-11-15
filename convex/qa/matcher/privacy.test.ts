import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import {
  discoverSurface,
  modules,
  readFrolic,
  seed,
  tapAs,
  type Fixture,
  type SurfaceEntry,
} from "./surface";



const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

const QUERY_PATTERN =
  /today|frolic|crew|group|free|presence|activity|joining|waiting|plan|feed|home|peek|myTap|tap|attendee/i;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return convexTest(schema, modules);
}

async function settle(t: any) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

function scrub(value: unknown, f: Fixture): unknown {
  const map = new Map<string, string>();
  map.set(String(f.frolicId), "<frolic>");
  map.set(String(f.groupId), "<group>");
  map.set(String(f.planId), "<plan>");
  map.set(String(f.placeId), "<place>");
  for (const [name, id] of Object.entries(f.users)) map.set(String(id), `<user:${name}>`);
  const walk = (input: unknown): unknown => {
    if (typeof input === "string") {
      const hit = map.get(input);
      if (hit) return hit;
      if (/^[a-z0-9]{28,}$/i.test(input)) return "<id>";
      return input.replace(/([a-z0-9]{28,})/gi, "<id>");
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = walk(v);
      return out;
    }
    return input;
  };
  return walk(value);
}

async function candidateArgShapes(f: Fixture, observer: string): Promise<Record<string, unknown>[]> {
  return [
    { userId: f.users[observer] },
    { userId: f.users[observer], groupId: f.groupId },
    { userId: f.users[observer], groupId: f.groupId, day: "2026-11-15" },
    { userId: f.users[observer], frolicId: f.frolicId },
    { groupId: f.groupId, day: "2026-11-15" },
    { groupId: f.groupId },
    { frolicId: f.frolicId },
    {},
  ];
}

type Callable = { entry: SurfaceEntry; args: Record<string, unknown> };

async function resolveQueries(
  t: any,
  f: Fixture,
  observer: string,
): Promise<Callable[]> {
  const { resolved, unresolved } = await auditSurface(t, f, observer);
  expect(
    unresolved,
    "every public query matching the audit pattern must be callable, or this audit is blind to it",
  ).toEqual([]);
  return resolved;
}

async function auditSurface(t: any, f: Fixture, observer: string) {
  const entries = (await discoverSurface()).filter((e) => QUERY_PATTERN.test(e.name));
  const shapes = await candidateArgShapes(f, observer);
  const resolved: Callable[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    let ok = false;
    for (const args of shapes) {
      try {
        await t.query(entry.ref, args);
        resolved.push({ entry, args });
        ok = true;
        break;
      } catch {
        continue;
      }
    }
    if (!ok) unresolved.push(`${entry.module}:${entry.name}`);
  }
  return { resolved, unresolved };
}

async function snapshot(t: any, callables: Callable[], f: Fixture): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const { entry, args } of callables) {
    const value = await t.query(entry.ref, args);
    out[`${entry.module}:${entry.name}`] = scrub(value, f);
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("privacy: a tap is invisible to everyone else before revealAt", () => {
  it("a down tap changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    expect(callables.length, "at least one public query must exist to audit").toBeGreaterThan(0);
    const before = await snapshot(t, callables, f);
    expect(
      JSON.stringify(before).length,
      "the audited queries must return real payloads, or equality here proves nothing",
    ).toBeGreaterThan(20);
    await tapAs(t, f, "Maya");
    await settle(t);
    const after = await snapshot(t, callables, f);
    expect(after, "another member's query output must be byte-identical with and without the tap").toEqual(
      before,
    );
  });

  it("an onlyIf tap changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await settle(t);
    const after = await snapshot(t, callables, f);
    expect(after, "the onlyIf list must not be observable through any query").toEqual(before);
  });

  it("a not today changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Dev");
    const before = await snapshot(t, callables, f);
    await tapAs(t, f, "Maya", { kind: "notToday" });
    await settle(t);
    const after = await snapshot(t, callables, f);
    expect(after, "a pass must be indistinguishable from silence").toEqual(before);
  });

  it("no query echoes a tap field name", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev", { onlyIf: ["Maya"] });
    await settle(t);
    const callables = await resolveQueries(t, f, "Jordan");
    for (const { entry, args } of callables) {
      const value = await t.query(entry.ref, args);
      const text = JSON.stringify(value ?? null);
      expect(
        /"onlyIf"|"taps"|"notToday"|"tapKind"/.test(text),
        `${entry.module}:${entry.name} must not return raw tap fields to a client`,
      ).toBe(false);
    }
  });

  it("the matched names stay hidden until revealAt and appear after it", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev");
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    const revealAt = frolic.revealAt as number;
    expect(revealAt, "a match must schedule a reveal").toBeGreaterThan(NOW);

    vi.setSystemTime(revealAt - 1);
    const justBefore = await snapshot(t, callables, f);
    expect(
      JSON.stringify(justBefore).includes("<user:Maya>"),
      "1ms before revealAt no query may already name a matched person",
    ).toBe(false);

    vi.setSystemTime(revealAt);
    const atReveal = await snapshot(t, callables, f);
    expect(
      JSON.stringify(atReveal).includes("<user:Maya>"),
      "at revealAt the names are visible to the rest of the crew",
    ).toBe(true);
  });
});

describe("privacy: the reveal window is not visible to the rest of the crew", () => {
  it("a member's view does not change between the match and revealAt", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "fixture needs a match").toBe("on");
    vi.setSystemTime((frolic.revealAt as number) - 1);
    const during = await snapshot(t, callables, f);
    expect(
      during,
      "between the match and revealAt the crew must see the same thing as before any tap, or the plan leaks one phone early",
    ).toEqual(before);
  });

  it("a member tapping during the reveal window cannot join the matched set", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) - 1);
    await tapAs(t, f, "Jordan").catch(() => undefined);
    const attendees = await t.run(async (ctx: any) =>
      await ctx.db
        .query("attendees")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
        .collect(),
    );
    expect(
      attendees.some((a: any) => a.userId === f.users.Jordan && a.role === "matched"),
      "a late tap is not a matched attendee, or it joins a plan that already formed without them",
    ).toBe(false);
  });
});

describe("privacy: an unmatched yes never surfaces", () => {
  it("after a fade another member's view equals the never-tapped view", async () => {
    const quiet = fresh();
    const quietFixture = await seed(quiet, { deadlineOffset: 30 * MIN });
    const quietCallables = await resolveQueries(quiet, quietFixture, "Jordan");
    vi.setSystemTime(NOW + 31 * MIN);
    const quietAfter = await snapshot(quiet, quietCallables, quietFixture);

    const tapped = fresh();
    const tappedFixture = await seed(tapped, { deadlineOffset: 30 * MIN });
    const tappedCallables = await resolveQueries(tapped, tappedFixture, "Jordan");
    await tapAs(tapped, tappedFixture, "Maya");
    await tapAs(tapped, tappedFixture, "Dev", { kind: "notToday" });
    await settle(tapped);
    vi.setSystemTime(NOW + 31 * MIN);
    await settle(tapped);
    const tappedAfter = await snapshot(tapped, tappedCallables, tappedFixture);

    const shared = Object.keys(quietAfter).filter((k) => k in tappedAfter);
    expect(shared.length).toBeGreaterThan(0);
    for (const key of shared) {
      expect(
        tappedAfter[key],
        `${key} must look the same whether or not people answered, after the deadline`,
      ).toEqual(quietAfter[key]);
    }
  });

  it("a single yes never turns the frolic into a visible near miss", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "one yes leaves the frolic open").toBe("open");
    expect(frolic.revealAt ?? null).toBeNull();
  });
});
