import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { addDays, dateLabel } from "../plans/time";

export const WHY_MAX = 110;
export const PASS_MIN = 3;
export const PICK_DAYS = 3;

export type PickRef = { option: string; tags: string[]; day: string };
export type NightRef = { id: string; text: string; placeId?: string; date?: string };
export type WhyMemory = {
  pastNights?: NightRef[];
  skipped?: { tag: string; count: number }[];
  picks?: PickRef[];
};
export type WhyPlace = { slug: string; name: string; tags: string[] };
export type WhyCitation = { why: string; source: "memory" | "first_answer"; memoryId: string | null; memory: string | null };

export const vWhyCitation = v.object({
  why: v.string(),
  source: v.union(v.literal("memory"), v.literal("first_answer")),
  memoryId: v.union(v.string(), v.null()),
  memory: v.union(v.string(), v.null()),
});

export const vPickRef = v.object({ option: v.string(), tags: v.array(v.string()), day: v.string() });

const BANNED = /[\u2014\u2013!?]|\bnot\b[^.]*\bbut\b/i;
const TIMES = ["", "once", "twice", "three times", "four times", "five times"];
const PAST_CLAIM = /\b(last time|you all went|you went|you loved|you remembered|remember when|your favorite|favourite|been there|you keep picking|you all said|passed on)\b/i;

export const timesWord = (count: number) => TIMES[count] ?? count + " times";

const isDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

const lower = (s: string) => s.trim().toLowerCase();
const tagsOf = (tags: string[]) => tags.map(lower).filter((t) => t.length > 0);
const shares = (place: string[], tags: string[]) => tags.some((t) => place.includes(t));
const newestFirst = (a: string | undefined, b: string | undefined) => (b ?? "").localeCompare(a ?? "");

export function oneSentence(text: string): boolean {
  const line = text.trim();
  if (line.length === 0 || line.length > WHY_MAX) return false;
  if (BANNED.test(line)) return false;
  return !line.replace(/\.$/, "").includes(".");
}

const namesPlace = (night: NightRef, place: WhyPlace) => {
  if (night.placeId) return night.placeId === place.slug;
  return night.text.toLowerCase().includes(place.name.toLowerCase());
};

export function nightAtPlace(memory: WhyMemory, place: WhyPlace): NightRef | null {
  return (memory.pastNights ?? []).filter((n) => n.id && namesPlace(n, place)).sort((a, b) => newestFirst(a.date, b.date))[0] ?? null;
}

export function citeWhy(
  place: WhyPlace,
  memory: WhyMemory,
  opts: { day?: string; comeback?: boolean; label?: (tag: string) => string } = {},
): WhyCitation | null {
  const word = opts.label ?? ((tag: string) => tag.replace(/_/g, " "));
  const own = tagsOf(place.tags);
  const night = nightAtPlace(memory, place);
  if (night) {
    const when = night.date ? " on " + dateLabel(night.date) : " before";
    const why = "You all went to " + place.name + when + (opts.comeback ? ", so it's time to go back." : ".");
    if (oneSentence(why)) return { why, source: "memory", memoryId: night.id, memory: night.text };
  }
  const pick = (memory.picks ?? []).filter((p) => shares(own, tagsOf(p.tags))).sort((a, b) => newestFirst(a.day, b.day))[0];
  if (pick) {
    const yesterday = opts.day && isDay(opts.day) ? addDays(opts.day, -1) : null;
    const when = !opts.day ? "" : pick.day === opts.day ? " today" : pick.day === yesterday ? " yesterday" : isDay(pick.day) ? " on " + dateLabel(pick.day) : "";
    const why = "You all said " + pick.option + when + ", so tonight is " + place.name + ".";
    if (oneSentence(why)) return { why, source: "first_answer", memoryId: null, memory: null };
  }
  const passed = (memory.skipped ?? [])
    .filter((s) => s.count >= PASS_MIN && !own.includes(lower(s.tag)))
    .sort((a, b) => b.count - a.count)[0];
  if (passed) {
    const why = "You all passed on " + word(lower(passed.tag)) + " " + timesWord(passed.count) + ", so tonight is " + place.name + ".";
    if (oneSentence(why)) return { why, source: "memory", memoryId: null, memory: null };
  }
  return null;
}

export function claimsPast(text: string): boolean {
  return PAST_CLAIM.test(text);
}

export function backedClaim(memory: WhyMemory, place: WhyPlace): boolean {
  const own = tagsOf(place.tags);
  return (
    nightAtPlace(memory, place) !== null ||
    (memory.picks ?? []).some((p) => shares(own, tagsOf(p.tags))) ||
    (memory.skipped ?? []).some((s) => s.count >= PASS_MIN)
  );
}

export function unbackedClaim(text: string, memory: WhyMemory, place: WhyPlace): boolean {
  return claimsPast(text) && !backedClaim(memory, place);
}

export const pickAnswers = internalQuery({
  args: { groupId: v.id("groups"), day: v.string() },
  returns: v.array(vPickRef),
  handler: async (ctx, { groupId, day }): Promise<PickRef[]> => {
    const out: PickRef[] = [];
    const days = isDay(day) ? Array.from({ length: PICK_DAYS }, (_, back) => addDays(day, -back)) : [day];
    for (const on of days) {
      const row = await ctx.db.query("dailyPicks").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId).eq("day", on)).unique();
      if (!row) continue;
      const question = await ctx.db.get("dailyPickQuestions", row.questionId);
      const answers = await ctx.db.query("dailyPickAnswers").withIndex("by_groupId_and_day_and_userId", (q) => q.eq("groupId", groupId).eq("day", on)).take(200);
      for (const answer of answers) {
        if (out.some((p) => p.option === answer.option)) continue;
        out.push({ option: answer.option, tags: question?.options.find((o) => o.label === answer.option)?.tags ?? [], day: on });
      }
    }
    return out;
  },
});
