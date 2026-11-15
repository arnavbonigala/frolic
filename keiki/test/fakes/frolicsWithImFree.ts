import { v } from "convex/values";
import { internalMutation } from "../../../convex/_generated/server";
export * from "../../../convex/frolics";

export const imFreeAs = internalMutation({
  args: { userId: v.id("users"), groupId: v.id("groups"), forMinutes: v.number() },
  handler: async (_ctx, { forMinutes }) => ({ planTitle: "A walk at the marina", startsAt: Date.now() + forMinutes * 60_000 }),
});
