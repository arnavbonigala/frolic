import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findFunction,
  makeTest,
  matchState,
  publicQueries,
  seed,
  settle,
  tapById,
  type Fixture,
  type SurfaceEntry,
} from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
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

type ArgsFor = (f: Fixture, observer: string) => Record<string, unknown>;

const QUERY_REGISTRY: Record<string, ArgsFor> = {
  "frolics:today": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
    day: "2026-11-15",
  }),
  "crew:crew": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
    day: "2026-11-15",
  }),
  "crew:looking": () => ({ roomToken: "qa-room-token" }),
  "etas:forFrolic": (f, observer) => ({
    deviceToken: f.tokens[observer],
    frolicId: f.frolicId,
  }),
  "limits:mine": (f, observer) => ({ deviceToken: f.tokens[observer] }),
  "users:me": (f, observer) => ({ deviceToken: f.tokens[observer] }),
  "users:invitePreview": () => ({ inviteCode: "QACODE01" }),
  "web/share:watch": (f, observer) => ({
    code: "QACODE01",
    deviceToken: f.tokens[observer],
  }),
  "plans/queries:today": (f, observer) => ({
    token: f.tokens[observer],
    groupId: f.groupId,
    day: "2026-11-15",
  }),
  "snaps:forFrolic": (f, observer) => ({
    deviceToken: f.tokens[observer],
    frolicId: f.frolicId,
  }),
  "garden:overview": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
  }),
  "garden:onThisDay": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
  }),
  "garden:nudge": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
  }),
  "garden:memory": (f, observer) => ({
    deviceToken: f.tokens[observer],
    frolicId: f.frolicId,
  }),
  "whop/pay:myPayment": (f, observer) => ({
    deviceToken: f.tokens[observer],
    frolicId: f.frolicId,
  }),
  "drops:forPlan": (f, observer) => ({
    deviceToken: f.tokens[observer],
    frolicId: f.frolicId,
  }),
  "whop/pay:fund": (f, observer) => ({
    deviceToken: f.tokens[observer],
    groupId: f.groupId,
  }),
};

type Callable = { entry: SurfaceEntry; args: Record<string, unknown> };

async function auditSurface(t: any, f: Fixture, observer: string) {
  const entries = await publicQueries();
  const resolved: Callable[] = [];
  const unresolved: string[] = [];
  for (const entry of entries) {
    const key = `${entry.module}:${entry.name}`;
    const build = QUERY_REGISTRY[key];
    if (!build) {
      unresolved.push(`unregistered public query ${key}`);
      continue;
    }
    const args = build(f, observer);
    try {
      await t.query(entry.ref, args);
      resolved.push({ entry, args });
    } catch (err) {
      unresolved.push(`unregistered public query ${key}: ${(err as Error).message.slice(0, 120)}`);
    }
  }
  return { resolved, unresolved };
}

async function resolveQueries(t: any, f: Fixture, observer: string): Promise<Callable[]> {
  const { resolved, unresolved } = await auditSurface(t, f, observer);
  expect(
    unresolved,
    "every public query must be registered here with its real arguments, or this audit is blind to it",
  ).toEqual([]);
  expect(resolved.length, "at least one public query must exist to audit").toBeGreaterThan(0);
  const keys = resolved.map((c) => `${c.entry.module}:${c.entry.name}`);
  expect(keys.length, "every public query in the build is called by this audit").toBeGreaterThan(0);
  for (const registered of Object.keys(QUERY_REGISTRY)) {
    expect(
      keys.includes(registered),
      `the registry names ${registered}, so it must still be a public query this audit calls`,
    ).toBe(true);
  }
  return resolved;
}

async function snapshot(
  t: any,
  callables: Callable[],
  f: Fixture,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const { entry, args } of callables) {
    const key = `${entry.module}:${entry.name}`;
    try {
      out[key] = scrub(await t.query(entry.ref, args), f);
    } catch (error) {
      out[key] = { rejected: error instanceof Error ? error.message : String(error) };
    }
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

describe("privacy: another member's tap is invisible before revealAt", () => {
  it("a down tap changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    expect(
      JSON.stringify(before).length,
      "the audited queries must return real payloads, or equality here proves nothing",
    ).toBeGreaterThan(200);
    await tapById(t, f, "Maya");
    const after = await snapshot(t, callables, f);
    expect(
      after,
      "another member's query output must be identical with and without the tap",
    ).toEqual(before);
  });

  it("an onlyIf tap changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    const after = await snapshot(t, callables, f);
    expect(after, "the onlyIf list must not be observable through any query").toEqual(before);
  });

  it("a not today changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Dev");
    const before = await snapshot(t, callables, f);
    await tapById(t, f, "Maya", { kind: "notToday" });
    const after = await snapshot(t, callables, f);
    expect(after, "a pass must be indistinguishable from silence").toEqual(before);
  });

  it("a pending match changes nothing another member can query", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const pendingState = await matchState(t, f.frolicId);
    expect(pendingState.pending, "fixture needs a pending match").toBeTruthy();
    const after = await snapshot(t, callables, f);
    expect(
      after,
      "between the match and revealAt the crew must see what they saw before any tap",
    ).toEqual(before);
  });

  it("no query echoes a raw tap field", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev", { onlyIf: ["Maya"] });
    const callables = await resolveQueries(t, f, "Jordan");
    for (const { entry, args } of callables) {
      const value = await t.query(entry.ref, args);
      const text = JSON.stringify(value ?? null);
      const key = `${entry.module}:${entry.name}`;
      expect(
        /"onlyIf"|"tapKind"|"notToday"/.test(text),
        `${key} must not return raw tap fields to a client`,
      ).toBe(false);
    }
  });

  it("the reveal is the first thing that changes for the rest of the crew", async () => {
    const t = fresh();
    const f = await seed(t);
    const callables = await resolveQueries(t, f, "Jordan");
    const baseline = await snapshot(t, callables, f);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev");
    const { pending } = await matchState(t, f.frolicId);
    expect(pending, "fixture needs a pending match").toBeTruthy();
    const beforeReveal = await snapshot(t, callables, f);
    expect(
      beforeReveal,
      "with a match pending, the crew still sees exactly what they saw before any tap",
    ).toEqual(baseline);

    await settle(t);
    const atReveal = await snapshot(t, callables, f);
    expect(
      atReveal,
      "at revealAt something visible does change for the rest of the crew",
    ).not.toEqual(baseline);
    const todayKey = Object.keys(atReveal).find((k) => k.endsWith(":today"))!;
    expect(
      JSON.stringify(atReveal[todayKey]).includes("<user:Maya>"),
      "at revealAt today names who is going",
    ).toBe(true);
  });
});

describe("privacy: an unmatched yes never surfaces", () => {
  it("after a fade another member's view equals the never-tapped view", async () => {
    const quiet = fresh();
    const quietFixture = await seed(quiet, { deadlineOffset: 30 * MIN });
    const quietCallables = await resolveQueries(quiet, quietFixture, "Jordan");
    vi.setSystemTime(NOW + 31 * MIN);
    const fadeQuiet = await findFunction("fade");
    await quiet.mutation(fadeQuiet.ref, { frolicId: quietFixture.frolicId });
    const quietAfter = await snapshot(quiet, quietCallables, quietFixture);

    const tapped = fresh();
    const tappedFixture = await seed(tapped, { deadlineOffset: 30 * MIN });
    const tappedCallables = await resolveQueries(tapped, tappedFixture, "Jordan");
    await tapById(tapped, tappedFixture, "Maya");
    await tapById(tapped, tappedFixture, "Dev", { kind: "notToday" });
    vi.setSystemTime(NOW + 31 * MIN);
    await tapped.mutation(fadeQuiet.ref, { frolicId: tappedFixture.frolicId });
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
    await tapById(t, f, "Maya");
    await settle(t);
    const { frolic, pending, attendees } = await matchState(t, f.frolicId);
    expect(frolic.status, "one yes leaves the frolic open").toBe("open");
    expect(pending).toBeNull();
    expect(attendees).toHaveLength(0);
  });

  it("a member who tapped cannot tell from the crew view whether anyone else did", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Jordan");
    const callables = await resolveQueries(t, f, "Jordan");
    const before = await snapshot(t, callables, f);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    const after = await snapshot(t, callables, f);
    expect(
      after,
      "one person's pending yes must not change anything another waiting person sees",
    ).toEqual(before);
  });
});
