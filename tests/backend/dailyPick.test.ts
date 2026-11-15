/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { QUESTION_BANK, chooseQuestion, smsLine } from "../../convex/dailyPickBank";
import { dropText } from "../../convex/keiki/outbound";
import { NOON, makeT, setupCrew, token, type T } from "./setup.helpers";

const DAY = 24 * 60 * 60 * 1000;
const NAMES = ["Maya", "Dev", "Jordan"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

const addDay = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

async function today(t: T, groupId: Id<"groups">, name: string) {
  return await t.query(api.dailyPick.today, { deviceToken: token(name), groupId });
}

async function force(t: T, groupId: Id<"groups">, key: string) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("dailyPicks").collect()) await ctx.db.delete("dailyPicks", row._id);
    const question = QUESTION_BANK.find((q) => q.key === key)!;
    const questionId = await ctx.db.insert("dailyPickQuestions", question);
    await ctx.db.insert("dailyPicks", { groupId, day: "2026-11-15", questionId, questionKey: key, category: question.category, answers: 0 });
  });
}

describe("question bank", () => {
  test("has at least 40 questions with 2 to 4 options and clean copy", () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(40);
    expect(new Set(QUESTION_BANK.map((q) => q.key)).size).toBe(QUESTION_BANK.length);
    for (const q of QUESTION_BANK) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(new Set(q.options.map((o) => o.label)).size).toBe(q.options.length);
      expect(q.text).not.toMatch(/[—–!]/);
      expect(q.text.endsWith("?")).toBe(true);
    }
  });

  test("choice is deterministic per crew and day", () => {
    const a = chooseQuestion("crew-a", "2026-11-15", []);
    expect(chooseQuestion("crew-a", "2026-11-15", []).key).toBe(a.key);
    const keys = new Set(["crew-a", "crew-b", "crew-c", "crew-d", "crew-e"].map((g) => chooseQuestion(g, "2026-11-15", []).key));
    expect(keys.size).toBeGreaterThan(1);
  });

  test("never repeats within 30 days and rotates categories", () => {
    const history: { day: string; key: string; category: string }[] = [];
    let day = "2026-11-01";
    for (let i = 0; i < 120; i++) {
      const q = chooseQuestion("crew-x", day, history);
      const window = history.filter((h) => h.day > addDay(day, -30));
      expect(window.map((h) => h.key)).not.toContain(q.key);
      if (history.length > 0) expect(q.category).not.toBe(history[history.length - 1].category);
      history.push({ day, key: q.key, category: q.category });
      day = addDay(day, 1);
    }
  });

  test("the text line reads like a quick one", () => {
    expect(smsLine("Tonight: noodles or tacos?")).toBe("Quick one: noodles or tacos?");
    expect(smsLine("Sunset or stars?")).toBe("Quick one: sunset or stars?");
    const text = dropText({ title: "Sunset at the Rose Garden", place: null, startsAt: "6:10", why: null, heroKey: "x" }, false, "Quick one: sunset or stars?");
    expect(text.split("\n").at(-1)).toBe("Quick one: sunset or stars?");
  });
});

describe("dailyPick", () => {
  test("results stay hidden until you answer, then show counts and flowers", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const before = await today(t, crew.groupId, "Maya");
    expect(before.day).toBe("2026-11-15");
    expect(before.myAnswer).toBeNull();
    expect(before.results).toBeNull();
    const [first, second] = before.options;

    await t.mutation(api.dailyPick.answer, { deviceToken: token("Dev"), groupId: crew.groupId, option: first });
    expect((await today(t, crew.groupId, "Maya")).results).toBeNull();

    await t.mutation(api.dailyPick.answer, { deviceToken: token("Maya"), groupId: crew.groupId, option: second.toUpperCase() });
    const after = await today(t, crew.groupId, "Maya");
    expect(after.question).toBe(before.question);
    expect(after.myAnswer).toBe(second);
    expect(after.results!.total).toBe(2);
    const row = (option: string) => after.results!.byOption.find((b) => b.option === option)!;
    expect(row(first).count).toBe(1);
    expect(row(first).people.map((p) => p.name)).toEqual(["Dev"]);
    expect(row(second).people[0]).toMatchObject({ userId: crew.ids.Maya, name: "Maya" });
    expect(after.results!.byOption.map((b) => b.option)).toEqual(before.options);
  });

  test("you can change your answer the same day and repeats are idempotent", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const { options } = await today(t, crew.groupId, "Maya");
    const answer = (option: string) => t.mutation(api.dailyPick.answer, { deviceToken: token("Maya"), groupId: crew.groupId, option });
    await answer(options[0]);
    await answer(options[0]);
    await answer(options[1]);
    const view = await today(t, crew.groupId, "Maya");
    expect(view.myAnswer).toBe(options[1]);
    expect(view.results!.total).toBe(1);
    expect(view.results!.byOption[0].count).toBe(0);
    const rows = await t.run(async (ctx) => ({
      answers: await ctx.db.query("dailyPickAnswers").collect(),
      picks: await ctx.db.query("dailyPicks").collect(),
    }));
    expect(rows.answers).toHaveLength(1);
    expect(rows.picks).toHaveLength(1);
    expect(rows.picks[0].answers).toBe(1);
  });

  test("rejects options that are not on the card, outsiders and unknown devices", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await setupCrew(t, ["Zed"]);
    await expect(
      t.mutation(api.dailyPick.answer, { deviceToken: token("Maya"), groupId: crew.groupId, option: "spaceship" }),
    ).rejects.toThrow(/BAD_OPTION|Pick one of/);
    await expect(today(t, crew.groupId, "Zed")).rejects.toThrow(/NOT_A_MEMBER|not in this crew/);
    await expect(
      t.mutation(api.dailyPick.answer, { deviceToken: token("Zed"), groupId: crew.groupId, option: "x" }),
    ).rejects.toThrow(/NOT_A_MEMBER|not in this crew/);
    await expect(today(t, crew.groupId, "Nobody")).rejects.toThrow(/UNKNOWN_DEVICE|not signed in/);
  });

  test("an answer is recorded as a memory event and nudges plan taste today and tomorrow", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await force(t, crew.groupId, "noodles-tacos");
    await t.mutation(api.dailyPick.answer, { deviceToken: token("Maya"), groupId: crew.groupId, option: "noodles" });
    const events = await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect());
    const pick = events.find((e) => e.kind === "daily_pick")!;
    expect(pick).toMatchObject({ groupId: crew.groupId, userId: crew.ids.Maya, source: "app" });
    expect(pick.payload).toMatchObject({ day: "2026-11-15", option: "noodles", question: "Tonight: noodles or tacos?" });
    expect(pick.payload.tags).toContain("late_night_food");
    for (const day of ["2026-11-15", "2026-11-16"]) {
      expect(await t.query(internal.dailyPick.pickTags, { groupId: crew.groupId, day })).toContain("late_night_food");
    }
    expect(await t.query(internal.dailyPick.pickTags, { groupId: crew.groupId, day: "2026-11-17" })).toEqual([]);
  });

  test("two answers water the garden and keep it from getting thirsty", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const overview = (name = "Maya") => t.query(api.garden.overview, { deviceToken: token(name), groupId: crew.groupId });

    vi.setSystemTime(NOON + 6 * DAY);
    expect((await overview()).health).toMatchObject({ state: "thirsty", daysSince: 6, todayWatered: false });

    const { options } = await today(t, crew.groupId, "Maya");
    await t.mutation(api.dailyPick.answer, { deviceToken: token("Maya"), groupId: crew.groupId, option: options[0] });
    expect((await overview()).health).toMatchObject({ state: "thirsty", todayWatered: false });
    await t.mutation(api.dailyPick.answer, { deviceToken: token("Dev"), groupId: crew.groupId, option: options[1] });
    expect((await overview()).health).toMatchObject({ state: "thriving", daysSince: 0, todayWatered: true });

    vi.setSystemTime(NOON + 9 * DAY);
    expect((await overview()).health).toMatchObject({ state: "fine", daysSince: 3, todayWatered: false });
    expect((await overview()).count).toBe(0);
    expect((await overview()).milestone.reached).toBeNull();
  });

  test("texters answer through Keiki and the drop text carries the question", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    await t.run(async (ctx) => {
      await ctx.db.insert("keikiLinks", { phone: "+15105550101", userId: crew.ids.Maya, paused: false, linkedAt: NOON });
    });
    await force(t, crew.groupId, "sunset-stars");
    await t.mutation(api.dailyPick.answer, { deviceToken: token("Dev"), groupId: crew.groupId, option: "stars" });
    const bad = await t.mutation(internal.keiki.tools.answerPick, { phone: "+15105550101", option: "moon" });
    expect(bad).toMatchObject({ ok: false, error: "bad_option" });
    const res = await t.mutation(internal.keiki.tools.answerPick, { phone: "+15105550101", option: "Sunset" });
    expect(res).toMatchObject({ ok: true, yourPick: "sunset", crew: [{ option: "sunset", friends: [] }, { option: "stars", friends: ["Dev"] }] });
    const events = await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect());
    expect(events.find((e) => e.userId === crew.ids.Maya && e.kind === "daily_pick")?.source).toBe("imessage");
  });

  test("seed loads the bank and the hourly job gives every crew its question for the day", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    expect(await t.mutation(internal.dailyPick.seed, {})).toBe(QUESTION_BANK.length);
    expect(await t.mutation(internal.dailyPick.seed, {})).toBe(QUESTION_BANK.length);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("dailyPicks").collect()) await ctx.db.delete("dailyPicks", row._id);
    });
    const shown = await today(t, crew.groupId, "Maya");
    await t.mutation(internal.dailyPick.ensureCrews, {});
    await t.mutation(internal.dailyPick.ensureCrews, {});
    const rows = await t.run(async (ctx) => ({
      questions: await ctx.db.query("dailyPickQuestions").collect(),
      picks: await ctx.db.query("dailyPicks").collect(),
    }));
    expect(rows.questions).toHaveLength(QUESTION_BANK.length);
    expect(rows.picks).toHaveLength(1);
    expect((await today(t, crew.groupId, "Maya")).question).toBe(shown.question);
  });
});
