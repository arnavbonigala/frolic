import { WorkflowManager, start, vResultValidator, vWorkflowId, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "../_generated/server";
import { PLACE_BY_SLUG } from "../places/data";
import { pickPlace } from "../ai/pick";
import {
  fallbackPlan,
  generatePlan,
  TAG_LABEL,
  copyOk,
  memoryWhy,
  rankCandidates,
  validatePlan,
  type DropInput,
  type DropKind,
  type GenerateOptions,
  type Plan,
} from "./engine";
import { vDropInputs, type DropInputs } from "./inputs";
import { EMPTY_MEMORY, type MemoryContext } from "./memoryContext";
import { addDays, localParts, weekdayOf } from "./time";
import { fetchWeather, hourAt, isRainy, type DayWeather } from "./weather";

declare const process: { env: Record<string, string | undefined> };

const TWO_HOURS = 2 * 60 * 60 * 1000;
const GROUP_LIMIT = 500;

const vDropKind = v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo"));

const vHourWeather = v.object({
  timeMs: v.number(),
  tempF: v.number(),
  precipProb: v.number(),
  code: v.number(),
  cloudCover: v.number(),
});

const vDayWeather = v.object({
  hourly: v.array(vHourWeather),
  sunriseMs: v.number(),
  sunsetMs: v.number(),
});

const vMemoryContext = v.object({
  likedTags: v.array(v.string()),
  skipped: v.array(v.object({ tag: v.string(), count: v.number() })),
  suppressed: v.array(v.string()),
  pastNights: v.array(
    v.object({
      id: v.string(),
      text: v.string(),
      placeId: v.optional(v.string()),
      date: v.optional(v.string()),
    }),
  ),
});

const vMeetingPoint = v.object({ lat: v.number(), lng: v.number(), label: v.string() });

const vWhyInputs = v.object({
  placeName: v.string(),
  memory: v.union(v.string(), v.null()),
  topTags: v.array(v.string()),
  weather: v.union(v.string(), v.null()),
  tempF: v.union(v.number(), v.null()),
  sunsetAt: v.number(),
  rainSwap: v.boolean(),
});

const vStoredPlan = v.object({
  placeSlug: v.string(),
  title: v.string(),
  line: v.string(),
  why: v.string(),
  whySource: v.union(
    v.literal("template"),
    v.literal("memory"),
    v.literal("device"),
    v.literal("haiku"),
  ),
  whyMemoryId: v.union(v.string(), v.null()),
  whyInputs: vWhyInputs,
  chips: v.array(v.string()),
  cost: v.number(),
  costLabel: v.string(),
  payUpFront: v.boolean(),
  startsAt: v.number(),
  durationMinutes: v.number(),
  meetingPoint: vMeetingPoint,
  sunsetAt: v.number(),
  weather: v.union(v.string(), v.null()),
  weatherSwap: v.boolean(),
  favoredUserId: v.union(v.string(), v.null()),
  source: v.union(v.literal("model"), v.literal("scorer"), v.literal("fallback")),
});

type StoredPlan = {
  placeSlug: string;
  title: string;
  line: string;
  why: string;
  whySource: "template" | "memory" | "device" | "haiku";
  whyMemoryId: string | null;
  whyInputs: Plan["whyInputs"];
  chips: string[];
  cost: number;
  costLabel: string;
  payUpFront: boolean;
  startsAt: number;
  durationMinutes: number;
  meetingPoint: { lat: number; lng: number; label: string };
  sunsetAt: number;
  weather: string | null;
  weatherSwap: boolean;
  favoredUserId: string | null;
  source: "model" | "scorer" | "fallback";
};

const toStored = (plan: Plan): StoredPlan => ({
  placeSlug: plan.placeSlug,
  title: plan.title,
  line: plan.line,
  why: plan.why,
  whySource: plan.whySource,
  whyMemoryId: plan.whyMemoryId,
  whyInputs: plan.whyInputs,
  chips: plan.chips,
  cost: plan.costPerPersonCents,
  costLabel: plan.costLabel,
  payUpFront: plan.payUpFront,
  startsAt: plan.startsAt,
  durationMinutes: plan.durationMinutes,
  meetingPoint: plan.meetingPoint,
  sunsetAt: plan.sunsetAt,
  weather: plan.weather,
  weatherSwap: plan.weatherSwap,
  favoredUserId: plan.favoredUserId,
  source: plan.source,
});

function buildInput(args: {
  groupId: Id<"groups"> | string;
  day: string;
  kind: DropKind;
  inputs: DropInputs;
  weather: DayWeather | null;
  memory: MemoryContext;
}): DropInput {
  return {
    day: args.day,
    kind: args.kind,
    seed: args.groupId + ":" + args.day,
    nowMs: args.inputs.nowMs,
    attendees: args.inputs.attendees,
    weather: args.weather,
    memory: args.memory,
    history: args.inputs.history,
    lastFrolicDay: args.inputs.lastFrolicDay,
  };
}

export async function modelPick(input: DropInput, fetcher?: typeof fetch): Promise<GenerateOptions | null> {
  const ranked = rankCandidates(input).slice(0, 8);
  if (ranked.length < 2) return null;
  const top = generatePlan(input);
  const result = await pickPlace({
    candidates: ranked.map((c) => ({ slug: c.place.slug, name: c.place.name, tags: c.place.tags, costLabel: c.place.costLabel, indoor: c.place.indoor, why: c.place.fallbackWhy })),
    context: { topTags: top?.whyInputs.topTags ?? [], memory: input.memory.pastNights[0]?.text ?? null, weather: top?.weather ?? null },
    fetcher,
  });
  return result ? { preferredSlug: result.slug, preferredWhy: result.why } : null;
}

async function fetchWeatherOrNull(day: string): Promise<DayWeather | null> {
  try {
    return await fetchWeather(day);
  } catch {
    return null;
  }
}

export const fetchWeatherStep = internalAction({
  args: { day: v.string() },
  returns: v.union(vDayWeather, v.null()),
  handler: async (_ctx, args): Promise<DayWeather | null> => await fetchWeatherOrNull(args.day),
});

export const memoryStep = internalAction({
  args: { groupId: v.id("groups"), day: v.string() },
  returns: vMemoryContext,
  handler: async (ctx, args): Promise<MemoryContext> => {
    try {
      const m: MemoryContext = await ctx.runAction(internal.memory.read.getMemoryContext, args);
      return { likedTags: m.likedTags, skipped: m.skipped, suppressed: m.suppressed, pastNights: m.pastNights.map((n) => ({ id: n.id, text: n.text, placeId: n.placeId, date: n.date })) };
    } catch {
      return EMPTY_MEMORY;
    }
  },
});

export const pickStep = internalAction({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    kind: vDropKind,
    inputs: vDropInputs,
    weather: v.union(vDayWeather, v.null()),
    memory: vMemoryContext,
  },
  returns: v.union(vStoredPlan, v.null()),
  handler: async (ctx, args): Promise<StoredPlan | null> => {
    const input = buildInput(args);
    const preferred = process.env.OPENAI_API_KEY ? await modelPick(input).catch(() => null) : null;
    const plan = generatePlan(input, preferred ?? {});
    if (!plan) return null;
    const picked = validatePlan(plan, input) ? plan : fallbackPlan(input);
    if (!picked) return null;
    if (picked.whySource !== "memory") {
      const place = PLACE_BY_SLUG.get(picked.placeSlug);
      const hit: { memoryId: string; text: string } | null = place
        ? await ctx.runAction(internal.memory.read.whyThis, { groupId: args.groupId, tags: [place.name.replace(/^the /, ""), ...place.tags.map((t) => TAG_LABEL[t])] }).catch(() => null)
        : null;
      const why = hit ? memoryWhy(hit.text) : null;
      if (hit && why && copyOk(why)) {
        picked.why = why;
        picked.whySource = "memory";
        picked.whyMemoryId = hit.memoryId;
        picked.whyInputs.memory = hit.text;
      }
    }
    return toStored(picked);
  },
});

export const writePlan = internalMutation({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    kind: vDropKind,
    plan: vStoredPlan,
  },
  returns: v.union(v.id("plans"), v.null()),
  handler: async (ctx, args): Promise<Id<"plans"> | null> => {
    const existing = await existingPlanId(ctx, args.groupId, args.day, args.kind);
    if (existing) return existing;
    return await storePlan(ctx, args);
  },
});

function planWhyInputs(plan: StoredPlan) {
  return {
    placeName: plan.whyInputs.placeName,
    memory: plan.whyInputs.memory ?? undefined,
    topTags: plan.whyInputs.topTags,
    weather: plan.whyInputs.weather ?? undefined,
    tempF: plan.whyInputs.tempF ?? undefined,
    sunsetAt: plan.whyInputs.sunsetAt,
    rainSwap: plan.whyInputs.rainSwap,
  };
}

async function storePlan(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; day: string; kind: DropKind; plan: StoredPlan },
): Promise<Id<"plans"> | null> {
  const place = (
    await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", args.plan.placeSlug)).take(1)
  )[0];
  if (!place) return null;
  return await ctx.db.insert("plans", {
    groupId: args.groupId,
    day: args.day,
    kind: args.kind,
    placeId: place._id,
    title: args.plan.title,
    line: args.plan.line,
    why: args.plan.why,
    whySource: args.plan.whySource,
    whyMemoryId: args.plan.whyMemoryId ?? undefined,
    whyInputs: planWhyInputs(args.plan),
    chips: args.plan.chips,
    cost: args.plan.cost,
    costLabel: args.plan.costLabel,
    payUpFront: args.plan.payUpFront,
    startsAt: args.plan.startsAt,
    durationMinutes: args.plan.durationMinutes,
    meetingPoint: args.plan.meetingPoint,
    sunsetAt: args.plan.sunsetAt,
    weather: args.plan.weather ?? undefined,
    weatherSwap: args.plan.weatherSwap,
    favoredUserId: args.plan.favoredUserId ? (args.plan.favoredUserId as Id<"users">) : undefined,
    source: args.plan.source,
    generatedAt: Date.now(),
  });
}

export const patchPlan = internalMutation({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    kind: vDropKind,
    plan: vStoredPlan,
  },
  returns: v.union(v.id("plans"), v.null()),
  handler: async (ctx, args): Promise<Id<"plans"> | null> => {
    const existing = await existingPlan(ctx, args.groupId, args.day, args.kind);
    if (!existing) return null;
    const place = (
      await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", args.plan.placeSlug)).take(1)
    )[0];
    if (!place) return null;
    await ctx.db.patch("plans", existing._id, {
      title: args.plan.title,
      line: args.plan.line,
      why: args.plan.why,
      whySource: args.plan.whySource,
      whyMemoryId: args.plan.whyMemoryId ?? undefined,
      whyInputs: planWhyInputs(args.plan),
      chips: args.plan.chips,
      placeId: place._id,
      cost: args.plan.cost,
      costLabel: args.plan.costLabel,
      payUpFront: args.plan.payUpFront,
      startsAt: args.plan.startsAt,
      weather: args.plan.weather ?? undefined,
      weatherSwap: args.plan.weatherSwap,
      weatherCheckedAt: Date.now(),
    });
    return existing._id;
  },
});

export const weatherSwapStep = internalAction({
  args: {
    groupId: v.id("groups"),
    day: v.string(),
    kind: vDropKind,
    plan: vStoredPlan,
  },
  returns: v.union(vStoredPlan, v.null()),
  handler: async (ctx, args): Promise<StoredPlan | null> => {
    const place = PLACE_BY_SLUG.get(args.plan.placeSlug);
    if (!place || place.indoor) return null;
    const weather = await fetchWeatherOrNull(args.day);
    if (!isRainy(hourAt(weather, args.plan.startsAt))) return null;
    const inputs: DropInputs = await ctx.runQuery(internal.plans.inputs.dropInputs, {
      groupId: args.groupId,
      day: args.day,
      nowMs: Date.now(),
    });
    const memory: MemoryContext = await ctx.runAction(internal.plans.drop.memoryStep, {
      groupId: args.groupId,
      day: args.day,
    });
    const input = buildInput({ groupId: args.groupId, day: args.day, kind: args.kind, inputs, weather, memory });
    const plan = generatePlan(input);
    if (!plan || !validatePlan(plan, input)) return null;
    const stored = toStored(plan);
    await ctx.runMutation(internal.plans.drop.patchPlan, {
      groupId: args.groupId,
      day: args.day,
      kind: args.kind,
      plan: stored,
    });
    return stored;
  },
});

export const workflow = new WorkflowManager(components.workflow);

export const dropWorkflow = workflow
  .define({
    args: {
      groupId: v.id("groups"),
      day: v.string(),
      kind: vDropKind,
      nowMs: v.number(),
    },
    returns: v.union(v.id("plans"), v.null()),
  })
  .handler(async (step, args): Promise<Id<"plans"> | null> => {
    const inputs: DropInputs = await step.runQuery(internal.plans.inputs.dropInputs, {
      groupId: args.groupId,
      day: args.day,
      nowMs: args.nowMs,
    });
    const weather: DayWeather | null = await step.runAction(
      internal.plans.drop.fetchWeatherStep,
      { day: args.day },
      { retry: false },
    );
    const memory: MemoryContext = await step.runAction(internal.plans.drop.memoryStep, {
      groupId: args.groupId,
      day: args.day,
    });
    const plan: StoredPlan | null = await step.runAction(
      internal.plans.drop.pickStep,
      {
        groupId: args.groupId,
        day: args.day,
        kind: args.kind,
        inputs,
        weather,
        memory,
      },
      { retry: false },
    );
    if (!plan) return null;
    const planId: Id<"plans"> | null = await step.runMutation(internal.plans.drop.writePlan, {
      groupId: args.groupId,
      day: args.day,
      kind: args.kind,
      plan,
    });
    const swapAt = plan.startsAt - TWO_HOURS;
    if (swapAt > inputs.nowMs) {
      await step.runAction(
        internal.plans.drop.weatherSwapStep,
        { groupId: args.groupId, day: args.day, kind: args.kind, plan },
        { runAt: swapAt, retry: false },
      );
    }
    return planId;
  });

async function existingPlan(ctx: MutationCtx, groupId: Id<"groups">, day: string, kind: DropKind) {
  const plans = await ctx.db
    .query("plans")
    .withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", day))
    .take(10);
  return plans.find((plan) => plan.kind === kind) ?? null;
}

async function existingPlanId(ctx: MutationCtx, groupId: Id<"groups">, day: string, kind: DropKind) {
  return (await existingPlan(ctx, groupId, day, kind))?._id ?? null;
}

async function writeFallbackPlan(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; day: string; kind: DropKind },
): Promise<Id<"plans"> | null> {
  const existing = await existingPlanId(ctx, args.groupId, args.day, args.kind);
  if (existing) return existing;
  const inputs: DropInputs = await ctx.runQuery(internal.plans.inputs.dropInputs, {
    groupId: args.groupId,
    day: args.day,
    nowMs: Date.now(),
  });
  const input = buildInput({ ...args, inputs, weather: null, memory: EMPTY_MEMORY });
  const plan = fallbackPlan(input);
  if (!plan) return null;
  return await storePlan(ctx, { ...args, plan: toStored(plan) });
}

export const writeFallback = internalMutation({
  args: { groupId: v.id("groups"), day: v.string(), kind: vDropKind },
  returns: v.union(v.id("plans"), v.null()),
  handler: async (ctx, args): Promise<Id<"plans"> | null> => await writeFallbackPlan(ctx, args),
});

export const dropComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ groupId: v.id("groups"), day: v.string(), kind: vDropKind }),
  },
  returns: v.union(v.id("plans"), v.null()),
  handler: async (ctx, args): Promise<Id<"plans"> | null> => {
    if (args.result.kind === "success" && args.result.returnValue !== null) return null;
    return await writeFallbackPlan(ctx, args.context);
  },
});

async function startDropFor(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; day: string; kind: DropKind; nowMs: number },
): Promise<WorkflowId | null> {
  if (await existingPlanId(ctx, args.groupId, args.day, args.kind)) return null;
  return await start(ctx, internal.plans.drop.dropWorkflow, args, {
    onComplete: internal.plans.drop.dropComplete,
    context: { groupId: args.groupId, day: args.day, kind: args.kind },
    startAsync: true,
  });
}

export const startDrop = internalMutation({
  args: { groupId: v.id("groups"), day: v.string(), kind: vDropKind },
  returns: v.union(vWorkflowId, v.null()),
  handler: async (ctx, args): Promise<WorkflowId | null> =>
    await startDropFor(ctx, { ...args, nowMs: Date.now() }),
});

export const dailyDrop = internalMutation({
  args: {},
  returns: v.object({ started: v.number() }),
  handler: async (ctx) => {
    const nowMs = Date.now();
    const day = localParts(nowMs).day;
    const groups = await ctx.db.query("groups").take(GROUP_LIMIT);
    let started = 0;
    for (const group of groups) {
      const workflowId = await startDropFor(ctx, { groupId: group._id, day, kind: "daily", nowMs });
      if (workflowId) started += 1;
    }
    return { started };
  },
});

export const weekendDrop = internalMutation({
  args: {},
  returns: v.object({ started: v.number() }),
  handler: async (ctx) => {
    const nowMs = Date.now();
    const today = localParts(nowMs).day;
    const saturday = addDays(today, (6 - weekdayOf(today) + 7) % 7);
    const groups = await ctx.db.query("groups").take(GROUP_LIMIT);
    let started = 0;
    for (const day of [saturday, addDays(saturday, 1)]) {
      for (const group of groups) {
        const workflowId = await startDropFor(ctx, { groupId: group._id, day, kind: "weekend", nowMs });
        if (workflowId) started += 1;
      }
    }
    return { started };
  },
});
