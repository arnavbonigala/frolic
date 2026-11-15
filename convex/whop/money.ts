import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const onReveal = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async () => null,
});

export const onJoin = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  handler: async () => null,
});

export const onBail = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  handler: async () => null,
});

export const onArrive = internalMutation({
  args: { frolicId: v.id("frolics"), userId: v.id("users") },
  handler: async () => null,
});

export const onDone = internalMutation({
  args: { frolicId: v.id("frolics") },
  handler: async () => null,
});
