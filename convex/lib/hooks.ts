import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function planFacts(ctx: MutationCtx, frolic: Doc<"frolics">) {
  const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
  const place = plan ? await ctx.db.get("places", plan.placeId) : null;
  return {
    title: plan?.title ?? "",
    tags: place?.tags ?? [],
    placeId: place?._id,
    placeName: place?.name ?? "",
    day: frolic.day,
  };
}

export async function names(ctx: MutationCtx, ids: Id<"users">[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) {
    const u = await ctx.db.get("users", id);
    if (u) out.push(u.name);
  }
  return out;
}

export async function recordTap(
  ctx: MutationCtx,
  frolic: Doc<"frolics">,
  tap: Doc<"taps">,
): Promise<void> {
  const facts = await planFacts(ctx, frolic);
  const base = {
    eventKey: `tap:${tap._id}:${tap.updatedAt}`,
    groupId: frolic.groupId,
    userId: tap.userId,
    frolicId: frolic._id,
    source: tap.source,
  };
  if (tap.kind === "notToday") {
    await ctx.runMutation(internal.memory.events.recordEvent, {
      ...base,
      kind: "skip",
      payload: { title: facts.title, tags: facts.tags, day: facts.day },
    });
    return;
  }
  await ctx.runMutation(internal.memory.events.recordEvent, {
    ...base,
    kind: tap.onlyIf.length ? "only_if" : "tap",
    payload: { title: facts.title, tags: facts.tags, day: facts.day, onlyIfNames: await names(ctx, tap.onlyIf) },
  });
}
