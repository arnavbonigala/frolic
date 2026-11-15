import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeT } from "../tests/setup.helpers";
import { addDays, localTimeToMs } from "./time";

const DAY = "2026-11-15";
const NOON = localTimeToMs(DAY, 12 * 60);
const MIDNIGHT = localTimeToMs(addDays(DAY, 1), 0);

type Member = {
  name: string;
  availability?: { state: "now" | "window" | "busy"; start?: number; end?: number } | null;
  limits?: { budgetCap?: number; energy?: "chill" | "anything"; maxMinutes?: number; homeBy?: number };
};

async function crew(names: Member[], extra: { day?: string; taste?: string[] } = {}) {
  const t = makeT();
  const day = extra.day ?? DAY;
  const groupId = await t.run(async (ctx) => {
    const createdBy = await ctx.db.insert("users", { name: "Maya", source: "app" });
    const groupId = await ctx.db.insert("groups", { name: "Sunset Crew", createdBy, timezone: "America/Los_Angeles" });
    for (const member of names) {
      const userId = await ctx.db.insert("users", { name: member.name, source: "app" });
      await ctx.db.insert("memberships", { groupId, userId, color: "cobalt", joinedVia: "invite" });
      if (member.availability) {
        await ctx.db.insert("availability", {
          groupId,
          userId,
          day,
          state: member.availability.state,
          window:
            member.availability.start !== undefined && member.availability.end !== undefined
              ? { start: member.availability.start, end: member.availability.end }
              : undefined,
          updatedAt: NOON,
        });
      }
      if (member.limits) {
        await ctx.db.insert("limits", { userId, updatedAt: NOON, ...member.limits });
      }
    }
    if (extra.taste) {
      await ctx.db.insert("tasteProfiles", { groupId, tags: extra.taste, updatedAt: NOON });
    }
    return groupId;
  });
  return { t, groupId };
}

const inputs = async (t: ReturnType<typeof makeT>, groupId: Id<"groups">, day = DAY, nowMs = NOON) =>
  await t.query(internal.plans.inputs.dropInputs, { groupId, day, nowMs });

describe("dropInputs", () => {
  test("skips busy members and members with no row for the day", async () => {
    const { t, groupId } = await crew([
      { name: "Maya", availability: { state: "now" } },
      { name: "Dev", availability: { state: "busy" } },
      { name: "Jordan", availability: null },
    ]);
    const result = await inputs(t, groupId);
    expect(result.attendees.map((a) => a.userId)).toHaveLength(1);
    expect(result.nowMs).toBe(NOON);
  });

  test("now means from now until the end of the local day", async () => {
    const { t, groupId } = await crew([{ name: "Maya", availability: { state: "now" } }]);
    const result = await inputs(t, groupId);
    expect(result.attendees[0].window).toEqual({ start: NOON, end: MIDNIGHT });
  });

  test("window uses the window the member gave", async () => {
    const start = localTimeToMs(DAY, 18 * 60);
    const end = localTimeToMs(DAY, 21 * 60);
    const { t, groupId } = await crew([{ name: "Maya", availability: { state: "window", start, end } }]);
    const result = await inputs(t, groupId);
    expect(result.attendees[0].window).toEqual({ start, end });
  });

  test("limits map onto the engine shape and a missing row means no limit", async () => {
    const { t, groupId } = await crew([
      {
        name: "Maya",
        availability: { state: "now" },
        limits: { budgetCap: 2500, energy: "chill", maxMinutes: 30, homeBy: 22 * 60 },
      },
      { name: "Dev", availability: { state: "now" } },
    ]);
    const result = await inputs(t, groupId);
    const maya = result.attendees.find((a) => a.limits.budgetCents === 2500);
    expect(maya?.limits).toEqual({ budgetCents: 2500, energy: "chill", maxMinutes: 30, homeBy: 22 * 60 });
    const dev = result.attendees.find((a) => a.limits.budgetCents !== 2500);
    expect(dev?.limits).toEqual({ budgetCents: null, energy: "anything", maxMinutes: null, homeBy: null });
  });

  test("taste comes from the group taste profile for everyone", async () => {
    const { t, groupId } = await crew(
      [
        { name: "Maya", availability: { state: "now" } },
        { name: "Dev", availability: { state: "now" } },
      ],
      { taste: ["sunsets", "boba"] },
    );
    const result = await inputs(t, groupId);
    expect(result.attendees.map((a) => a.taste)).toEqual([
      ["sunsets", "boba"],
      ["sunsets", "boba"],
    ]);
  });

  test("history covers the previous 21 days and drops favorites for now", async () => {
    const { t, groupId } = await crew([{ name: "Maya", availability: { state: "now" } }]);
    const placeId = await t.run(async (ctx) =>
      await ctx.db.insert("places", {
        slug: "rose-garden",
        name: "Rose Garden",
        title: "Rose Garden",
        address: "1200 Euclid Ave",
        lat: 37.8759,
        lng: -122.2591,
        cost: 0,
        costPerPersonCents: 0,
        costLabel: "Free",
        payUpFront: false,
        priceVerified: true,
        tags: ["outdoors"],
        hours: [{ day: 0, open: 360, close: 1320 }],
        indoor: false,
        sober: true,
        energy: "chill",
        needsDaylight: true,
        durationMinutes: 60,
        meetSpot: "The gate",
        source: "test",
      }),
    );
    await t.run(async (ctx) => {
      for (const day of [addDays(DAY, -3), addDays(DAY, -20), addDays(DAY, -30), DAY]) {
        await ctx.db.insert("plans", {
          groupId,
          day,
          kind: "daily",
          placeId,
          title: "Rose Garden",
          line: "Sunset.",
          cost: 0,
          costLabel: "Free",
          payUpFront: false,
          chips: [],
          whySource: "template",
          whyInputs: { placeName: "Rose Garden", topTags: [], rainSwap: false },
          weatherSwap: false,
          startsAt: NOON,
          durationMinutes: 60,
          sunsetAt: NOON,
          source: "scorer",
          generatedAt: NOON,
        });
      }
    });
    const result = await inputs(t, groupId);
    expect(result.history.map((h) => h.day).sort()).toEqual([addDays(DAY, -20), addDays(DAY, -3)]);
    expect(result.history.every((h) => h.placeSlug === "rose-garden")).toBe(true);
    expect(result.history.every((h) => h.favoredUserId === null)).toBe(true);
  });

  test("last frolic day is the newest frolic marked done", async () => {
    const { t, groupId } = await crew([{ name: "Maya", availability: { state: "now" } }]);
    await t.run(async (ctx) => {
      for (const [day, status] of [
        [addDays(DAY, -1), "faded"],
        [addDays(DAY, -2), "done"],
        [addDays(DAY, -5), "done"],
      ] as const) {
        await ctx.db.insert("frolics", {
          groupId,
          day,
          kind: "daily",
          status,
          window: { start: NOON, end: NOON + 3_600_000 },
          durationMinutes: 60,
          deadline: NOON,
        });
      }
    });
    const result = await inputs(t, groupId);
    expect(result.lastFrolicDay).toBe(addDays(DAY, -2));
  });
});
