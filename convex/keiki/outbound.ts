import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
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

export const KEIKI_BASE_URL = "https://onkeiki.com";
export const DEFAULT_AGENT_ID = "44277a5e-b81d-4bb6-92d2-6c9c0eec47b3";
const MAX_ATTEMPTS = 3;

type Kind = Doc<"keikiOutbox">["kind"];
type Draft = { key: string; kind: Kind; userId?: Id<"users">; target: string; text: string; notBefore: number };

async function linkOf(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("keikiLinks")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

async function chatsOf(ctx: MutationCtx, groupId: Id<"groups">) {
  return await ctx.db
    .query("keikiGroupChats")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(4);
}

async function enqueue(ctx: MutationCtx, frolicId: Id<"frolics">, drafts: Draft[]) {
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
    await ctx.db.insert("keikiOutbox", { ...draft, frolicId, status, attempts: 0 });
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

export function dropText(view: { title: string; place: string | null; startsAt: string; why: string | null; heroKey: string }, inGroup: boolean) {
  const where = view.place && view.place !== view.title ? " at " + view.place : "";
  const lines = [view.title + where + ", " + view.startsAt + "."];
  if (view.why) lines.push(view.why);
  const hero = heroLine(view.heroKey);
  if (hero) lines.push(hero);
  lines.push(inGroup ? "DM me \"down\", \"only if…\", or \"pass\". It stays secret unless someone else is down too." : "Reply \"down\", \"only if…\", or \"pass\".");
  return lines.join("\n");
}

export const onDrop = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async (ctx, { frolicId }) => {
    const c = await context(ctx, frolicId);
    if (!c) return null;
    const members = await crewMembers(ctx, c.group._id);
    const drafts = await personal(ctx, members.map((m) => m._id), () => ({
      key: "drop:" + frolicId + ":" + "dm",
      kind: "drop",
      text: dropText(c.details.view, false),
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

export const onReveal = internalMutation({
  args: { frolicId: v.id("frolics"), userIds: v.array(v.id("users")), bloomAt: v.number() },
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
      const lines = ["It's on. You, " + joinNames(others) + ".", "Meet at " + (view.meetingPoint ?? view.title) + " at " + view.startsAt + ". Leave at " + view.leaveAt + "."];
      const hero = heroLine(view.heroKey);
      if (hero) lines.push(hero);
      if (deposit) lines.push("Hold $" + (deposit.amountCents / 100).toFixed(deposit.amountCents % 100 ? 2 : 0) + " to lock it in. It comes back when you arrive. Want the link?");
      return { key: "reveal:" + args.frolicId + ":" + user._id, kind: "reveal", text: lines.join("\n"), notBefore: revealAt };
    });
    const names = joinNames(users.map((u) => firstName(u.name)));
    const chats = await chatsOf(ctx, c.group._id);
    for (const chat of chats) {
      drafts.push({ key: "reveal:" + args.frolicId + ":" + chat.chatId, kind: "reveal", target: chat.chatId, text: "It's on: " + names + " at " + (view.place ?? view.title) + ", " + view.startsAt + ". Hop in?", notBefore: revealAt });
    }
    if (chats.length === 0) {
      const members = await crewMembers(ctx, c.group._id);
      const rest = members.filter((m) => !goingIds.has(m._id)).map((m) => m._id);
      drafts.push(
        ...(await personal(ctx, rest, (user) => ({
          key: "hopIn:" + args.frolicId + ":" + user._id,
          kind: "hopIn",
          text: "It's on: " + names + " at " + (view.place ?? view.title) + ", " + view.startsAt + ". Room for one more?",
          notBefore: revealAt,
        }))),
      );
    }
    await enqueue(ctx, args.frolicId, drafts);
    return null;
  },
});

export const onFaded = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic) return null;
    const members = await crewMembers(ctx, frolic.groupId);
    const drafts = await personal(ctx, members.map((m) => m._id), (user) => ({
      key: "faded:" + frolicId + ":" + user._id,
      kind: "faded",
      text: "Today's plan faded. Tomorrow's drop is a fresh one.",
      notBefore: Date.now(),
    }));
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const onLeaveNudge = internalMutation({
  args: { frolicId: v.id("frolics"), leaveAt: v.number() },
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
      text: "Here's your group snap: " + url,
      notBefore: Date.now(),
    }));
    for (const chat of await chatsOf(ctx, frolic.groupId)) {
      drafts.push({ key: "collage:" + frolicId + ":" + chat.chatId, kind: "collage", target: chat.chatId, text: "Today's group snap: " + url, notBefore: Date.now() });
    }
    await enqueue(ctx, frolicId, drafts);
    return null;
  },
});

export const due = internalQuery({
  args: { frolicId: v.id("frolics"), now: v.number() },
  handler: async (ctx, { frolicId, now }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const rows = await ctx.db
      .query("keikiOutbox")
      .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
      .take(256);
    return rows
      .filter((row) => row.status === "queued" && row.notBefore <= now)
      .filter((row) => (row.kind === "reveal" || row.kind === "hopIn" ? frolic?.revealAt !== undefined && now >= frolic.revealAt : true))
      .map((row) => ({ id: row._id, kind: row.kind, target: row.target, text: row.text, attempts: row.attempts }));
  },
});

export const settle = internalMutation({
  args: {
    results: v.array(v.object({ id: v.id("keikiOutbox"), ok: v.boolean(), error: v.optional(v.string()) })),
    now: v.number(),
    frolicId: v.id("frolics"),
  },
  handler: async (ctx, { results, now, frolicId }) => {
    let retry = false;
    for (const result of results) {
      const row = await ctx.db.get("keikiOutbox", result.id);
      if (!row || row.status !== "queued") continue;
      const attempts = row.attempts + 1;
      if (result.ok) await ctx.db.patch("keikiOutbox", row._id, { status: "sent", attempts, sentAt: now, error: undefined });
      else if (attempts >= MAX_ATTEMPTS) await ctx.db.patch("keikiOutbox", row._id, { status: "failed", attempts, error: result.error });
      else {
        await ctx.db.patch("keikiOutbox", row._id, { attempts, error: result.error });
        retry = true;
      }
    }
    if (retry) await ctx.scheduler.runAfter(2000, internal.keiki.outbound.deliver, { frolicId });
    return null;
  },
});

export function noticeText(kind: Kind, text: string) {
  return "Frolic " + kind + " event. Send this to them now as one message, word for word, and nothing else:\n" + text;
}

export const deliver = internalAction({
  args: { frolicId: v.id("frolics") },
  handler: async (ctx, { frolicId }) => {
    const now = Date.now();
    const rows = await ctx.runQuery(internal.keiki.outbound.due, { frolicId, now });
    if (rows.length === 0) return null;
    const { apiKey, agentId: configuredAgent } = keikiEnv();
    const agentId = configuredAgent ?? DEFAULT_AGENT_ID;
    const results = await Promise.all(
      rows.map(async (row) => {
        if (!apiKey) return { id: row.id, ok: false, error: "not_configured" };
        try {
          const res = await fetch(KEIKI_BASE_URL + "/api/v1/developer/agents/" + agentId + "/notice", {
            method: "POST",
            headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ text: noticeText(row.kind, row.text), phone: row.target }),
          });
          if (!res.ok) return { id: row.id, ok: false, error: "http_" + res.status };
          return { id: row.id, ok: true };
        } catch {
          return { id: row.id, ok: false, error: "network" };
        }
      }),
    );
    await ctx.runMutation(internal.keiki.outbound.settle, { results, now: Date.now(), frolicId });
    return null;
  },
});
