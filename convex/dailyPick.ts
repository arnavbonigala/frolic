import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { BANK_BY_KEY, NO_REPEAT_DAYS, QUESTION_BANK, chooseQuestion, type PickQuestion } from "./dailyPickBank";
import { localDay } from "./keiki/lib";
import { requireMember, userFromToken } from "./lib/identity";
import { photoUrlOf } from "./lib/photo";
import { enqueue } from "./memory/events";
import { addDays } from "./plans/time";
import { flowerColor } from "./schema";

const WATER_SCAN = 60;
const ANSWER_LIMIT = 200;

const person = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: flowerColor,
  photoUrl: v.union(v.string(), v.null()),
});

const todayView = v.object({
  day: v.string(),
  question: v.string(),
  options: v.array(v.string()),
  myAnswer: v.union(v.string(), v.null()),
  results: v.union(
    v.object({
      total: v.number(),
      byOption: v.array(v.object({ option: v.string(), count: v.number(), people: v.array(person) })),
    }),
    v.null(),
  ),
});

async function pickRow(ctx: QueryCtx, groupId: Id<"groups">, day: string) {
  return await ctx.db
    .query("dailyPicks")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .unique();
}

const PASS_LIMIT = 3;
const HISTORY_ANSWER_LIMIT = 400;

function passedTags(rows: Doc<"dailyPicks">[], answers: Doc<"dailyPickAnswers">[]): string[] {
  const passes = new Map<string, number>();
  for (const row of rows) {
    const question = BANK_BY_KEY.get(row.questionKey);
    if (!question) continue;
    const taken = new Set(answers.filter((answer) => answer.day === row.day).map((answer) => answer.option.trim().toLowerCase()));
    if (taken.size === 0) continue;
    const offered = new Map<string, boolean>();
    for (const option of question.options) {
      for (const tag of option.tags) offered.set(tag, (offered.get(tag) ?? false) || taken.has(option.label.toLowerCase()));
    }
    for (const [tag, took] of offered) if (!took) passes.set(tag, (passes.get(tag) ?? 0) + 1);
  }
  return [...passes].filter(([, count]) => count >= PASS_LIMIT).map(([tag]) => tag);
}

async function lookBack(ctx: QueryCtx, groupId: Id<"groups">, day: string) {
  const since = addDays(day, -NO_REPEAT_DAYS);
  const rows = await ctx.db
    .query("dailyPicks")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).gte("day", since).lt("day", day))
    .take(NO_REPEAT_DAYS + 5);
  if (rows.length === 0) return { history: [], passed: [] as string[] };
  const answers = await ctx.db
    .query("dailyPickAnswers")
    .withIndex("by_groupId_and_day_and_userId", (q) => q.eq("groupId", groupId).gte("day", since).lt("day", day))
    .take(HISTORY_ANSWER_LIMIT);
  return {
    history: rows.map((row) => ({ day: row.day, key: row.questionKey, category: row.category })),
    passed: passedTags(rows, answers),
  };
}

export async function questionFor(ctx: QueryCtx, groupId: Id<"groups">, day: string): Promise<PickQuestion> {
  const row = await pickRow(ctx, groupId, day);
  if (row) {
    const stored = await ctx.db.get("dailyPickQuestions", row.questionId);
    if (stored) return { key: stored.key, category: stored.category, text: stored.text, options: stored.options };
  }
  const past = await lookBack(ctx, groupId, day);
  return chooseQuestion(groupId, day, past.history, past.passed);
}

async function upsertQuestion(ctx: MutationCtx, question: PickQuestion): Promise<Id<"dailyPickQuestions">> {
  const existing = await ctx.db
    .query("dailyPickQuestions")
    .withIndex("by_key", (q) => q.eq("key", question.key))
    .unique();
  if (!existing) return await ctx.db.insert("dailyPickQuestions", question);
  const same = existing.text === question.text && existing.category === question.category && JSON.stringify(existing.options) === JSON.stringify(question.options);
  if (!same) await ctx.db.patch("dailyPickQuestions", existing._id, { text: question.text, category: question.category, options: question.options });
  return existing._id;
}

export async function ensurePick(ctx: MutationCtx, groupId: Id<"groups">, day: string): Promise<{ row: Doc<"dailyPicks">; question: PickQuestion }> {
  const existing = await pickRow(ctx, groupId, day);
  if (existing) return { row: existing, question: await questionFor(ctx, groupId, day) };
  const past = await lookBack(ctx, groupId, day);
  const question = chooseQuestion(groupId, day, past.history, past.passed);
  const questionId = await upsertQuestion(ctx, BANK_BY_KEY.get(question.key) ?? question);
  const id = await ctx.db.insert("dailyPicks", { groupId, day, questionId, questionKey: question.key, category: question.category, answers: 0 });
  return { row: (await ctx.db.get("dailyPicks", id))!, question };
}

async function answersOn(ctx: QueryCtx, groupId: Id<"groups">, day: string) {
  return await ctx.db
    .query("dailyPickAnswers")
    .withIndex("by_groupId_and_day_and_userId", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(ANSWER_LIMIT);
}

export function tagsFor(question: PickQuestion, answer: string): string[] {
  const wanted = answer.trim().toLowerCase();
  return question.options.find((option) => option.label.toLowerCase() === wanted)?.tags ?? [];
}

export function matchOption(question: PickQuestion, raw: string): string | null {
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return null;
  const exact = question.options.find((option) => option.label.toLowerCase() === wanted);
  if (exact) return exact.label;
  const index = Number(wanted);
  if (Number.isInteger(index) && index >= 1 && index <= question.options.length) return question.options[index - 1].label;
  const loose = question.options.filter((option) => option.label.toLowerCase().includes(wanted) || wanted.includes(option.label.toLowerCase()));
  return loose.length === 1 ? loose[0].label : null;
}

export async function answerAs(
  ctx: MutationCtx,
  group: Doc<"groups">,
  userId: Id<"users">,
  raw: string,
  source: "app" | "imessage",
): Promise<{ day: string; question: PickQuestion; option: string }> {
  const day = localDay(Date.now(), group.timezone);
  const { row, question } = await ensurePick(ctx, group._id, day);
  const option = matchOption(question, raw);
  if (!option) {
    throw new ConvexError({ code: "BAD_OPTION", message: "Pick one of: " + question.options.map((o) => o.label).join(", ") });
  }
  const existing = await ctx.db
    .query("dailyPickAnswers")
    .withIndex("by_groupId_and_day_and_userId", (q) => q.eq("groupId", group._id).eq("day", day).eq("userId", userId))
    .unique();
  const now = Date.now();
  if (existing?.option === option) return { day, question, option };
  if (existing) {
    await ctx.db.patch("dailyPickAnswers", existing._id, { option, answeredAt: now });
  } else {
    await ctx.db.insert("dailyPickAnswers", { groupId: group._id, day, userId, option, answeredAt: now });
    await ctx.db.patch("dailyPicks", row._id, { answers: row.answers + 1 });
  }
  const tags = tagsFor(question, option);
  await enqueue(ctx, {
    eventKey: "pick:" + group._id + ":" + day + ":" + userId + ":" + option,
    kind: "daily_pick",
    groupId: group._id,
    userId,
    payload: { day, question: question.text, option, tags },
    source,
  });
  return { day, question, option };
}

export async function lastWateredDay(ctx: QueryCtx, groupId: Id<"groups">, today: string): Promise<string | null> {
  const rows = await ctx.db
    .query("dailyPicks")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).lte("day", today))
    .order("desc")
    .take(WATER_SCAN);
  return rows.find((row) => row.answers >= 2)?.day ?? null;
}

export const today = query({
  args: { deviceToken: v.string(), groupId: v.id("groups") },
  returns: todayView,
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    const day = localDay(Date.now(), group.timezone);
    const question = await questionFor(ctx, args.groupId, day);
    const answers = await answersOn(ctx, args.groupId, day);
    const mine = answers.find((a) => a.userId === user._id)?.option ?? null;
    const base = { day, question: question.text, options: question.options.map((o) => o.label), myAnswer: mine };
    if (mine === null) return { ...base, results: null };
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", args.groupId))
      .take(100);
    const byOption = [];
    let total = 0;
    for (const option of base.options) {
      const people = [];
      for (const answer of answers.filter((a) => a.option === option)) {
        const membership = memberships.find((m) => m.userId === answer.userId);
        const member = await ctx.db.get("users", answer.userId);
        if (!membership || !member) continue;
        people.push({ userId: member._id, name: member.name, color: membership.color, photoUrl: await photoUrlOf(ctx, member) });
      }
      total += people.length;
      byOption.push({ option, count: people.length, people });
    }
    return { ...base, results: { total, byOption } };
  },
});

export const answer = mutation({
  args: { deviceToken: v.string(), groupId: v.id("groups"), option: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await requireMember(ctx, args.groupId, user._id);
    const group = await ctx.db.get("groups", args.groupId);
    if (!group) throw new ConvexError({ code: "NOT_FOUND", message: "This crew is gone" });
    if (args.option.length > 100) throw new ConvexError({ code: "BAD_OPTION", message: "That is not one of the options" });
    await answerAs(ctx, group, user._id, args.option, "app");
    return null;
  },
});

export const pickTags = internalQuery({
  args: { groupId: v.id("groups"), day: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const tags: string[] = [];
    const days = /^\d{4}-\d{2}-\d{2}$/.test(args.day) ? [args.day, addDays(args.day, -1)] : [args.day];
    for (const day of days) {
      const row = await pickRow(ctx, args.groupId, day);
      if (!row) continue;
      const question = await questionFor(ctx, args.groupId, day);
      for (const answer of await answersOn(ctx, args.groupId, day)) {
        for (const tag of tagsFor(question, answer.option)) {
          if (!tags.includes(tag)) tags.push(tag);
        }
      }
    }
    return tags;
  },
});

export const seed = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    for (const question of QUESTION_BANK) await upsertQuestion(ctx, question);
    return QUESTION_BANK.length;
  },
});

export const ensureCrews = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("groups").paginate({ numItems: 50, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const group of page.page) await ensurePick(ctx, group._id, localDay(now, group.timezone));
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.dailyPick.ensureCrews, { cursor: page.continueCursor });
    return null;
  },
});
