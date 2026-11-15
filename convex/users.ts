import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assertDeviceToken,
  cleanName,
  findMembership,
  findUserByToken,
  hashToken,
  newCode,
  userFromToken,
} from "./lib/identity";
import { isPortraitKey } from "./avatars/portraits";
import { photoUrlOf } from "./lib/photo";
import { rateLimiter } from "./lib/rateLimits";
import { FLOWER_COLORS, removeTap, sitOutAndRefill } from "./lib/core";
import { happened } from "./garden";

async function findInvite(ctx: QueryCtx, inviteCode: string): Promise<Doc<"invites"> | null> {
  const rows = await ctx.db
    .query("invites")
    .withIndex("by_code", (q) => q.eq("code", inviteCode.trim().toUpperCase()))
    .take(2);
  return rows[0] ?? null;
}

function inviteIsLive(invite: Doc<"invites"> | null): invite is Doc<"invites"> {
  return invite !== null && !invite.revoked && (invite.expiresAt === undefined || invite.expiresAt >= Date.now());
}

const INVITE_EXPIRED = "This invite link expired";

async function liveInvite(ctx: QueryCtx, inviteCode: string): Promise<Doc<"invites">> {
  const invite = await findInvite(ctx, inviteCode);
  if (!inviteIsLive(invite)) throw new ConvexError({ code: "BAD_INVITE", message: INVITE_EXPIRED });
  if (!(await ctx.db.get("groups", invite.groupId))) {
    throw new ConvexError({ code: "BAD_INVITE", message: INVITE_EXPIRED });
  }
  return invite;
}

async function freshInviteCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const taken = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", code))
      .take(1);
    if (taken.length === 0) return code;
  }
  return newCode();
}

async function upsertDeviceUser(
  ctx: MutationCtx,
  deviceToken: string,
  firstName: string,
  source: "app" | "web",
): Promise<Id<"users">> {
  assertDeviceToken(deviceToken);
  const name = cleanName(firstName);
  const existing = await findUserByToken(ctx, deviceToken);
  if (existing) {
    if (existing.name !== name) await ctx.db.patch("users", existing._id, { name });
    return existing._id;
  }
  return await ctx.db.insert("users", { name, tokenHash: await hashToken(deviceToken), source });
}

export async function addMember(
  ctx: MutationCtx,
  groupId: Id<"groups">,
  userId: Id<"users">,
  joinedVia: "creator" | "invite" | "web" | "imessage",
): Promise<void> {
  if (await findMembership(ctx, groupId, userId)) return;
  const members = await ctx.db
    .query("memberships")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(100);
  const used = new Set(members.map((m) => m.color));
  const color = FLOWER_COLORS.find((c) => !used.has(c)) ?? FLOWER_COLORS[members.length % FLOWER_COLORS.length];
  await ctx.db.insert("memberships", { groupId, userId, color, joinedVia });
}

export async function createGroupFor(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  timezone: string,
  e2eRun?: string,
  holdEnabled?: boolean,
): Promise<{ groupId: Id<"groups">; inviteCode: string }> {
  const groupId = await ctx.db.insert("groups", {
    name: cleanName(name),
    createdBy: userId,
    timezone,
    e2eRun,
    holdEnabled,
  });
  await addMember(ctx, groupId, userId, "creator");
  const inviteCode = await freshInviteCode(ctx);
  await ctx.db.insert("invites", { code: inviteCode, groupId, createdBy: userId, kind: "group", revoked: false });
  return { groupId, inviteCode };
}

export const createGroup = mutation({
  args: {
    deviceToken: v.string(),
    firstName: v.string(),
    groupName: v.string(),
    timezone: v.optional(v.string()),
  },
  returns: v.object({ userId: v.id("users"), groupId: v.id("groups"), inviteCode: v.string() }),
  handler: async (ctx, args) => {
    const timezone = args.timezone ?? "America/Los_Angeles";
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    } catch {
      throw new ConvexError({ code: "BAD_TIMEZONE", message: "Unknown time zone" });
    }
    const userId = await upsertDeviceUser(ctx, args.deviceToken, args.firstName, "app");
    await rateLimiter.limit(ctx, "createGroup", { key: userId, throws: true });
    const { groupId, inviteCode } = await createGroupFor(
      ctx,
      userId,
      args.groupName,
      timezone,
    );
    return { userId, groupId, inviteCode };
  },
});

export const joinGroup = mutation({
  args: {
    deviceToken: v.string(),
    firstName: v.string(),
    inviteCode: v.string(),
    via: v.optional(v.union(v.literal("invite"), v.literal("web"))),
  },
  returns: v.object({ userId: v.id("users"), groupId: v.id("groups"), frolicId: v.union(v.id("frolics"), v.null()) }),
  handler: async (ctx, args) => await joinWithInvite(ctx, args),
});

export async function joinWithInvite(
  ctx: MutationCtx,
  args: { deviceToken: string; firstName: string; inviteCode: string; via?: "invite" | "web" },
) {
  assertDeviceToken(args.deviceToken);
  await rateLimiter.limit(ctx, "join", { key: await hashToken(args.deviceToken), throws: true });
  const invite = await liveInvite(ctx, args.inviteCode);
  const via = args.via ?? "invite";
  const userId = await upsertDeviceUser(ctx, args.deviceToken, args.firstName, via === "web" ? "web" : "app");
  await addMember(ctx, invite.groupId, userId, via);
  const frolic = invite.frolicId ? await ctx.db.get("frolics", invite.frolicId) : null;
  return { userId, groupId: invite.groupId, frolicId: frolic?.groupId === invite.groupId ? frolic._id : null };
}

export const createInvite = mutation({
  args: {
    deviceToken: v.string(),
    groupId: v.id("groups"),
    frolicId: v.optional(v.id("frolics")),
  },
  returns: v.string(),
  handler: async (ctx, args) => await createInviteFor(ctx, args),
});

export async function createInviteFor(
  ctx: MutationCtx,
  args: { deviceToken: string; groupId: Id<"groups">; frolicId?: Id<"frolics"> },
): Promise<string> {
  const user = await userFromToken(ctx, args.deviceToken);
  if (!(await findMembership(ctx, args.groupId, user._id))) {
    throw new ConvexError({ code: "NOT_A_MEMBER", message: "You are not in this crew" });
  }
  if (args.frolicId) {
    const frolic = await ctx.db.get("frolics", args.frolicId);
    if (!frolic || frolic.groupId !== args.groupId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "This frolic is gone" });
    }
  }
  const code = await freshInviteCode(ctx);
  await ctx.db.insert("invites", {
    code,
    groupId: args.groupId,
    createdBy: user._id,
    kind: args.frolicId ? "frolic" : "group",
    frolicId: args.frolicId,
    revoked: false,
  });
  return code;
}

export const invitePreview = query({
  args: { inviteCode: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      groupName: v.string(),
      invitedBy: v.string(),
      members: v.array(v.object({ name: v.string(), color: v.string() })),
      memberCount: v.number(),
    }),
  ),
  handler: async (ctx, { inviteCode }) => {
    const invite = await findInvite(ctx, inviteCode);
    if (!inviteIsLive(invite)) return null;
    const group = await ctx.db.get("groups", invite.groupId);
    const inviter = await ctx.db.get("users", invite.createdBy);
    if (!group || !inviter) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", group._id))
      .take(100);
    const members = [];
    for (const m of memberships.slice(0, 6)) {
      const u = await ctx.db.get("users", m.userId);
      if (u) members.push({ name: u.name, color: m.color });
    }
    return { groupName: group.name, invitedBy: inviter.name, members, memberCount: memberships.length };
  },
});

const PURGE_BATCH = 100;

export const me = query({
  args: { deviceToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      name: v.string(),
      photoUrl: v.union(v.string(), v.null()),
      groups: v.array(v.object({ groupId: v.id("groups"), name: v.string(), color: v.string() })),
    }),
  ),
  handler: async (ctx, { deviceToken }) => {
    const user = await findUserByToken(ctx, deviceToken);
    if (!user) return null;
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(50);
    const groups = [];
    for (const m of memberships) {
      const g = await ctx.db.get("groups", m.groupId);
      if (g) groups.push({ groupId: g._id, name: g.name, color: m.color });
    }
    return {
      userId: user._id,
      name: user.name,
      photoUrl: await photoUrlOf(ctx, user),
      groups,
    };
  },
});

export const updateProfile = mutation({
  args: {
    deviceToken: v.string(),
    firstName: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    avatarKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    if (args.avatarKey !== undefined && !isPortraitKey(args.avatarKey)) {
      throw new ConvexError({ code: "BAD_AVATAR", message: "That portrait does not exist" });
    }
    await ctx.db.patch("users", user._id, {
      ...(args.firstName !== undefined ? { name: cleanName(args.firstName) } : {}),
      ...(args.photoId !== undefined ? { photoId: args.photoId } : {}),
      ...(args.avatarKey !== undefined ? { avatarUrl: `/p/avatar/${args.avatarKey}.jpg` } : {}),
    });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: { deviceToken: v.string() },
  returns: v.string(),
  handler: async (ctx, { deviceToken }) => {
    await userFromToken(ctx, deviceToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const userByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
  },
});

export const joinAs = internalMutation({
  args: {
    userId: v.id("users"),
    inviteCode: v.string(),
    via: v.union(v.literal("invite"), v.literal("web"), v.literal("imessage")),
  },
  returns: v.id("groups"),
  handler: async (ctx, args) => {
    const invite = await liveInvite(ctx, args.inviteCode);
    await addMember(ctx, invite.groupId, args.userId, args.via);
    return invite.groupId;
  },
});

async function deleteFile(ctx: MutationCtx, storageId: Id<"_storage">): Promise<void> {
  try {
    await ctx.storage.delete(storageId);
  } catch {
    return;
  }
}

async function purgeFrolic(ctx: MutationCtx, frolicId: Id<"frolics">, userId: Id<"users">): Promise<void> {
  const snaps = await ctx.db
    .query("snaps")
    .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
    .collect();
  for (const snap of snaps) {
    await deleteFile(ctx, snap.storageId);
    await ctx.db.delete("snaps", snap._id);
  }
  for (const table of ["hopIns", "etas", "checkins"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
      .collect();
    for (const row of rows) await ctx.db.delete(table, row._id);
  }
  const logged = await ctx.db
    .query("revealLog")
    .withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId))
    .collect();
  for (const row of logged) if (row.userId === userId) await ctx.db.delete("revealLog", row._id);
}

async function leaveLiveFrolics(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const taps = await ctx.db.query("taps").withIndex("by_userId", (q) => q.eq("userId", userId)).take(PURGE_BATCH);
  for (const tap of taps) {
    const frolic = await ctx.db.get("frolics", tap.frolicId);
    if (frolic?.status === "open" && (await findMembership(ctx, frolic.groupId, userId))) {
      await removeTap(ctx, userId, frolic._id, false);
    }
  }
  const attendees = await ctx.db.query("attendees").withIndex("by_userId", (q) => q.eq("userId", userId)).take(PURGE_BATCH);
  const now = Date.now();
  for (const attendee of attendees) {
    if (attendee.status !== "going") continue;
    const frolic = await ctx.db.get("frolics", attendee.frolicId);
    if (frolic?.status !== "on") continue;
    if (await happened(ctx, frolic, now)) {
      await ctx.scheduler.runAfter(0, internal.whop.money.onBail, { frolicId: frolic._id, userId });
      continue;
    }
    await sitOutAndRefill(ctx, frolic, attendee, now);
  }
}

async function purgeRows(ctx: MutationCtx, user: Doc<"users">): Promise<boolean> {
  const userId = user._id;
  let finished = true;
  await leaveLiveFrolics(ctx, userId);
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(PURGE_BATCH);
  if (memberships.length === PURGE_BATCH) finished = false;
  for (const membership of memberships) {
    const availability = await ctx.db
      .query("availability")
      .withIndex("by_groupId_and_userId_and_day", (q) =>
        q.eq("groupId", membership.groupId).eq("userId", userId),
      )
      .take(PURGE_BATCH);
    if (availability.length === PURGE_BATCH) finished = false;
    for (const row of availability) await ctx.db.delete("availability", row._id);
    const frolics = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", membership.groupId))
      .take(PURGE_BATCH);
    if (frolics.length === PURGE_BATCH) finished = false;
    for (const frolic of frolics) await purgeFrolic(ctx, frolic._id, userId);
    await ctx.db.delete("memberships", membership._id);
  }
  for (const table of ["taps", "limits", "keikiLinks", "dailyPickAnswers"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(PURGE_BATCH);
    if (rows.length === PURGE_BATCH) finished = false;
    for (const row of rows) await ctx.db.delete(table, row._id);
  }
  const now = Date.now();
  let dropped = 0;
  for await (const attendee of ctx.db.query("attendees").withIndex("by_userId", (q) => q.eq("userId", userId))) {
    if (dropped === PURGE_BATCH) {
      finished = false;
      break;
    }
    const frolic = await ctx.db.get("frolics", attendee.frolicId);
    if (frolic && (await happened(ctx, frolic, now))) continue;
    await ctx.db.delete("attendees", attendee._id);
    dropped++;
  }
  return finished;
}

async function finishAccountDeletion(ctx: MutationCtx, user: Doc<"users">): Promise<boolean> {
  const finished = await purgeRows(ctx, user);
  if (!finished) {
    await ctx.scheduler.runAfter(0, internal.users.purgeAccount, { userId: user._id });
    return false;
  }
  if (user.photoId) await deleteFile(ctx, user.photoId);
  await ctx.db.delete("users", user._id);
  await ctx.scheduler.runAfter(0, internal.memory.account.deleteAccountMemory, { userId: user._id });
  return true;
}

export const deleteAccount = mutation({
  args: { deviceToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await finishAccountDeletion(ctx, user);
    return null;
  },
});

export const purgeAccount = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    await finishAccountDeletion(ctx, user);
    return null;
  },
});

export const createAs = internalMutation({
  args: { name: v.string(), phone: v.string() },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("users", { name: cleanName(args.name), phone: args.phone, source: "imessage" });
  },
});
