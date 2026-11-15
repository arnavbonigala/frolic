import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const onDrop = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async () => null,
});

export const onReveal = internalMutation({
  args: { frolicId: v.id("frolics"), userIds: v.array(v.id("users")), bloomAt: v.number() },
  handler: async () => null,
});

export const onLeaveNudge = internalMutation({
  args: { frolicId: v.id("frolics"), leaveAt: v.number() },
  handler: async () => null,
});

export const onSnapWindow = internalMutation({
  args: { frolicId: v.id("frolics"), snapAt: v.number() },
  handler: async () => null,
});

export const onFaded = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async () => null,
});

export const onCollage = internalMutation({
  args: { frolicId: v.id("frolics"), storageId: v.id("_storage") },
  handler: async () => null,
});
