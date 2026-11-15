import { v } from "convex/values";
import { happened, varietyOf, VARIETIES } from "./garden";
import { memberCrews } from "./lib/crews";
import { userFromToken } from "./lib/identity";
import { query } from "./_generated/server";

const SCAN = 60;
const NIGHT_ROWS = 20;

const variety = v.union(
  v.literal("goldenPoppy"),
  v.literal("wildLupine"),
  v.literal("nightJasmine"),
  v.literal("sweetPea"),
  v.literal("daisy"),
  v.literal("ranunculus"),
);

export const totals = query({
  args: { deviceToken: v.string() },
  returns: v.object({
    frolics: v.number(),
    crews: v.number(),
    varieties: v.array(v.object({ key: variety, name: v.string(), count: v.number() })),
  }),
  handler: async (ctx, { deviceToken }) => {
    const user = await userFromToken(ctx, deviceToken);
    const crews = await memberCrews(ctx, user._id);
    const mine = await ctx.db
      .query("attendees")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(200);
    const nights = new Set(mine.filter((row) => row.status === "going").map((row) => row.frolicId));
    const now = Date.now();
    const picked = new Map<string, number>();
    let frolics = 0;
    for (const { group } of crews) {
      const rows = await ctx.db
        .query("frolics")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", group._id))
        .order("desc")
        .take(SCAN);
      for (const frolic of rows) {
        if (!nights.has(frolic._id)) continue;
        if (!(await happened(ctx, frolic, now))) continue;
        frolics++;
        const attendees = await ctx.db
          .query("attendees")
          .withIndex("by_frolicId", (q) => q.eq("frolicId", frolic._id))
          .take(NIGHT_ROWS);
        if (attendees.filter((row) => row.status === "going").length < 2) continue;
        const plan = frolic.planId ? await ctx.db.get("plans", frolic.planId) : null;
        const place = plan ? await ctx.db.get("places", plan.placeId) : null;
        const key = varietyOf({ plan, place });
        if (key) picked.set(key, (picked.get(key) ?? 0) + 1);
      }
    }
    return {
      frolics,
      crews: crews.length,
      varieties: VARIETIES.filter((item) => (picked.get(item.key) ?? 0) > 0).map((item) => ({
        key: item.key,
        name: item.name,
        count: picked.get(item.key) ?? 0,
      })),
    };
  },
});
