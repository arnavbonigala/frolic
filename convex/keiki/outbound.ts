import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  DEFAULT_WALK_MINUTES,
  crewMembers,
  firstName,
  goingAttendees,
  joinNames,
  planDetails,
} from "./lib";
import { keikiEnv } from "./env";
import { fence, noticeToken } from "./notice";
import { FADED_TEXT, crewFirst } from "../lib/copy";
import { titleNamesPlace } from "../lib/names";
import { ensurePick } from "../dailyPick";
import { smsLine } from "../dailyPickBank";

export const KEIKI_BASE_URL = "https://onkeiki.com";
export const DEFAULT_AGENT_ID = "44277a5e-b81d-4bb6-92d2-6c9c0eec47b3";
const MAX_ATTEMPTS = 3;

export const outboxKind = v.union(
  v.literal("drop"),
  v.literal("reveal"),
  v.literal("hopIn"),
  v.literal("faded"),
  v.literal("nudge"),
  v.literal("snap"),
  v.literal("collage"),
  v.literal("money"),
);

type Kind = Doc<"keikiOutbox">["kind"];
type Draft = { key: string; kind: Kind; userId?: Id<"users">; target: string; text: string; notBefore: number };

async function linkOf(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("keikiLinks")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

async function chatsOf(ctx: MutationCtx, groupId: Id<"groups">) {
  if (!keikiEnv().dedicatedLine) return [];
  return await ctx.db
    .query("keikiGroupChats")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(4);
}

async function crewOf(ctx: MutationCtx, frolicId: Id<"frolics">) {
  const frolic = await ctx.db.get("frolics", frolicId);
  if (!frolic) return "";
  const group = await ctx.db.get("groups", frolic.groupId);
  return group?.name ?? "";
}

async function enqueue(ctx: MutationCtx, frolicId: Id<"frolics">, drafts: Draft[]) {
  const crew = await crewOf(ctx, frolicId);
  const now = Date.now();
  let latest = now;
  let queued = 0;
  for (const draft of drafts) {
    const existing = await ctx.db
      .query("keikiOutbox")
      .withIndex("by_key", (q) => q.eq("key", draft.key))
      .unique();
    if (existing) continue;
    let status: Doc<"keikiOutbox">["status"] = "queued";
    if (draft.userId) {
      const link = await linkOf(ctx, draft.userId);
      if (!link || link.paused) status = "skipped";
    }
    await ctx.db.insert("keikiOutbox", { ...draft, text: crewFirst(crew, draft.text), frolicId, status, attempts: 0 });
    if (status === "queued") {
      queued++;
      latest = Math.max(latest, draft.notBefore);
    }
  }
  if (queued > 0) await ctx.scheduler.runAt(latest, internal.keiki.outbound.deliver, { frolicId });
  return queued;
}

async function personal(ctx: MutationCtx, userIds: Id<"users">[], make: (user: Doc<"users">, link: Doc<"keikiLinks">) => Omit<Draft, "userId" | "target"> | null) {
  const drafts: Draft[] = [];
  for (const userId of userIds) {
    const user = await ctx.db.get("users", userId);
    const link = await linkOf(ctx, userId);
    if (!user || !link) continue;
    const draft = make(user, link);
    if (draft) drafts.push({ ...draft, userId, target: link.phone });
  }
  return drafts;
}

async function context(ctx: MutationCtx, frolicId: Id<"frolics">) {
  const frolic = await ctx.db.get("frolics", frolicId);
  if (!frolic) return null;
  const group = await ctx.db.get("groups", frolic.groupId);
  if (!group) return null;
  const details = await planDetails(ctx, frolic, group.timezone, DEFAULT_WALK_MINUTES);
  return { frolic, group, details };
}

function heroLine(key: string) {
  const base = keikiEnv().heroBaseUrl;
  return base ? base + "/" + key + ".png" : null;
}

export function dropText(view: { title: string; place: string | null; startsAt: string; why: string | null; heroKey: string }, inGroup: boolean, pick: string | null = null) {
  const where = view.place && !titleNamesPlace(view.title, view.place) ? " at " + view.place : "";
  const lines = [view.title + where + ", " + view.startsAt + "."];
  if (view.why) lines.push(view.why);
  const hero = heroLine(view.heroKey);
  if (hero) lines.push(hero);
  lines.push(inGroup ? "DM me \"down\", \"only if…\", or \"pass\". It stays secret unless someone else is too." : "Reply \"down\", \"only if…\", or \"pass\".");
  if (pick) lines.push(pick);
  return lines.join("\n");
}

export const onDrop = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const c = await context(ctx, frolicId);
    if (!c) return null;
    const members = await crewMembers(ctx, c.group._id);
    const pick = c.frolic.kind === "daily" ? smsLine((await ensurePick(ctx, c.group._id, c.frolic.day)).question.text) : null;
    const drafts = await personal(ctx, members.map((m) => m._id), () => ({
      key: "drop:" + frolicId + ":" + "dm",
      kind: "drop",
      text: dropText(c.details.view, false, pick),
      notBefore: Date.now(),
    }));
    for (const d of drafts) d.key = "drop:" + frolicId + ":" + d.userId;
    for (const chat of await chatsOf(ctx, c.group._id)) {
      drafts.push({ key: "drop:" + frolicId + ":" + chat.chatId, kind: "drop", target: chat.chatId, text: dropText(c.details.view, true), notBefore: Date.now() });
    }
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export function freeLine(view: { title: string; startsAt: string }) {
  return "Someone in your crew is free. " + view.title + " at " + view.startsAt + "?";
}

export function freeText(view: { title: string; startsAt: string; heroKey: string }, inGroup: boolean) {
  const lines = [freeLine(view)];
  const hero = heroLine(view.heroKey);
  if (hero) lines.push(hero);
  lines.push(inGroup ? "DM me \"down\", \"only if…\", or \"pass\". It stays secret unless someone else is too." : "Reply \"down\", \"only if…\", or \"pass\".");
  return lines.join("\n");
}

export const onFree = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const c = await context(ctx, frolicId);
    if (!c) return null;
    const members = await crewMembers(ctx, c.group._id);
    const rest = members.filter((m) => m._id !== c.frolic.startedBy).map((m) => m._id);
    const drafts = await personal(ctx, rest, (user) => ({
      key: "drop:" + frolicId + ":" + user._id,
      kind: "drop",
      text: freeText(c.details.view, false),
      notBefore: Date.now(),
    }));
    for (const chat of await chatsOf(ctx, c.group._id)) {
      drafts.push({ key: "drop:" + frolicId + ":" + chat.chatId, kind: "drop", target: chat.chatId, text: freeText(c.details.view, true), notBefore: Date.now() });
    }
    if (c.frolic.startedBy) {
      drafts.push(
        ...(await personal(ctx, [c.frolic.startedBy], (user) => ({
          key: "drop:" + frolicId + ":" + user._id,
          kind: "drop",
          text: "You're counted as down. " + c.details.view.title + " at " + c.details.view.startsAt + " just went to your crew. Nobody knows it was you.",
          notBefore: Date.now(),
        }))),
      );
    }
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const GARDEN_NUDGE_TEXT = "Your garden's getting thirsty. Anyone free tonight?";

export async function gardenNudge(ctx: MutationCtx, groupId: Id<"groups">, frolicId: Id<"frolics">, streak: string) {
  const members = await crewMembers(ctx, groupId);
  const drafts = await personal(ctx, members.map((m) => m._id), (user) => ({
    key: "garden:" + groupId + ":" + streak + ":" + user._id,
    kind: "nudge",
    text: GARDEN_NUDGE_TEXT,
    notBefore: Date.now(),
  }));
  for (const chat of await chatsOf(ctx, groupId)) {
    drafts.push({ key: "garden:" + groupId + ":" + streak + ":" + chat.chatId, kind: "nudge", target: chat.chatId, text: GARDEN_NUDGE_TEXT, notBefore: Date.now() });
  }
  return await enqueue(ctx, frolicId, drafts);
}

export const onReveal = internalMutation({
  args: { frolicId: v.id("frolics"), userIds: v.array(v.id("users")), bloomAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const c = await context(ctx, args.frolicId);
    if (!c || c.frolic.revealAt === undefined) return null;
    const revealAt = c.frolic.revealAt;
    if (Date.now() < revealAt) {
      await ctx.scheduler.runAt(revealAt, internal.keiki.outbound.onReveal, args);
      return null;
    }
    const going = await goingAttendees(ctx, args.frolicId);
    const goingIds = new Set<Id<"users">>([...going.map((a) => a.userId), ...args.userIds]);
    const users = (await Promise.all([...goingIds].map((id) => ctx.db.get("users", id)))).filter((u): u is Doc<"users"> => u !== null);
    const deposit = await ctx.db
      .query("whopPlans")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", args.frolicId))
      .first();
    const view = c.details.view;
    const drafts = await personal(ctx, [...goingIds], (user) => {
      const others = users.filter((u) => u._id !== user._id).map((u) => firstName(u.name));
      const lines = [others.length > 0 ? "It's on. You, " + joinNames(others) + "." : "It's on.", "Meet at " + (view.meetingPoint ?? view.title) + " at " + view.startsAt + ". Leave at " + view.leaveAt + "."];
      const hero = heroLine(view.heroKey);
      if (hero) lines.push(hero);
      if (deposit) lines.push("Hold $" + (deposit.amountCents / 100).toFixed(deposit.amountCents % 100 ? 2 : 0) + " to lock it in. It comes back when you arrive. Want the link?");
      return { key: "reveal:" + args.frolicId + ":" + user._id, kind: "reveal", text: lines.join("\n"), notBefore: revealAt };
    });
    const names = joinNames(users.map((u) => firstName(u.name)));
    const chats = await chatsOf(ctx, c.group._id);
    for (const chat of chats) {
      drafts.push({ key: "reveal:" + args.frolicId + ":" + chat.chatId, kind: "reveal", target: chat.chatId, text: "It's on. " + names + " at " + (view.place ?? view.title) + ", " + view.startsAt + ". Hop in?", notBefore: revealAt });
    }
    if (chats.length === 0) {
      const members = await crewMembers(ctx, c.group._id);
      const rest = members.filter((m) => !goingIds.has(m._id)).map((m) => m._id);
      drafts.push(
        ...(await personal(ctx, rest, (user) => ({
          key: "hopIn:" + args.frolicId + ":" + user._id,
          kind: "hopIn",
          text: "It's on. " + names + " at " + (view.place ?? view.title) + ", " + view.startsAt + ". Room for one more?",
          notBefore: revealAt,
        }))),
      );
    }
    await enqueue(ctx, args.frolicId, drafts);
    return null;
  },
});

export const onFaded = internalMutation({
  args: { frolicId: v.id("frolics"), userIds: v.array(v.id("users")) },
  returns: v.null(),
  handler: async (ctx, { frolicId, userIds }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic) return null;
    const drafts = await personal(ctx, userIds, (user) => ({
      key: "faded:" + frolicId + ":" + user._id,
      kind: "faded",
      text: FADED_TEXT,
      notBefore: Date.now(),
    }));
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const onLeaveNudge = internalMutation({
  args: { frolicId: v.id("frolics"), leaveAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { frolicId, leaveAt }) => {
    const c = await context(ctx, frolicId);
    if (!c) return null;
    const going = await goingAttendees(ctx, frolicId);
    const drafts: Draft[] = [];
    for (const attendee of going) {
      const eta = await ctx.db
        .query("etas")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", attendee.userId))
        .unique();
      const walk = eta?.minutes ?? DEFAULT_WALK_MINUTES;
      drafts.push(
        ...(await personal(ctx, [attendee.userId], (user) => ({
          key: "nudge:" + frolicId + ":" + user._id,
          kind: "nudge",
          text: "Time to head out. " + (c.details.view.meetingPoint ?? c.details.view.title) + " is " + walk + " min away. Meet at " + c.details.view.startsAt + ".",
          notBefore: leaveAt,
        }))),
      );
    }
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const onSnapWindow = internalMutation({
  args: { frolicId: v.id("frolics"), snapAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { frolicId, snapAt }) => {
    const going = await goingAttendees(ctx, frolicId);
    const checkedIn: Id<"users">[] = [];
    for (const attendee of going) {
      const row = await ctx.db
        .query("checkins")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", attendee.userId))
        .unique();
      if (row) checkedIn.push(attendee.userId);
    }
    const drafts = await personal(ctx, checkedIn, (user) => ({
      key: "snap:" + frolicId + ":" + snapAt + ":" + user._id,
      kind: "snap",
      text: "Group snap. Send me one photo right now. You'll see everyone's once yours is in.",
      notBefore: snapAt,
    }));
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const onCollage = internalMutation({
  args: { frolicId: v.id("frolics"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { frolicId, storageId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const url = await ctx.storage.getUrl(storageId);
    if (!frolic || !url) return null;
    const snaps = await ctx.db
      .query("snaps")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .take(64);
    const drafts = await personal(ctx, [...new Set(snaps.map((s) => s.userId))], (user) => ({
      key: "collage:" + frolicId + ":" + user._id,
      kind: "collage",
      text: "Here's your group snap. " + url,
      notBefore: Date.now(),
    }));
    for (const chat of await chatsOf(ctx, frolic.groupId)) {
      drafts.push({ key: "collage:" + frolicId + ":" + chat.chatId, kind: "collage", target: chat.chatId, text: "Today's group snap. " + url, notBefore: Date.now() });
    }
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const onMoney = internalMutation({
  args: {
    frolicId: v.id("frolics"),
    userId: v.id("users"),
    event: v.union(v.literal("released"), v.literal("noShowCredit")),
    amountCents: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { frolicId, userId, event, amountCents }) => {
    const amount = "$" + (amountCents / 100).toFixed(amountCents % 100 ? 2 : 0);
    const base = keikiEnv().heroBaseUrl;
    const image = base ? base + "/" + (event === "released" ? "whop-deposit-back" : "whop-noshow-coin") + ".png" : null;
    const text = (event === "released" ? "Your " + amount + " is back." : "A no-show added " + amount + " to the Frolic Fund.") + (image ? "\n" + image : "");
    const drafts = await personal(ctx, [userId], (user) => ({
      key: "money:" + event + ":" + frolicId + ":" + user._id,
      kind: "collage",
      text,
      notBefore: Date.now(),
    }));
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const STALE_MS = 6 * 60 * 60 * 1000;

export function retryWait(attempts: number): number {
  return attempts === 0 ? 0 : Math.min(60_000, 2_000 * 2 ** (attempts - 1));
}

export const due = internalQuery({
  args: { frolicId: v.id("frolics"), now: v.number() },
  returns: v.array(v.object({ id: v.id("keikiOutbox"), kind: outboxKind, target: v.string(), text: v.string(), attempts: v.number(), stale: v.boolean() })),
  handler: async (ctx, { frolicId, now }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const rows = await ctx.db
      .query("keikiOutbox")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .take(256);
    const open = rows.filter((row) => row.status === "queued" && row.notBefore + retryWait(row.attempts) <= now);
    const sendable: { id: Id<"keikiOutbox">; kind: Kind; target: string; text: string; attempts: number; stale: boolean }[] = [];
    for (const row of open) {
      if (row.userId) {
        const link = await linkOf(ctx, row.userId);
        if (!link || link.paused) continue;
      }
      if ((row.kind === "reveal" || row.kind === "hopIn") && !(frolic?.revealAt !== undefined && now >= frolic.revealAt)) continue;
      sendable.push({ id: row._id, kind: row.kind, target: row.target, text: row.text, attempts: row.attempts, stale: now - row.notBefore > STALE_MS });
    }
    return sendable;
  },
});

export const settle = internalMutation({
  args: {
    results: v.array(
      v.object({
        id: v.id("keikiOutbox"),
        ok: v.boolean(),
        error: v.optional(v.string()),
        permanent: v.optional(v.boolean()),
      }),
    ),
    now: v.number(),
    frolicId: v.id("frolics"),
  },
  returns: v.null(),
  handler: async (ctx, { results, now, frolicId }) => {
    let retryDelay: number | null = null;
    for (const result of results) {
      const row = await ctx.db.get("keikiOutbox", result.id);
      if (!row || row.status !== "queued") continue;
      const attempts = row.attempts + 1;
      if (result.ok) {
        await ctx.db.patch("keikiOutbox", row._id, { status: "sent", attempts, sentAt: now, error: undefined });
        continue;
      }
      if (result.permanent || attempts >= MAX_ATTEMPTS) {
        await ctx.db.patch("keikiOutbox", row._id, { status: "failed", attempts, error: result.error });
        continue;
      }
      await ctx.db.patch("keikiOutbox", row._id, { attempts, error: result.error });
      retryDelay = Math.max(retryDelay ?? 0, retryWait(attempts));
    }
    if (retryDelay !== null) await ctx.scheduler.runAfter(retryDelay, internal.keiki.outbound.deliver, { frolicId });
    return null;
  },
});

export function noticeText(text: string, token: string) {
  return fence(token) + "\n" + text;
}

type NoticeBody = { results?: { outcome?: string }[]; ran?: boolean; unavailable?: number };

export const deliver = internalAction({
  args: { frolicId: v.id("frolics") },
  returns: v.null(),
  handler: async (ctx, { frolicId }) => {
    const now = Date.now();
    const rows = await ctx.runQuery(internal.keiki.outbound.due, { frolicId, now });
    if (rows.length === 0) return null;
    const { apiKey, agentId: configuredAgent } = keikiEnv();
    const agentId = configuredAgent ?? DEFAULT_AGENT_ID;
    const token = noticeToken(apiKey ?? "");
    const results = await Promise.all(
      rows.map(async (row) => {
        if (row.stale) return { id: row.id, ok: false, error: "stale", permanent: true };
        if (!apiKey) return { id: row.id, ok: false, error: "not_configured" };
        try {
          const res = await fetch(KEIKI_BASE_URL + "/api/v1/developer/agents/" + agentId + "/notice", {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text: noticeText(row.text, token), phone: row.target }),
          });
          if (!res.ok) {
            const permanent = res.status === 400 || res.status === 404 || res.status === 422;
            return { id: row.id, ok: false, error: (permanent ? "lost_" : "http_") + res.status, permanent };
          }
          const body = (await res.json().catch(() => null)) as NoticeBody | null;
          const outcome = body?.results?.[0]?.outcome ?? (body?.ran === false ? "unavailable" : null);
          if (outcome === "ran" || outcome === "queued") return { id: row.id, ok: true };
          if (outcome === null) return { id: row.id, ok: false, error: "unreadable_answer" };
          const permanent = outcome === "unknown_person" || outcome === "not_found";
          return { id: row.id, ok: false, error: outcome, permanent };
        } catch {
          return { id: row.id, ok: false, error: "network" };
        }
      }),
    );
    await ctx.runMutation(internal.keiki.outbound.settle, { results, now: Date.now(), frolicId });
    return null;
  },
});
