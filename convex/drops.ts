import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireMember, userFromToken } from "./lib/identity";
import { centsLabel, type DropOffer } from "./plans/engine";
import { whop } from "./whop/client";
import { whopConfig } from "./whop/config";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const DROP_SPECS = [
  {
    key: "cal-kayak-sunset",
    sellerName: "Cal Kayak Club",
    title: "Sunset kayaks",
    priceCents: 800,
    capacity: 12,
    placeSlug: "berkeley-marina",
    tags: ["water", "sunsets", "outdoors"],
    imageKey: "plan-sunsets",
    validDays: ALL_DAYS,
    startMinute: 15 * 60,
    endMinute: 19 * 60,
    durationMinutes: 90,
    description: "Paddle the Berkeley Marina at golden hour with Cal Kayak Club. Boats, paddles and life jackets included.",
  },
  {
    key: "ippudo-ramen-flight",
    sellerName: "Ippudo Berkeley",
    title: "Late-night ramen flight",
    priceCents: 1200,
    capacity: 10,
    placeSlug: "ippudo",
    tags: ["late_night_food", "food"],
    imageKey: "plan-late-night-food",
    validDays: ALL_DAYS,
    startMinute: 20 * 60,
    endMinute: 22 * 60,
    durationMinutes: 60,
    description: "Three half bowls of Ippudo's ramen to share, late in the evening, saved for your crew.",
  },
  {
    key: "game-table-night",
    sellerName: "The Game Table",
    title: "Board game night",
    priceCents: 500,
    capacity: 16,
    placeSlug: "victory-point-cafe",
    tags: ["games", "play"],
    imageKey: "plan-games",
    validDays: ALL_DAYS,
    startMinute: 18 * 60,
    endMinute: 23 * 60,
    durationMinutes: 120,
    description: "A reserved table and the whole game library for the evening, hosted by The Game Table.",
  },
] as const;

type Spec = (typeof DROP_SPECS)[number];

const vSpec = {
  key: v.string(),
  sellerName: v.string(),
  title: v.string(),
  priceCents: v.number(),
  capacity: v.number(),
  placeSlug: v.string(),
  tags: v.array(v.string()),
  imageKey: v.string(),
  validDays: v.array(v.number()),
  startMinute: v.number(),
  endMinute: v.number(),
  durationMinutes: v.number(),
};

async function seatsTaken(ctx: QueryCtx, dropId: Id<"drops">, day: string, exceptPlanId?: Id<"plans">): Promise<number> {
  const plans = await ctx.db
    .query("plans")
    .withIndex("by_dropId_and_day", (q) => q.eq("dropId", dropId).eq("day", day))
    .take(100);
  let taken = 0;
  for (const plan of plans) {
    if (plan._id === exceptPlanId) continue;
    const frolics = await ctx.db
      .query("frolics")
      .withIndex("by_groupId_and_day", (q) => q.eq("groupId", plan.groupId).eq("day", day))
      .take(10);
    for (const f of frolics) {
      if (f.planId !== plan._id || f.status !== "on") continue;
      const rows = await ctx.db.query("attendees").withIndex("by_frolicId", (q) => q.eq("frolicId", f._id)).take(100);
      taken += rows.filter((a) => a.status === "going").length;
    }
  }
  return taken;
}

const vOffer = v.object({
  dropId: v.string(),
  sellerName: v.string(),
  title: v.string(),
  priceCents: v.number(),
  seatsLeft: v.number(),
  placeSlug: v.string(),
  tags: v.array(v.string()),
  validDays: v.array(v.number()),
  startMinute: v.number(),
  endMinute: v.number(),
  durationMinutes: v.number(),
});

export const offers = internalQuery({
  args: { day: v.string() },
  returns: v.array(vOffer),
  handler: async (ctx, { day }): Promise<DropOffer[]> => {
    const rows = await ctx.db.query("drops").withIndex("by_active", (q) => q.eq("active", true)).take(50);
    const out: DropOffer[] = [];
    for (const d of rows) {
      if (!d.whopProductId || !d.whopPlanId) continue;
      out.push({
        dropId: d._id,
        sellerName: d.sellerName,
        title: d.title,
        priceCents: d.priceCents,
        seatsLeft: Math.max(0, d.capacity - (await seatsTaken(ctx, d._id, day))),
        placeSlug: d.placeSlug,
        tags: d.tags,
        validDays: d.validDays,
        startMinute: d.startMinute,
        endMinute: d.endMinute,
        durationMinutes: d.durationMinutes,
      });
    }
    return out;
  },
});

export const forPlan = query({
  args: { deviceToken: v.string(), frolicId: v.id("frolics") },
  returns: v.union(
    v.null(),
    v.object({
      dropId: v.id("drops"),
      sellerName: v.string(),
      hostedBy: v.string(),
      title: v.string(),
      priceCents: v.number(),
      priceLabel: v.string(),
      seatsLeft: v.number(),
      imageKey: v.string(),
    }),
  ),
  handler: async (ctx, { deviceToken, frolicId }) => {
    const user = await userFromToken(ctx, deviceToken);
    const frolic = await ctx.db.get("frolics", frolicId);
    if (!frolic) return null;
    await requireMember(ctx, frolic.groupId, user._id);
    const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
    const drop = plan?.dropId ? await ctx.db.get("drops", plan.dropId) : null;
    if (!plan || !drop) return null;
    return {
      dropId: drop._id,
      sellerName: drop.sellerName,
      hostedBy: "Hosted by " + drop.sellerName,
      title: drop.title,
      priceCents: drop.priceCents,
      priceLabel: centsLabel(drop.priceCents),
      seatsLeft: Math.max(0, drop.capacity - (await seatsTaken(ctx, drop._id, plan.day))),
      imageKey: drop.imageKey,
    };
  },
});

export const chargeTarget = internalQuery({
  args: { frolicId: v.id("frolics") },
  returns: v.union(v.null(), v.object({ productId: v.string(), planId: v.string(), priceCents: v.number(), dropId: v.id("drops") })),
  handler: async (ctx, { frolicId }) => {
    const frolic = await ctx.db.get("frolics", frolicId);
    const plan = frolic?.planId ? await ctx.db.get("plans", frolic.planId) : null;
    const drop = plan?.dropId ? await ctx.db.get("drops", plan.dropId) : null;
    if (!drop?.whopProductId || !drop.whopPlanId) return null;
    return { productId: drop.whopProductId, planId: drop.whopPlanId, priceCents: drop.priceCents, dropId: drop._id };
  },
});

export const byKey = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.null(), v.object({ whopProductId: v.union(v.string(), v.null()), whopPlanId: v.union(v.string(), v.null()), purchaseUrl: v.union(v.string(), v.null()) })),
  handler: async (ctx, { key }) => {
    const d = await ctx.db.query("drops").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return d ? { whopProductId: d.whopProductId ?? null, whopPlanId: d.whopPlanId ?? null, purchaseUrl: d.purchaseUrl ?? null } : null;
  },
});

export const upsert = internalMutation({
  args: { ...vSpec, whopProductId: v.string(), whopPlanId: v.string(), purchaseUrl: v.optional(v.string()) },
  returns: v.id("drops"),
  handler: async (ctx, args): Promise<Id<"drops">> => {
    const existing: Doc<"drops"> | null = await ctx.db.query("drops").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (existing) {
      await ctx.db.patch("drops", existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("drops", { ...args, active: true });
  },
});

const sku = (key: string) => "frolic-drop-" + key;

async function ensureWhop(spec: Spec, known: { whopProductId: string | null; whopPlanId: string | null; purchaseUrl: string | null } | null) {
  const accountId = whopConfig().accountId;
  if (!accountId) throw new Error("WHOP_ACCOUNT_ID is not set");
  let created = false;
  let productId = known?.whopProductId ?? null;
  if (!productId) {
    const found = await whop.listProducts({ account_id: accountId, query: spec.title, first: "50" });
    productId = found.find((p) => p.metadata?.frolic_drop === spec.key)?.id ?? null;
  }
  if (!productId) {
    const product = await whop.createProduct(
      {
        account_id: accountId,
        title: spec.title,
        headline: `Hosted by ${spec.sellerName} on Frolic`,
        description: spec.description,
        visibility: "visible",
        route: sku(spec.key),
        metadata: { frolic_drop: spec.key, seller: spec.sellerName },
      },
      sku(spec.key) + ":product",
    );
    productId = product.id;
    created = true;
  }
  let planId = known?.whopPlanId ?? null;
  let purchaseUrl = known?.purchaseUrl ?? null;
  if (!planId) {
    const existing = (await whop.listVariants({ account_id: accountId, sku: sku(spec.key), first: "10" }))[0];
    const variant =
      existing ??
      (await whop.createVariant(
        {
          account_id: accountId,
          product_id: productId,
          title: "One seat",
          description: `${spec.title} with ${spec.sellerName}, per person`,
          billing_type: "one_time",
          currency: "usd",
          initial_price: spec.priceCents / 100,
          visibility: "visible",
          release_method: "buy_now",
          unlimited_stock: true,
          sku: sku(spec.key),
          metadata: { frolic_drop: spec.key },
        },
        sku(spec.key) + ":variant",
      ));
    planId = variant.id;
    purchaseUrl = variant.purchase_url ?? purchaseUrl;
    created = created || !existing;
  }
  if (!purchaseUrl) {
    const checkout = await whop.createCheckoutConfiguration(
      { account_id: accountId, variant_id: planId, mode: "payment", metadata: { frolic_drop: spec.key } },
      sku(spec.key) + ":checkout",
    );
    purchaseUrl = checkout.purchase_url ?? null;
  }
  return { productId, planId, purchaseUrl, created };
}

export const seed = internalAction({
  args: {},
  returns: v.array(v.object({ key: v.string(), dropId: v.id("drops"), productId: v.string(), planId: v.string(), purchaseUrl: v.union(v.string(), v.null()), created: v.boolean() })),
  handler: async (ctx) => {
    const out = [];
    for (const spec of DROP_SPECS) {
      const known = await ctx.runQuery(internal.drops.byKey, { key: spec.key });
      const ids = await ensureWhop(spec, known);
      const dropId: Id<"drops"> = await ctx.runMutation(internal.drops.upsert, {
        key: spec.key,
        sellerName: spec.sellerName,
        title: spec.title,
        priceCents: spec.priceCents,
        capacity: spec.capacity,
        placeSlug: spec.placeSlug,
        imageKey: spec.imageKey,
        startMinute: spec.startMinute,
        endMinute: spec.endMinute,
        durationMinutes: spec.durationMinutes,
        tags: [...spec.tags],
        validDays: [...spec.validDays],
        whopProductId: ids.productId,
        whopPlanId: ids.planId,
        purchaseUrl: ids.purchaseUrl ?? undefined,
      });
      out.push({ key: spec.key, dropId, productId: ids.productId, planId: ids.planId, purchaseUrl: ids.purchaseUrl, created: ids.created });
    }
    return out;
  },
});
