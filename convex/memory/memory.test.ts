/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";
import { createFake } from "./fakeSupermemory";
import { groupNamespace, personalNamespace } from "./mapping";

const modules = Object.fromEntries(Object.entries(import.meta.glob("../**/*.ts")).map(([k, v]) => [k.startsWith("./") ? "./memory/" + k.slice(2) : k.replace("../", "./"), v]));
declare const process: { env: Record<string, string | undefined> };

let fake: ReturnType<typeof createFake>;
beforeEach(() => {
  vi.useFakeTimers();
  fake = createFake();
  vi.stubGlobal("fetch", fake.handler);
  process.env.SUPERMEMORY_API_KEY = "test";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const maya = await ctx.db.insert("users", { name: "Maya", source: "app" });
    const dev = await ctx.db.insert("users", { name: "Dev", source: "app" });
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy: maya, timezone: "America/Los_Angeles" });
    return { maya, dev, groupId };
  });
  return { t, ...ids };
}

const flush = (t: Awaited<ReturnType<typeof seed>>["t"], eventId: never) => t.action(internal.memory.ingest.flushEvent, { eventId });

describe("ingest", () => {
  test("recordEvent is idempotent by eventKey", async () => {
    const { t, maya, groupId } = await seed();
    const a = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:1", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    const b = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:1", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    expect(a.queued).toBe(true);
    expect(b.queued).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("memoryEvents").collect())).toHaveLength(1);
  });

  test("a tap reaches the personal namespace only", async () => {
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:2", kind: "tap", groupId, userId: maya, payload: { title: "Indian Rock", tags: ["sunset"] } });
    expect(await flush(t, eventId as never)).toEqual({ status: "sent" });
    expect(fake.texts(personalNamespace(maya))).toEqual(["Tapped I'm down on Indian Rock (sunset)."]);
    expect(fake.docs.has(groupNamespace(groupId))).toBe(false);
    expect([...fake.docs.keys()].every((k) => k.startsWith("frolic_p_"))).toBe(true);
  });

  test("limits, skips and only-if stay personal and never touch the group namespace", async () => {
    const { t, maya, groupId } = await seed();
    for (const [key, kind, payload] of [
      ["l", "limit", { text: "No car. Vegetarian. Under 10 dollars." }],
      ["s", "skip", { title: "Boba", tags: ["boba"] }],
      ["o", "only_if", { title: "Boba", onlyIfNames: ["Dev"] }],
    ] as const) {
      const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: key, kind, groupId, userId: maya, payload });
      await flush(t, eventId as never);
    }
    expect(fake.docs.has(groupNamespace(groupId))).toBe(false);
    expect(fake.texts(personalNamespace(maya))).toHaveLength(3);
    const writesToGroup = fake.calls.filter((c) => c.path.startsWith("/ns/" + groupNamespace(groupId)) && c.path.endsWith("/document"));
    expect(writesToGroup).toEqual([]);
  });

  test("a reveal event is held until revealAt and then writes the group and each member", async () => {
    const { t, maya, dev, groupId } = await seed();
    const revealAt = Date.now() + 60_000;
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "reveal:1", kind: "reveal", groupId, revealAt,
      payload: { title: "Indian Rock", tags: ["sunset"], memberIds: [maya, dev], memberNames: ["Maya", "Dev"], day: "2026-11-15" },
    });
    expect(await flush(t, eventId as never)).toEqual({ status: "skipped" });
    expect(fake.calls.filter((c) => c.path.endsWith("/document"))).toEqual([]);
    await t.run((ctx) => ctx.db.patch("memoryEvents", eventId as never, { nextAttemptAt: Date.now() - 1 }));
    expect(await flush(t, eventId as never)).toEqual({ status: "sent" });
    expect(fake.texts(groupNamespace(groupId))).toEqual(["Two friends went to Indian Rock (sunset)."]);
    expect(fake.texts(personalNamespace(dev))).toHaveLength(1);
  });

  test("namespaces are configured once with context and buckets", async () => {
    const { t, maya, groupId } = await seed();
    for (const key of ["a", "b"]) {
      const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: key, kind: "skip", groupId, userId: maya, payload: { title: "x" } });
      await flush(t, eventId as never);
    }
    expect(fake.calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    expect(fake.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  test("a failed write is retried with backoff, then succeeds without duplicates", async () => {
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:r", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    fake.mode.fail = 400;
    expect(await flush(t, eventId as never)).toEqual({ status: "retry" });
    const row = await t.run((ctx) => ctx.db.get("memoryEvents", eventId as never));
    expect(row).toMatchObject({ status: "queued", attempts: 1 });
    expect(row!.lastError).toContain("400");
    expect(row!.nextAttemptAt).toBeGreaterThan(Date.now());
    fake.mode.fail = null;
    await t.run((ctx) => ctx.db.patch("memoryEvents", eventId as never, { nextAttemptAt: Date.now() - 1 }));
    expect(await flush(t, eventId as never)).toEqual({ status: "sent" });
    expect(fake.texts(personalNamespace(maya))).toHaveLength(1);
  });

  test("a transient 503 is retried inline by the client", async () => {
    vi.useRealTimers();
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:503", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    let n = 0;
    const base = fake.handler;
    vi.stubGlobal("fetch", async (u: string, i: RequestInit) => (String(u).endsWith("/document") && n++ === 0 ? new Response("x", { status: 503 }) : base(u, i)));
    expect(await flush(t, eventId as never)).toEqual({ status: "sent" });
    expect(fake.texts(personalNamespace(maya))).toHaveLength(1);
  });

  test("after six failed attempts the event is marked failed", async () => {
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:f", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    fake.mode.fail = 400;
    let last = "";
    for (let i = 0; i < 6; i++) {
      await t.run((ctx) => ctx.db.patch("memoryEvents", eventId as never, { nextAttemptAt: Date.now() - 1 }));
      last = (await flush(t, eventId as never)).status;
    }
    expect(last).toBe("failed");
    expect(await t.run((ctx) => ctx.db.get("memoryEvents", eventId as never))).toMatchObject({ status: "failed", attempts: 6 });
  });

  test("a sent event is not sent twice", async () => {
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:once", kind: "tap", groupId, userId: maya, payload: { title: "Boba" } });
    await flush(t, eventId as never);
    expect(await flush(t, eventId as never)).toEqual({ status: "skipped" });
    expect(fake.calls.filter((c) => c.path.endsWith("/document") && c.body?.id !== "frolic_init")).toHaveLength(1);
  });

  test("flushDue finds queued events whose time has come", async () => {
    const { t, maya, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "tap:due", kind: "tap", groupId, userId: maya, payload: {} });
    await t.run((ctx) => ctx.db.patch("memoryEvents", eventId as never, { nextAttemptAt: Date.now() - 1 }));
    expect(await t.action(internal.memory.ingest.flushDue, {})).toBe(1);
  });

  test("a check-in recorded without revealAt is held to now instead of failing the check-in", async () => {
    const { t, maya, groupId } = await seed();
    const r = await t.mutation(internal.memory.events.recordEvent, { eventKey: "ci:1", kind: "checkin", groupId, userId: maya, payload: { placeName: "Indian Rock" } });
    expect(r.queued).toBe(true);
    const row = await t.run((ctx) => ctx.db.get("memoryEvents", r.eventId));
    expect(row!.revealAt).toBeDefined();
  });

  test("a reveal without revealAt is refused", async () => {
    const { t, maya, groupId } = await seed();
    await expect(t.mutation(internal.memory.events.recordEvent, { eventKey: "r0", kind: "reveal", groupId, payload: { memberIds: [maya] } })).rejects.toThrow("needs revealAt");
  });

  test("tap-derived liked tags are not published before the reveal is sent", async () => {
    const { t, maya, groupId } = await seed();
    await t.mutation(internal.memory.events.recordEvent, { eventKey: "r1", kind: "reveal", groupId, revealAt: Date.now() + 60_000, payload: { tags: ["sunset"], memberIds: [maya] } });
    expect(await t.run((ctx) => ctx.db.query("memoryTagStats").collect())).toEqual([]);
  });

  test("iMessage is accepted as an event source", async () => {
    const { t, maya, groupId } = await seed();
    const r = await t.mutation(internal.memory.events.recordEvent, { eventKey: "im:1", kind: "skip", groupId, userId: maya, payload: { title: "Boba" }, source: "imessage" });
    expect(r.queued).toBe(true);
  });
});

describe("stats and context", () => {
  async function shownDay(t: Awaited<ReturnType<typeof seed>>["t"], ids: { maya: never; dev: never; groupId: never }, day: string, skips = 2, reveal = false) {
    const frolicId = await t.run(async (ctx) => {
      const place = await ctx.db.insert("places", {
        slug: "boba-" + day, name: "Boba Guys", lat: 0, lng: 0, cost: 8, tags: ["boba"], hours: [], indoor: true, sober: true,
        title: "Boba run", address: "Telegraph Ave", costPerPersonCents: 800, costLabel: "$8 each", payUpFront: false,
        priceVerified: true, energy: "chill", needsDaylight: false, durationMinutes: 60, meetSpot: "Telegraph Ave", source: "seed",
      });
      const planId = await ctx.db.insert("plans", {
        groupId: ids.groupId, day, kind: "daily", placeId: place, title: "Boba run", line: "l", cost: 8, startsAt: 0,
        durationMinutes: 60, source: "scorer", generatedAt: 0, costLabel: "$8 each", payUpFront: false, chips: [], whySource: "template",
        whyInputs: { placeName: "Boba Guys", topTags: ["boba"], rainSwap: false }, weatherSwap: false,
      });
      return await ctx.db.insert("frolics", {
        groupId: ids.groupId, day, kind: "daily", planId, status: reveal ? "on" : "open",
        window: { start: 0, end: 1 }, durationMinutes: 60, deadline: 0, revealAt: reveal ? Date.now() : undefined,
      });
    });
    const skippers = skips >= 2 ? [ids.maya, ids.dev] : skips === 1 ? [ids.maya] : [];
    for (const userId of skippers) {
      await t.mutation(internal.memory.events.recordEvent, { eventKey: "skip:" + day + ":" + userId, kind: "skip", groupId: ids.groupId, userId, frolicId, payload: { title: "Boba run", tags: ["boba"], day } });
    }
    return t.mutation(internal.memory.stats.closeDay, { groupId: ids.groupId, day });
  }

  test("a tag skipped on two days is suppressed; closeDay is idempotent per day", async () => {
    const { t, maya, dev, groupId } = await seed();
    expect((await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-10")).counted).toEqual(["boba"]);
    expect((await t.mutation(internal.memory.stats.closeDay, { groupId, day: "2026-11-10" })).counted).toEqual([]);
    let ctxA = await t.action(internal.memory.read.getMemoryContext, { groupId, day: "2026-11-11" });
    expect(ctxA.suppressed).toEqual([]);
    expect(ctxA.skipped).toEqual([{ tag: "boba", count: 1 }]);
    await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-12");
    ctxA = await t.action(internal.memory.read.getMemoryContext, { groupId, day: "2026-11-13" });
    expect(ctxA.suppressed).toEqual(["boba"]);
    expect(ctxA.likedTags).not.toContain("boba");
  });

  test("one person passing is not the crew passing", async () => {
    const { t, maya, dev, groupId } = await seed();
    expect((await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-10", 1)).counted).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("memoryTagStats").collect())).toEqual([]);
  });

  test("a revealed day is not a group skip", async () => {
    const { t, maya, dev, groupId } = await seed();
    expect((await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-10", 2, true)).counted).toEqual([]);
  });

  test("a day nobody skipped is not a group skip", async () => {
    const { t, maya, dev, groupId } = await seed();
    expect((await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-10", 0)).counted).toEqual([]);
  });

  test("the group learns skips only as an aggregate with no person", async () => {
    const { t, maya, dev, groupId } = await seed();
    await shownDay(t, { maya: maya as never, dev: dev as never, groupId: groupId as never }, "2026-11-10");
    const events = await t.run((ctx) => ctx.db.query("memoryEvents").collect());
    const gs = events.find((e) => e.kind === "group_skip")!;
    expect(gs.userId).toBeUndefined();
    await t.action(internal.memory.ingest.flushEvent, { eventId: gs._id });
    expect(fake.texts(groupNamespace(groupId))).toEqual(["The crew passed on boba 1 time."]);
  });

  test("context is cached per group per day and invalidated by a reveal", async () => {
    const { t, maya, groupId } = await seed();
    await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    const searches = () => fake.calls.filter((c) => c.path.endsWith("/search")).length;
    expect(searches()).toBe(1);
    await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(searches()).toBe(1);
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "rev", kind: "reveal", groupId, revealAt: Date.now() + 60_000, payload: { title: "Rock", tags: ["sunset"], memberIds: [maya] } });
    await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(searches()).toBe(1);
    await t.run((ctx) => ctx.db.patch("memoryEvents", eventId as never, { nextAttemptAt: Date.now() - 1 }));
    await t.action(internal.memory.ingest.flushEvent, { eventId });
    const c = await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(searches()).toBe(2);
    expect(c.likedTags).toEqual(["sunset"]);
  });

  test("a missing key or an outage falls back to the Convex counters and is not cached", async () => {
    const { t, groupId } = await seed();
    await t.run((ctx) => ctx.db.insert("memoryTagStats", { groupId, tag: "boba", liked: 0, skipped: 2, updatedAt: 0 }));
    delete process.env.SUPERMEMORY_API_KEY;
    const noKey = await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(noKey.suppressed).toEqual(["boba"]);
    expect(noKey.skipped).toEqual([{ tag: "boba", count: 2 }]);
    process.env.SUPERMEMORY_API_KEY = "test";
    fake.mode.fail = 503;
    const outage = await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(outage.suppressed).toEqual(["boba"]);
    expect(await t.run((ctx) => ctx.db.query("memoryContextCache").collect())).toEqual([]);
    fake.mode.fail = null;
    await t.action(internal.memory.read.getMemoryContext, { groupId, day: "d" });
    expect(await t.run((ctx) => ctx.db.query("memoryContextCache").collect())).toHaveLength(1);
  });

  test("whyThis cites a real stored night", async () => {
    const { t, maya, dev, groupId } = await seed();
    const { eventId } = await t.mutation(internal.memory.events.recordEvent, {
      eventKey: "rev:why", kind: "reveal", groupId, revealAt: Date.now() - 1,
      payload: { title: "Marina", tags: ["sunset"], memberIds: [maya, dev], memberNames: ["Maya", "Dev"] },
    });
    await t.action(internal.memory.ingest.flushEvent, { eventId });
    const why = await t.action(internal.memory.read.whyThis, { groupId, tags: ["sunset"] });
    expect(why?.text).toBe("Two friends went to Marina (sunset).");
    expect(await t.action(internal.memory.read.whyThis, { groupId, tags: ["bowling"] })).toBeNull();
  });

  test("tasteProfile falls back to a house-voice template, never a raw tag list", async () => {
    const { t, maya, groupId } = await seed();
    await t.mutation(internal.memory.events.recordEvent, { eventKey: "rv", kind: "reveal", groupId, revealAt: Date.now() - 1, payload: { title: "Rock", tags: ["sunset"], memberIds: [maya] } });
    const rows = await t.run((ctx) => ctx.db.query("memoryEvents").collect());
    await t.action(internal.memory.ingest.flushEvent, { eventId: rows[0]._id });
    const taste = await t.action(internal.memory.read.tasteProfile, { groupId });
    expect(taste).toMatchObject({ headline: "Sunset Crew", source: "template", storedAt: null });
    expect(taste.inputs.topTags).toEqual(["sunset"]);
    expect(fake.calls.some((c) => c.path === "/ns/" + groupNamespace(groupId) + "/profile")).toBe(true);
  });

  test("a stored device line wins and carries its source", async () => {
    const { t, groupId } = await seed();
    await t.mutation(internal.memory.read.setTasteHeadline, { groupId, headline: "Sunset Crew", why: "Golden-hour chasers, under 10 dollars.", source: "device" });
    const taste = await t.action(internal.memory.read.tasteProfile, { groupId });
    expect(taste).toMatchObject({ headline: "Sunset Crew", why: "Golden-hour chasers, under 10 dollars.", source: "device" });
    expect(taste.storedAt).toBeGreaterThan(0);
    expect(await t.run((ctx) => ctx.db.query("tasteProfiles").collect())).toHaveLength(1);
  });

  test("setTasteHeadline rejects copy that breaks the rules and overwrites on update", async () => {
    const { t, groupId } = await seed();
    await expect(t.mutation(internal.memory.read.setTasteHeadline, { groupId, headline: "Sunset Crew!", why: "ok", source: "device" })).rejects.toThrow("exclamation");
    await t.mutation(internal.memory.read.setTasteHeadline, { groupId, headline: "A", why: "b", source: "device" });
    await t.mutation(internal.memory.read.setTasteHeadline, { groupId, headline: "Fresh Air Club", why: "Happiest outside.", source: "template" });
    expect(await t.query(internal.memory.read.storedTasteLine, { groupId })).toMatchObject({ headline: "Fresh Air Club", source: "template" });
    expect(await t.run((ctx) => ctx.db.query("tasteProfiles").collect())).toHaveLength(1);
  });

  test("recentFrolics returns on and done frolics with their plan title", async () => {
    const { t, maya, groupId } = await seed();
    await t.run(async (ctx) => {
      const place = await ctx.db.insert("places", {
        slug: "p", name: "Indian Rock", lat: 0, lng: 0, cost: 0, tags: ["sunset"], hours: [], indoor: false, sober: true,
        title: "Sunset at Indian Rock", address: "Indian Rock Path", costPerPersonCents: 0, costLabel: "Free", payUpFront: false,
        priceVerified: true, energy: "chill", needsDaylight: true, durationMinutes: 60, meetSpot: "Indian Rock Path", source: "seed",
      });
      const planId = await ctx.db.insert("plans", {
        groupId, day: "2026-11-14", kind: "daily", placeId: place, title: "Sunset at Indian Rock", line: "l", cost: 0, startsAt: 0,
        durationMinutes: 60, source: "scorer", generatedAt: 0, costLabel: "Free", payUpFront: false, chips: [], whySource: "template",
        whyInputs: { placeName: "Indian Rock", topTags: ["sunset"], rainSwap: false }, weatherSwap: false,
      });
      await ctx.db.insert("frolics", { groupId, day: "2026-11-14", kind: "daily", planId, status: "done", window: { start: 0, end: 1 }, durationMinutes: 60, deadline: 0 });
      await ctx.db.insert("frolics", { groupId, day: "2026-11-15", kind: "daily", status: "open", window: { start: 0, end: 1 }, durationMinutes: 60, deadline: 0 });
    });
    expect(await t.query(internal.memory.read.recentFrolics, { groupId })).toEqual([{ day: "2026-11-14", title: "Sunset at Indian Rock" }]);
    void maya;
  });
});

describe("account deletion", () => {
  test("removes the person's container and rows but not the group's", async () => {
    const { t, maya, groupId } = await seed();
    for (const [k, kind] of [["a", "tap"], ["b", "skip"]] as const) {
      const { eventId } = await t.mutation(internal.memory.events.recordEvent, { eventKey: k, kind, groupId, userId: maya, payload: { title: "x" } });
      await flush(t, eventId as never);
    }
    const { eventId: gid } = await t.mutation(internal.memory.events.recordEvent, { eventKey: "plan", kind: "plan_shown", groupId, payload: { title: "x" } });
    await t.action(internal.memory.ingest.flushEvent, { eventId: gid });
    const res = await t.action(internal.memory.account.deleteAccountMemory, { userId: maya });
    expect(res.deletedDocuments).toBe(2);
    expect(fake.docs.has(personalNamespace(maya))).toBe(false);
    expect(fake.docs.has(groupNamespace(groupId))).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("memoryEvents").withIndex("by_userId", (q) => q.eq("userId", maya)).collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("memoryContainers").withIndex("by_userId", (q) => q.eq("userId", maya)).collect())).toEqual([]);
  });

  test("a missing container is not an error", async () => {
    const { t, maya } = await seed();
    expect((await t.action(internal.memory.account.deleteAccountMemory, { userId: maya })).deletedDocuments).toBe(0);
  });
});
