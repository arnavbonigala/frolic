import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { flowerColor } from "../schema";
import { photoUrlOf } from "./photo";

export const face = v.object({
  userId: v.id("users"),
  name: v.string(),
  color: flowerColor,
  photoUrl: v.union(v.string(), v.null()),
  isMe: v.boolean(),
});

export type Face = {
  userId: Id<"users">;
  name: string;
  color: Doc<"memberships">["color"];
  photoUrl: string | null;
  isMe: boolean;
};

export async function facesOf(
  ctx: QueryCtx,
  memberships: Doc<"memberships">[],
  meId: Id<"users">,
): Promise<Face[]> {
  const faces = [];
  for (const membership of memberships) {
    const user = await ctx.db.get("users", membership.userId);
    if (!user) continue;
    faces.push({
      userId: user._id,
      name: user.name,
      color: membership.color,
      photoUrl: await photoUrlOf(ctx, user),
      isMe: user._id === meId,
    });
  }
  return faces;
}

export function dayIn(timezone: string, at: number): string {
  const options = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  try {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: timezone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "America/Los_Angeles" }).format(at);
  }
}

export type CrewRow = { membership: Doc<"memberships">; group: Doc<"groups"> };

export async function memberCrews(ctx: QueryCtx, userId: Id<"users">): Promise<CrewRow[]> {
  const memberships = await ctx.db
    .query("memberships")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(20);
  const out: CrewRow[] = [];
  for (const membership of memberships) {
    const group = await ctx.db.get("groups", membership.groupId);
    if (group) out.push({ membership, group });
  }
  return out;
}
