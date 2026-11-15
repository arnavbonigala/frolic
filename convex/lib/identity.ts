import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function assertDeviceToken(token: string): void {
  if (token.length < 32 || token.length > 256) {
    throw new ConvexError({ code: "BAD_TOKEN", message: "Device token must be 32 to 256 characters" });
  }
}

export async function findUserByToken(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"users"> | null> {
  const tokenHash = await hashToken(token);
  return await ctx.db
    .query("users")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

export async function userFromToken(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  const user = await findUserByToken(ctx, token);
  if (!user) {
    throw new ConvexError({ code: "UNKNOWN_DEVICE", message: "This device is not signed in" });
  }
  return user;
}

export async function findMembership(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  userId: Id<"users">,
): Promise<Doc<"memberships"> | null> {
  return await ctx.db
    .query("memberships")
    .withIndex("by_groupId_and_userId", (q) =>
      q.eq("groupId", groupId).eq("userId", userId),
    )
    .unique();
}

export async function requireMember(
  ctx: QueryCtx,
  groupId: Id<"groups">,
  userId: Id<"users">,
): Promise<Doc<"memberships">> {
  const membership = await findMembership(ctx, groupId, userId);
  if (!membership) {
    throw new ConvexError({ code: "NOT_A_MEMBER", message: "You are not in this crew" });
  }
  return membership;
}

export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 40) {
    throw new ConvexError({ code: "BAD_NAME", message: "Names are 1 to 40 characters" });
  }
  return trimmed;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
