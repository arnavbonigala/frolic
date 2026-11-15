import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import {
  assertDeviceToken,
  cleanName,
  findMembership,
  findUserByToken,
  hashToken,
  newCode,
  userFromToken,
} from "./lib/identity";
import { rateLimiter } from "./lib/rateLimits";

export const FLOWER_COLORS = ["pink", "cobalt", "moss", "marigold", "tomato", "lilac"] as const;

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
): Promise<{ groupId: Id<"groups">; inviteCode: string }> {
  const groupId = await ctx.db.insert("groups", { name: cleanName(name), createdBy: userId, timezone, e2eRun });
  await addMember(ctx, groupId, userId, "creator");
  const inviteCode = newCode();
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
    const userId = await upsertDeviceUser(ctx, args.deviceToken, args.firstName, "app");
    await rateLimiter.limit(ctx, "createGroup", { key: userId, throws: true });
    const { groupId, inviteCode } = await createGroupFor(
      ctx,
      userId,
      args.groupName,
      args.timezone ?? "America/Los_Angeles",
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
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "join", { key: args.inviteCode.toUpperCase(), throws: true });
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.inviteCode.trim().toUpperCase()))
      .unique();
    if (!invite || invite.revoked || (invite.expiresAt !== undefined && invite.expiresAt < Date.now())) {
      throw new ConvexError({ code: "BAD_INVITE", message: "This invite link expired" });
    }
    const via = args.via ?? "invite";
    const userId = await upsertDeviceUser(ctx, args.deviceToken, args.firstName, via === "web" ? "web" : "app");
    await addMember(ctx, invite.groupId, userId, via);
    return { userId, groupId: invite.groupId, frolicId: invite.frolicId ?? null };
  },
});

export const createInvite = mutation({
  args: {
    deviceToken: v.string(),
    groupId: v.id("groups"),
    frolicId: v.optional(v.id("frolics")),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
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
    const code = newCode();
    await ctx.db.insert("invites", {
      code,
      groupId: args.groupId,
      createdBy: user._id,
      kind: args.frolicId ? "frolic" : "group",
      frolicId: args.frolicId,
      revoked: false,
    });
    return code;
  },
});

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
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", inviteCode.trim().toUpperCase()))
      .unique();
    if (!invite || invite.revoked) return null;
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
      photoUrl: user.photoId ? await ctx.storage.getUrl(user.photoId) : null,
      groups,
    };
  },
});

export const updateProfile = mutation({
  args: { deviceToken: v.string(), firstName: v.optional(v.string()), photoId: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await userFromToken(ctx, args.deviceToken);
    await ctx.db.patch("users", user._id, {
      ...(args.firstName !== undefined ? { name: cleanName(args.firstName) } : {}),
      ...(args.photoId !== undefined ? { photoId: args.photoId } : {}),
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
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { phone }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    return user?._id ?? null;
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
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_code", (q) => q.eq("code", args.inviteCode.trim().toUpperCase()))
      .unique();
    if (!invite || invite.revoked) throw new ConvexError({ code: "BAD_INVITE", message: "This invite link expired" });
    await addMember(ctx, invite.groupId, args.userId, args.via);
    return invite.groupId;
  },
});
