import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { createFake } from "../../memory/fakeSupermemory";
import { groupNamespace, personalNamespace } from "../../memory/mapping";
import { NOON, makeT, setupCrew, token, type T } from "../setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const MINUTE = 60 * 1000;
let probeCount = 0;
let fake: ReturnType<typeof createFake>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  fake = createFake();
  vi.stubGlobal("fetch", fake.handler);
  process.env.SUPERMEMORY_API_KEY = "test";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.SUPERMEMORY_API_KEY;
});

async function queuedEvent(
  t: T,
  groupId: Id<"groups">,
  overrides: { nextAttemptAt?: number; status?: "queued" | "sending" | "sent" | "failed"; attempts?: number; kind?: "tap" | "reveal"; payload?: unknown } = {},
): Promise<Id<"memoryEvents">> {
  return await t.run(async (ctx) =>
    await ctx.db.insert("memoryEvents", {
      eventKey: `probe:${(probeCount += 1)}`,
      kind: overrides.kind ?? "tap",
      groupId,
      payload: overrides.payload ?? { title: "Indian Rock", tags: ["sunset"] },
      status: overrides.status ?? "queued",
      attempts: overrides.attempts ?? 0,
      nextAttemptAt: overrides.nextAttemptAt ?? NOON - MINUTE,
    }),
  );
}

describe("memory event lifecycle", () => {
  test("a due event is claimed once, and a second claim waits for the lease", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const eventId = await queuedEvent(t, crew.groupId);

    const claimed = await t.mutation(internal.memory.events.claimEvent, { eventId });
    expect(claimed).toMatchObject({ _id: eventId, attempts: 1 });
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({ status: "sending", attempts: 1 });
    expect(await t.mutation(internal.memory.events.claimEvent, { eventId })).toBeNull();

    vi.advanceTimersByTime(5 * MINUTE + 1000);
    expect(await t.mutation(internal.memory.events.claimEvent, { eventId })).toMatchObject({ attempts: 2 });
    expect(await t.mutation(internal.memory.events.claimEvent, { eventId: eventId as never })).toBeNull();
  });

  test("an event scheduled for later, a sent event and a missing event are not claimable", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const later = await queuedEvent(t, crew.groupId, { nextAttemptAt: NOON + 10 * MINUTE });
    const sent = await queuedEvent(t, crew.groupId, { status: "sent" });
    expect(await t.mutation(internal.memory.events.claimEvent, { eventId: later })).toBeNull();
    expect(await t.mutation(internal.memory.events.claimEvent, { eventId: sent })).toBeNull();
    expect(await t.query(internal.memory.events.getEvent, { eventId: sent })).toMatchObject({ status: "sent" });
    expect(await t.query(internal.memory.events.getEvent, { eventId: sent })).not.toBeNull();
  });

  test("due events lists what is due and leaves the rest alone", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const due = await queuedEvent(t, crew.groupId);
    const stuck = await queuedEvent(t, crew.groupId, { status: "sending", attempts: 1 });
    const future = await queuedEvent(t, crew.groupId, { nextAttemptAt: NOON + 10 * MINUTE });
    const sent = await queuedEvent(t, crew.groupId, { status: "sent" });

    const ids = await t.query(internal.memory.events.dueEvents, {});
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([due, stuck]));
    expect(ids).not.toContain(future);
    expect(ids).not.toContain(sent);
  });

  test("mark sent counts the reveal tags and clears the day's context cache", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await t.mutation(internal.memory.read.saveCache, {
      groupId: crew.groupId,
      day: "2026-11-15",
      context: { taste: "sunset" },
    });
    const eventId = await queuedEvent(t, crew.groupId, {
      kind: "reveal",
      payload: { tags: ["Sunset", "boba", 7] },
    });

    expect(await t.mutation(internal.memory.events.markSent, { eventId })).toBeNull();
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({ status: "sent" });
    expect(await t.query(internal.memory.stats.tagStats, { groupId: crew.groupId })).toEqual([
      { tag: "boba", liked: 1, skipped: 0 },
      { tag: "sunset", liked: 1, skipped: 0 },
    ]);
    expect(await t.query(internal.memory.read.cached, { groupId: crew.groupId, day: "2026-11-15" })).toBeNull();

    await t.mutation(internal.memory.events.markSent, { eventId });
    expect(await t.query(internal.memory.stats.tagStats, { groupId: crew.groupId })).toHaveLength(2);
  });

  test("a tap event sent does not touch the tag stats", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const eventId = await queuedEvent(t, crew.groupId, { payload: { tags: ["sunset"] } });
    await t.mutation(internal.memory.events.markSent, { eventId });
    expect(await t.query(internal.memory.stats.tagStats, { groupId: crew.groupId })).toEqual([]);
  });

  test("a failure backs off fifteen seconds, doubles, then gives up after six tries", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const eventId = await queuedEvent(t, crew.groupId, { attempts: 1 });

    expect(await t.mutation(internal.memory.events.markFailed, { eventId, error: "network down" })).toEqual({
      retryInMs: 15000,
    });
    const requeued = await t.query(internal.memory.events.getEvent, { eventId });
    expect(requeued).toMatchObject({ status: "queued", lastError: "network down", attempts: 1 });
    expect(requeued!.nextAttemptAt).toBeGreaterThanOrEqual(NOON + 15000);
    expect(requeued!.nextAttemptAt).toBeLessThan(NOON + 16000);

    await t.run(async (ctx) => await ctx.db.patch("memoryEvents", eventId, { attempts: 3 }));
    expect(await t.mutation(internal.memory.events.markFailed, { eventId, error: "again" })).toEqual({
      retryInMs: 60000,
    });

    await t.run(async (ctx) => await ctx.db.patch("memoryEvents", eventId, { attempts: 6 }));
    expect(await t.mutation(internal.memory.events.markFailed, { eventId, error: "done" })).toEqual({ retryInMs: null });
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({
      status: "failed",
      lastError: "done",
    });
  });

  test("mark failed and mark sent ignore an event that is gone", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const eventId = await queuedEvent(t, crew.groupId);
    await t.run(async (ctx) => await ctx.db.delete("memoryEvents", eventId));
    expect(await t.mutation(internal.memory.events.markFailed, { eventId, error: "x" })).toBeNull();
    expect(await t.mutation(internal.memory.events.markSent, { eventId })).toBeNull();
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toBeNull();
  });
});

describe("memory ingest", () => {
  test("a namespace is not ready until it is marked ready, and marking twice keeps one row", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const containerTag = groupNamespace(crew.groupId);
    expect(await t.query(internal.memory.ingest.isReady, { containerTag })).toBe(false);

    await t.mutation(internal.memory.ingest.markReady, {
      containerTag,
      scope: "group",
      groupId: crew.groupId,
    });
    expect(await t.query(internal.memory.ingest.isReady, { containerTag })).toBe(true);
    await t.mutation(internal.memory.ingest.markReady, {
      containerTag,
      scope: "group",
      groupId: crew.groupId,
    });
    expect(await t.run(async (ctx) => await ctx.db.query("memoryContainers").collect())).toHaveLength(1);
  });

  test("flushing an event writes it once, marks it sent, and a second flush skips", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "tap:flush-1",
      kind: "tap",
      groupId: crew.groupId,
      userId: crew.ids.Maya,
      payload: { title: "Indian Rock", tags: ["sunset"] },
      revealAt: NOON,
    });

    expect(await t.action(internal.memory.ingest.flushEvent, { eventId })).toEqual({ status: "sent" });
    expect(fake.texts(personalNamespace(crew.ids.Maya))).toEqual(["Tapped I'm down on Indian Rock (sunset)."]);
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({ status: "sent" });
    expect(await t.action(internal.memory.ingest.flushEvent, { eventId })).toEqual({ status: "skipped" });
    expect(fake.texts(personalNamespace(crew.ids.Maya))).toHaveLength(1);
  });

  test("a refused write leaves the event queued for a retry, and a hard failure marks it failed", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "tap:flush-2",
      kind: "tap",
      groupId: crew.groupId,
      userId: crew.ids.Maya,
      payload: { title: "Boba" },
      revealAt: NOON,
    });

    fake.mode.fail = 400;
    expect(await t.action(internal.memory.ingest.flushEvent, { eventId })).toEqual({ status: "retry" });
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({ status: "queued", attempts: 1 });

    await t.run(async (ctx) => await ctx.db.patch("memoryEvents", eventId, { attempts: 6, nextAttemptAt: 0 }));
    expect(await t.action(internal.memory.ingest.flushEvent, { eventId })).toEqual({ status: "failed" });
    expect(await t.query(internal.memory.events.getEvent, { eventId })).toMatchObject({ status: "failed" });
    fake.mode.fail = null;
  });

  test("the flush sweep schedules a worker for each due event and counts them", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await queuedEvent(t, crew.groupId);
    await queuedEvent(t, crew.groupId);
    expect(await t.action(internal.memory.ingest.flushDue, {})).toBe(2);
    const scheduled = await t.run(
      async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (s) => s.name.replace(".js", "") === "memory/ingest:flushEvent",
        ),
    );
    expect(scheduled).toHaveLength(2);
  });
});

describe("memory context cache", () => {
  test("the cache saves one row per day and reads back what it was given", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    expect(await t.query(internal.memory.read.cached, { groupId: crew.groupId, day: "2026-11-15" })).toBeNull();

    await t.mutation(internal.memory.read.saveCache, {
      groupId: crew.groupId,
      day: "2026-11-15",
      context: { taste: "sunset" },
    });
    await t.mutation(internal.memory.read.saveCache, {
      groupId: crew.groupId,
      day: "2026-11-15",
      context: { taste: "boba" },
    });
    expect(await t.query(internal.memory.read.cached, { groupId: crew.groupId, day: "2026-11-15" })).toEqual({
      taste: "boba",
    });
    await t.mutation(internal.memory.read.saveCache, {
      groupId: crew.groupId,
      day: "2026-11-16",
      context: { taste: "sunset" },
    });
    expect(await t.run(async (ctx) => await ctx.db.query("memoryContextCache").collect())).toHaveLength(2);
  });
});

describe("account memory purge", () => {
  test("a person's queued events and containers are deleted in one pass", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "tap:maya",
      kind: "tap",
      groupId: crew.groupId,
      userId: crew.ids.Maya,
      payload: { title: "Indian Rock" },
    });
    await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "tap:dev",
      kind: "tap",
      groupId: crew.groupId,
      userId: crew.ids.Dev,
      payload: { title: "Indian Rock" },
    });
    await t.mutation(internal.memory.ingest.markReady, {
      containerTag: personalNamespace(crew.ids.Maya),
      scope: "user",
      userId: crew.ids.Maya,
    });

    expect(await t.mutation(internal.memory.account.purgeUserRows, { userId: crew.ids.Maya })).toEqual({
      events: 1,
      more: false,
    });
    const left = await t.run(async (ctx) => ({
      events: await ctx.db.query("memoryEvents").collect(),
      containers: await ctx.db.query("memoryContainers").collect(),
    }));
    expect(left.events.map((e) => e.userId)).toEqual([crew.ids.Dev]);
    expect(left.containers).toHaveLength(0);
  });

  test("deleting the memory namespace reports what it removed and tolerates a missing one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const containerTag = personalNamespace(crew.ids.Maya);
    await t.mutation(internal.memory.ingest.markReady, { containerTag, scope: "user", userId: crew.ids.Maya });
    fake.docs.set(
      containerTag,
      new Map([
        ["a", { id: "a", content: "x", metadata: {} }],
        ["b", { id: "b", content: "y", metadata: {} }],
      ]),
    );
    expect(await t.action(internal.memory.account.deleteAccountMemory, { userId: crew.ids.Maya })).toEqual({
      deletedDocuments: 2,
    });
    expect(fake.docs.has(containerTag)).toBe(false);

    expect(await t.action(internal.memory.account.deleteAccountMemory, { userId: crew.ids.Maya })).toEqual({
      deletedDocuments: 0,
    });
    expect(await t.run(async (ctx) => await ctx.db.query("memoryContainers").collect())).toHaveLength(0);
  });
});

describe("direct read helpers", () => {
  test("recent frolics keep the last five that actually happened, newest first", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => {
      for (let day = 1; day <= 7; day++) {
        await ctx.db.insert("frolics", {
          groupId: crew.groupId,
          day: `2026-11-0${day}`,
          kind: "daily",
          status: day === 6 ? "open" : "done",
          window: { start: NOON, end: NOON + 3600000 },
          durationMinutes: 60,
          deadline: NOON,
        });
      }
    });
    const recent = await t.query(internal.memory.read.recentFrolics, { groupId: crew.groupId });
    expect(recent).toHaveLength(5);
    expect(recent.map((r) => r.day)).toEqual(["2026-11-07", "2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02"]);
    expect(recent[0].title).toBe("A frolic");
  });
});

void api;
void token;
