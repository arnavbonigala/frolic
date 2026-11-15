import { env } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function photoUrlOf(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<string | null> {
  if (user.avatarUrl) {
    return user.avatarUrl.startsWith("/") ? `${env.CONVEX_SITE_URL}${user.avatarUrl}` : user.avatarUrl;
  }
  return user.photoId ? await ctx.storage.getUrl(user.photoId) : null;
}
