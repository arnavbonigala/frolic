import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { hashToken } from "../lib/identity";
import { addMember, createGroupFor } from "../users";

const ZONE = "America/Los_Angeles";
const RENAMES: Record<string, string> = { Maya: "Arnav", Dev: "Dan", Jordan: "Nhi", Priya: "Hannah" };

function deviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function rename(text: string): string {
  return Object.entries(RENAMES).reduce((out, [from, to]) => out.replaceAll(from, to), text);
}

type Seeded = { userId: Id<"users">; deviceToken: string };

function pick(user: Seeded): Seeded {
  return { userId: user.userId, deviceToken: user.deviceToken };
}

const person = v.object({ userId: v.id("users"), deviceToken: v.string() });

export const seed = internalMutation({
  args: { run: v.string() },
  returns: v.object({
    groupId: v.id("groups"),
    peaceId: v.id("groups"),
    users: v.object({ arnav: person, dan: person, nhi: person, hannah: person, erick: person, meena: person }),
  }),
  handler: async (ctx, { run }): Promise<{ groupId: Id<"groups">; peaceId: Id<"groups">; users: Record<"arnav" | "dan" | "nhi" | "hannah" | "erick" | "meena", Seeded> }> => {
    const base: { groupId: Id<"groups">; users: Record<"maya" | "dev" | "jordan" | "priya", Seeded> } = await ctx.runMutation(internal.e2e.admin.seed, { run, scenario: "demo" });
    const { groupId } = base;
    const pairs: Array<[string, { userId: Id<"users">; deviceToken: string }]> = [
      ["Arnav", base.users.maya],
      ["Dan", base.users.dev],
      ["Nhi", base.users.jordan],
      ["Hannah", base.users.priya],
    ];
    for (const [name, user] of pairs) {
      await ctx.db.patch(user.userId, { name, avatarUrl: undefined });
    }
    await ctx.db.patch(groupId, { name: "Delulu Gangalang" });

    const extra: Record<string, { userId: Id<"users">; deviceToken: string }> = {};
    for (const name of ["Erick", "Meena"]) {
      const token = deviceToken();
      const userId = await ctx.db.insert("users", { name, tokenHash: await hashToken(token), source: "app" });
      await addMember(ctx, groupId, userId, "invite");
      extra[name] = { userId, deviceToken: token };
    }
    const now = Date.now();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(now));
    await ctx.db.insert("availability", { groupId, userId: extra.Erick.userId, day: today, state: "now", minutesAway: 9, updatedAt: now });

    const plans = await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", groupId)).take(50);
    for (const plan of plans) {
      await ctx.db.patch(plan._id, { title: rename(plan.title), line: rename(plan.line), why: plan.why ? rename(plan.why) : plan.why });
    }

    const tastes: Array<[Id<"groups">, string[]]> = [];
    const { groupId: peaceId } = await createGroupFor(ctx, base.users.maya.userId, "Peace", ZONE, run);
    tastes.push([groupId, ["sunsets", "late_night_food", "games", "boba", "music"]], [peaceId, ["coffee", "books", "outdoors", "dessert"]]);
    for (const [group, tags] of tastes) {
      const row = await ctx.db.query("tasteProfiles").withIndex("by_groupId", (q) => q.eq("groupId", group)).unique();
      if (row) await ctx.db.patch(row._id, { tags, updatedAt: now });
      else await ctx.db.insert("tasteProfiles", { groupId: group, tags, updatedAt: now });
    }
    await addMember(ctx, peaceId, base.users.dev.userId, "invite");
    await addMember(ctx, peaceId, base.users.jordan.userId, "invite");

    return {
      groupId,
      peaceId,
      users: {
        arnav: pick(base.users.maya),
        dan: pick(base.users.dev),
        nhi: pick(base.users.jordan),
        hannah: pick(base.users.priya),
        erick: extra.Erick,
        meena: extra.Meena,
      },
    };
  },
});
