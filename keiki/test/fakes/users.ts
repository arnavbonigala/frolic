import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";

export const createAs = internalMutation({
  args: { name: v.string(), phone: v.string() },
  handler: async (ctx, { name, phone }) => {
    const existing = await ctx.db.query("users").withIndex("by_phone", (q) => q.eq("phone", phone)).first();
    if (existing) return existing._id;
    return await ctx.db.insert("users", { name, phone, source: "imessage" });
  },
});

export const joinAs = internalMutation({
  args: { userId: v.id("users"), inviteCode: v.string(), via: v.string() },
  handler: async (ctx, { userId, inviteCode }) => {
    const invite = await ctx.db.query("invites").withIndex("by_code", (q) => q.eq("code", inviteCode)).unique();
    if (!invite) throw new Error("bad invite");
    await ctx.db.insert("memberships", { groupId: invite.groupId, userId, color: "moss", joinedVia: "imessage" });
    return null;
  },
});
