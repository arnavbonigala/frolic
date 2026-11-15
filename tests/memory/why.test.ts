/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import { createFake } from "../../convex/memory/fakeSupermemory";
import { groupNamespace } from "../../convex/memory/mapping";
import { PASS_MIN, WHY_MAX, citeWhy, claimsPast, oneSentence, unbackedClaim, type WhyMemory, type WhyPlace } from "../../convex/memory/why";

const modules = Object.fromEntries(
  Object.entries(import.meta.glob("/convex/**/*.ts")).map(([k, v]) => [k.startsWith("./") ? "./memory/" + k.slice(2) : k.replace("../", "./"), v]),
);
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

const DAY = "2026-11-15";
const indianRock: WhyPlace = { slug: "indian-rock", name: "Indian Rock", tags: ["sunsets", "views", "outdoors", "free"] };
const glade: WhyPlace = { slug: "memorial-glade", name: "Memorial Glade", tags: ["picnic", "outdoors", "free"] };

describe("why citation", () => {
  test("a group with no history gets no citation, so nothing claims a night they never had", () => {
    const empty: WhyMemory = { pastNights: [], skipped: [], picks: [] };
    expect(citeWhy(indianRock, empty, { day: DAY })).toBeNull();
    expect(citeWhy(indianRock, {}, { day: DAY })).toBeNull();
    for (const line of [citeWhy(indianRock, empty), citeWhy(indianRock, { skipped: [{ tag: "boba", count: 1 }] })]) expect(line).toBeNull();
  });

  test("a single past frolic is cited by place and date", () => {
    const memory: WhyMemory = { pastNights: [{ id: "m1", text: "Two friends went to Indian Rock (sunsets).", placeId: "indian-rock", date: "2026-11-12" }] };
    const cite = citeWhy(indianRock, memory, { day: DAY })!;
    expect(cite.why).toBe("You all went to Indian Rock on Nov 12.");
    expect(cite).toMatchObject({ source: "memory", memoryId: "m1", memory: "Two friends went to Indian Rock (sunsets)." });
    expect(oneSentence(cite.why)).toBe(true);
    expect(cite.why).not.toMatch(/Nov 13|Nov 11/);
  });

  test("a comeback night keeps the date and asks for it again", () => {
    const memory: WhyMemory = { pastNights: [{ id: "m1", text: "Two friends went to Indian Rock.", placeId: "indian-rock", date: "2026-10-12" }] };
    expect(citeWhy(indianRock, memory, { day: DAY, comeback: true })!.why).toBe("You all went to Indian Rock on Oct 12, so it's time to go back.");
  });

  test("three passes on the same tag are cited, two are not", () => {
    const memory: WhyMemory = { pastNights: [], skipped: [{ tag: "boba", count: PASS_MIN }], picks: [] };
    expect(citeWhy(indianRock, memory, { day: DAY })!.why).toBe("You all passed on boba three times, so tonight is Indian Rock.");
    expect(citeWhy(indianRock, { skipped: [{ tag: "boba", count: 2 }] }, { day: DAY })).toBeNull();
  });

  test("a pass on the plan's own tag is never cited", () => {
    expect(citeWhy(indianRock, { skipped: [{ tag: "sunsets", count: 4 }] }, { day: DAY })).toBeNull();
  });

  test("the group's own first answer is cited when there is no night yet", () => {
    const memory: WhyMemory = { pastNights: [], skipped: [], picks: [{ option: "tacos", tags: ["food", "late_night_food"], day: DAY }] };
    const tacos: WhyPlace = { slug: "tacos-sinaloa", name: "Tacos Sinaloa", tags: ["food", "late_night_food"] };
    const cite = citeWhy(tacos, memory, { day: DAY })!;
    expect(cite.why).toBe("You all said tacos today, so tonight is Tacos Sinaloa.");
    expect(cite.source).toBe("first_answer");
    expect(citeWhy(tacos, { ...memory, picks: [{ option: "tacos", tags: ["food"], day: "2026-11-13" }] }, { day: DAY })!.why).toBe("You all said tacos on Nov 13, so tonight is Tacos Sinaloa.");
  });

  test("a first answer about a different taste is not cited", () => {
    const memory: WhyMemory = { picks: [{ option: "boba", tags: ["boba"], day: DAY }] };
    expect(citeWhy(indianRock, memory, { day: DAY })).toBeNull();
  });

  test("the place in the line is the place in the plan", () => {
    const memory: WhyMemory = { pastNights: [{ id: "m1", text: "You all went to Indian Rock and stayed for the sunset.", placeId: "indian-rock", date: "2026-11-12" }] };
    const cite = citeWhy(glade, memory, { day: DAY });
    expect(cite).toBeNull();
    const sameName = citeWhy({ slug: "memorial-glade", name: "Memorial Glade", tags: ["picnic"] }, { pastNights: [{ id: "m2", text: "Two friends went to Indian Rock." }] }, { day: DAY });
    expect(sameName).toBeNull();
  });

  test("every line is one short sentence with no banned characters", () => {
    const lines = [
      citeWhy(indianRock, { pastNights: [{ id: "m1", text: "x", placeId: "indian-rock", date: "2026-11-12" }] }, { day: DAY })!.why,
      citeWhy(indianRock, { skipped: [{ tag: "late_night_food", count: 9 }] }, { day: DAY })!.why,
      citeWhy(indianRock, { picks: [{ option: "sunset club", tags: ["sunsets"], day: DAY }] }, { day: DAY })!.why,
    ];
    for (const line of lines) {
      expect(oneSentence(line)).toBe(true);
      expect(line.length).toBeLessThanOrEqual(WHY_MAX);
      expect(line).not.toMatch(/[\u2014\u2013!?]/);
      expect(line).not.toMatch(/\bnot\b[^.]*\bbut\b/i);
    }
    expect(lines[1]).toContain("You all passed on late night food 9 times");
  });
});

describe("why truth guard", () => {
  test("a past claim with no history behind it is rejected", () => {
    expect(unbackedClaim("you loved it here last time", {}, indianRock)).toBe(true);
    expect(unbackedClaim("you all said yes to sunsets", {}, indianRock)).toBe(true);
    expect(claimsPast("you're into sunsets, it's free, and the sky's clear until dark.")).toBe(false);
    expect(unbackedClaim("you're into sunsets, it's free, and the sky's clear until dark.", {}, indianRock)).toBe(false);
  });

  test("a past claim backed by a real night, a first answer or three passes is allowed", () => {
    expect(unbackedClaim("you loved it here last time", { pastNights: [{ id: "m1", text: "x", placeId: "indian-rock" }] }, indianRock)).toBe(false);
    expect(unbackedClaim("you all said sunset", { picks: [{ option: "sunset", tags: ["sunsets"], day: DAY }] }, indianRock)).toBe(false);
    expect(unbackedClaim("you all passed on boba", { skipped: [{ tag: "boba", count: PASS_MIN }] }, indianRock)).toBe(false);
  });
});

async function crew() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const maya = await ctx.db.insert("users", { name: "Maya", source: "app" });
    const dev = await ctx.db.insert("users", { name: "Dev", source: "app" });
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy: maya, timezone: "America/Los_Angeles" });
    const questionId = await ctx.db.insert("dailyPickQuestions", {
      key: "noodles-tacos",
      category: "food",
      text: "Tonight: noodles or tacos?",
      options: [{ label: "noodles", tags: ["late_night_food", "food"] }, { label: "tacos", tags: ["food"] }],
    });
    await ctx.db.insert("dailyPicks", { groupId, day: DAY, questionId, questionKey: "noodles-tacos", category: "food", answers: 2 });
    await ctx.db.insert("dailyPickAnswers", { groupId, day: DAY, userId: maya, option: "tacos", answeredAt: 1 });
    await ctx.db.insert("dailyPickAnswers", { groupId, day: DAY, userId: dev, option: "tacos", answeredAt: 2 });
    return { maya, dev, groupId };
  });
  return { t, ...ids };
}

describe("pick answers and the place specific citation", () => {
  test("pick answers come back with their words and tags, newest day first", async () => {
    const { t, groupId } = await crew();
    const picks = await t.query(internal.memory.why.pickAnswers, { groupId, day: DAY });
    expect(picks).toEqual([{ option: "tacos", tags: ["food"], day: DAY }]);
    expect(await t.query(internal.memory.why.pickAnswers, { groupId, day: "2026-11-16" })).toEqual([{ option: "tacos", tags: ["food"], day: DAY }]);
    expect(await t.query(internal.memory.why.pickAnswers, { groupId, day: "2026-11-20" })).toEqual([]);
  });

  test("a stored night at the place becomes one sentence with a date", async () => {
    const { t, groupId } = await crew();
    fake.docs.set(groupNamespace(groupId), new Map([
      ["night1", { id: "night1", content: "Four friends went to Indian Rock (sunsets).", metadata: { kind: "night", placeId: "indian-rock", tags: ["sunsets"], day: "2026-11-12" } }],
    ]));
    const cite = await t.action(internal.memory.read.whyCite, { groupId, day: DAY, placeSlug: "indian-rock", placeName: "Indian Rock", placeTags: ["sunsets", "views"] });
    expect(cite).toEqual({ why: "You all went to Indian Rock on Nov 12.", source: "memory", memoryId: "mem_night1", memory: "Four friends went to Indian Rock (sunsets)." });
  });

  test("a night at another place is never placed in this plan's line", async () => {
    const { t, groupId } = await crew();
    fake.docs.set(groupNamespace(groupId), new Map([
      ["night1", { id: "night1", content: "Four friends went to Indian Rock (sunsets).", metadata: { kind: "night", placeId: "indian-rock", tags: ["sunsets"], day: "2026-11-12" } }],
    ]));
    const cite = await t.action(internal.memory.read.whyCite, { groupId, day: DAY, placeSlug: "memorial-glade", placeName: "Memorial Glade", placeTags: ["picnic", "sunsets"] });
    expect(cite).toBeNull();
  });

  test("a failed or timed out memory read yields no citation instead of a guess", async () => {
    const { t, groupId } = await crew();
    fake.docs.set(groupNamespace(groupId), new Map([
      ["night1", { id: "night1", content: "Four friends went to Indian Rock (sunsets).", metadata: { kind: "night", placeId: "indian-rock", tags: ["sunsets"], day: "2026-11-12" } }],
    ]));
    fake.mode.fail = 503;
    await expect(t.action(internal.memory.read.whyCite, { groupId, day: DAY, placeSlug: "indian-rock", placeName: "Indian Rock", placeTags: ["sunsets"] })).rejects.toThrow();
    fake.mode.fail = null;
    vi.stubGlobal("fetch", () => Promise.reject(new Error("timeout")));
    await expect(t.action(internal.memory.read.whyCite, { groupId, day: DAY, placeSlug: "indian-rock", placeName: "Indian Rock", placeTags: ["sunsets"] })).rejects.toThrow(/timeout/);
    const context = await t.action(internal.memory.read.getMemoryContext, { groupId, day: DAY });
    expect(context.pastNights).toEqual([]);
    expect(context.picks).toEqual([{ option: "tacos", tags: ["food"], day: DAY }]);
    const tacos: WhyPlace = { slug: "tacos-sinaloa", name: "Tacos Sinaloa", tags: ["food", "late_night_food"] };
    expect(citeWhy(tacos, context, { day: DAY })!.why).toBe("You all said tacos today, so tonight is Tacos Sinaloa.");
  });
});
