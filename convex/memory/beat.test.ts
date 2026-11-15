import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PLACE_BY_SLUG } from "../places/data";
import { localTimeToMs } from "../plans/time";
import { makeT, token } from "../tests/setup.helpers";
import { createFake } from "./fakeSupermemory";
import { groupNamespace } from "./mapping";

declare const process: { env: Record<string, string | undefined> };

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);
const HOUR = 60 * 60 * 1000;

let fake: ReturnType<typeof createFake>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  fake = createFake();
  vi.stubGlobal("fetch", fake.handler);
  process.env.SUPERMEMORY_API_KEY = "test-key";
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.SUPERMEMORY_API_KEY;
});

async function crew() {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const created = await t.mutation(api.users.createGroup, { deviceToken: token("Maya"), firstName: "Maya", groupName: "Sunset Crew" });
  const joined = await t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: created.inviteCode });
  await t.run(async (ctx) => {
    for (const userId of [created.userId, joined.userId]) {
      await ctx.db.insert("availability", { groupId: created.groupId, userId, day: DAY, state: "now", updatedAt: NOON });
    }
  });
  return { t, groupId: created.groupId, maya: created.userId, dev: joined.userId };
}

type Crew = Awaited<ReturnType<typeof crew>>;

async function bobaDay(c: Crew, day: string, skippers: string[]) {
  const { t, groupId } = c;
  const frolicId = await t.run(async (ctx) => {
    const place = (await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", "plentea")).take(1))[0];
    const planId = await ctx.db.insert("plans", {
      groupId, day, kind: "daily", placeId: place._id, title: "Boba at Plentea", line: "Open till 11.", cost: 8, startsAt: NOON + 5 * HOUR,
      durationMinutes: 30, source: "scorer", generatedAt: NOON, costLabel: "About $8 a tea", payUpFront: false, chips: [], whySource: "template",
      whyInputs: { placeName: "Plentea", topTags: ["boba"], rainSwap: false }, weatherSwap: false,
    });
    return await ctx.db.insert("frolics", {
      groupId, day, kind: "daily", planId, status: "open", window: { start: NOON + HOUR, end: NOON + 6 * HOUR },
      durationMinutes: 30, deadline: NOON + 4 * HOUR,
    });
  });
  for (const name of skippers) await t.mutation(api.taps.tap, { deviceToken: token(name), frolicId, kind: "notToday" });
  await t.finishInProgressScheduledFunctions();
  await t.mutation(internal.memory.stats.closeDay, { groupId, day });
}

describe("the live skip beat, through the real mutations", () => {
  test("two skipped days of boba stop it, and the next drop quotes a real memory by id", async () => {
    const c = await crew();
    const { t, groupId } = c;

    await bobaDay(c, "2026-11-13", ["Maya", "Dev"]);
    let memory = await t.action(internal.plans.drop.memoryStep, { groupId, day: DAY });
    expect(memory.skipped).toEqual([{ tag: "boba", count: 1 }]);
    expect(memory.suppressed).toEqual([]);

    await bobaDay(c, "2026-11-14", ["Maya", "Dev"]);
    memory = await t.action(internal.plans.drop.memoryStep, { groupId, day: DAY });
    expect(memory.skipped).toEqual([{ tag: "boba", count: 2 }]);
    expect(memory.suppressed).toEqual(["boba"]);

    const inputs = await t.query(internal.plans.inputs.dropInputs, { groupId, day: DAY, nowMs: NOON });
    const args = { groupId, day: DAY, kind: "daily" as const, inputs, weather: null, memory };
    const first = await t.action(internal.plans.drop.pickStep, args);
    expect(first).not.toBeNull();
    const place = PLACE_BY_SLUG.get(first!.placeSlug)!;
    expect(place.tags).not.toContain("boba");

    const placeDocId = await t.run(async (ctx) => (await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", place.slug)).take(1))[0]._id);
    const night = await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "reveal:night-before",
      kind: "reveal",
      groupId,
      revealAt: NOON - 1000,
      payload: { title: place.title, placeName: place.name, placeId: placeDocId, tags: place.tags, memberIds: [c.maya, c.dev], day: "2026-11-01" },
    });
    expect(await t.action(internal.memory.ingest.flushEvent, { eventId: night.eventId })).toEqual({ status: "sent" });
    expect([...(fake.docs.get(groupNamespace(groupId))?.values() ?? [])].some((d) => d.content.includes(place.name))).toBe(true);

    const workflowId = await t.mutation(internal.plans.drop.startDrop, { groupId, day: DAY, kind: "daily" });
    expect(workflowId).not.toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run(async (ctx) => await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", DAY)).take(5));
    expect(rows).toHaveLength(1);
    const stored = await t.run(async (ctx) => await ctx.db.get("places", rows[0].placeId));
    expect(stored!.tags).not.toContain("boba");
    expect(rows[0].whySource).toBe("memory");
    expect(rows[0].whyMemoryId).toMatch(/^mem_/);
    const cited = [...(fake.docs.get(groupNamespace(groupId))?.values() ?? [])].find((d) => "mem_" + d.id === rows[0].whyMemoryId);
    expect(cited?.content).toContain(place.name);
    expect(rows[0].why).toContain(place.name);
  });

  test("the e2e beat helper suppresses boba for a seeded run and refuses an unknown run", async () => {
    const t = makeT();
    await t.mutation(internal.places.seed.seedPlaces, {});
    await t.mutation(internal.e2e.admin.seed, { run: "beat1", scenario: "demo" });
    const done = await t.mutation(internal.memory.e2eBeat.skipBobaTwice, { run: "beat1" });
    expect(done).toEqual({ suppressed: ["boba"], days: ["2026-11-01", "2026-11-02"] });
    expect(await t.mutation(internal.memory.e2eBeat.skipBobaTwice, { run: "nope" })).toBeNull();
  });

  test("one person passing twice does not stop it", async () => {
    const c = await crew();
    await bobaDay(c, "2026-11-13", ["Maya"]);
    await bobaDay(c, "2026-11-14", ["Maya"]);
    const memory = await c.t.action(internal.plans.drop.memoryStep, { groupId: c.groupId, day: DAY });
    expect(memory.suppressed).toEqual([]);
    expect(memory.skipped).toEqual([]);
  });

  test("a skipped boba and coffee place counts the primary tag only", async () => {
    const c = await crew();
    await bobaDay(c, "2026-11-13", ["Maya", "Dev"]);
    const stats = await c.t.run(async (ctx) => await ctx.db.query("memoryTagStats").collect());
    expect(stats.map((s) => s.tag)).toEqual(["boba"]);
  });

  test("the personal skip never lands in the group namespace", async () => {
    const c = await crew();
    await bobaDay(c, "2026-11-13", ["Maya", "Dev"]);
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);
    const groupTexts = [...(fake.docs.get(groupNamespace(c.groupId))?.values() ?? [])].map((d) => d.content);
    expect(groupTexts.every((x) => !x.toLowerCase().includes("passed on boba run"))).toBe(true);
  });
});
