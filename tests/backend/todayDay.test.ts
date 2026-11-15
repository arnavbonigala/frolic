import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { localTimeToMs } from "../../convex/plans/time";
import { makeT, token, type T } from "../backend/setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const THURSDAY = "2026-11-12";
const SATURDAY = "2026-11-14";
const SUNDAY = "2026-11-15";
const NOON = localTimeToMs(THURSDAY, 12 * 60);
const TICK = 30_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
});

async function settle(t: T, done: () => Promise<boolean>, ticks = 80): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    if (await done()) return;
    vi.advanceTimersByTime(TICK);
    await t.finishInProgressScheduledFunctions();
  }
}

async function crewOfThree() {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token("Maya"),
    firstName: "Maya",
    groupName: "Sunset Crew",
  });
  const ids: Id<"users">[] = [created.userId];
  for (const name of ["Dev", "Jordan"]) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
    ids.push(joined.userId);
  }
  await t.run(async (ctx) => {
    for (const userId of ids) {
      for (const day of [THURSDAY, SATURDAY, SUNDAY]) {
        await ctx.db.insert("availability", { groupId: created.groupId, userId, day, state: "now", updatedAt: NOON });
      }
    }
  });
  return { t, groupId: created.groupId };
}

const frolicDays = async (t: T) =>
  await t.run(async (ctx) => (await ctx.db.query("frolics").take(20)).map((row) => row.day).sort());

describe("today picks the day it is, not a future one", () => {
  test("a weekend drop on Thursday leaves today on today", async () => {
    const run = await crewOfThree();
    await run.t.mutation(internal.plans.drop.weekendDrop, {});
    await settle(run.t, async () => (await frolicDays(run.t)).length === 2);
    expect(await frolicDays(run.t)).toEqual([SATURDAY, SUNDAY]);

    const weekendOnly = await run.t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: run.groupId });
    expect(weekendOnly.frolic).toBeNull();
    expect(weekendOnly.phase).toBe("none");

    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, async () => (await frolicDays(run.t)).length === 3);

    const today = await run.t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: run.groupId });
    expect(today.frolic!.day).toBe(THURSDAY);
    expect(today.phase).toBe("open");
  });

  test("on Saturday itself the Saturday frolic is the plan", async () => {
    const run = await crewOfThree();
    await run.t.mutation(internal.plans.drop.weekendDrop, {});
    await settle(run.t, async () => (await frolicDays(run.t)).length === 2);

    vi.setSystemTime(localTimeToMs(SATURDAY, 12 * 60));
    const saturday = await run.t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: run.groupId });
    expect(saturday.frolic!.day).toBe(SATURDAY);
    expect(saturday.phase).toBe("open");

    vi.setSystemTime(localTimeToMs(SUNDAY, 12 * 60));
    const sunday = await run.t.query(api.frolics.today, { deviceToken: token("Maya"), groupId: run.groupId });
    expect(sunday.frolic!.day).toBe(SUNDAY);
  });
});
