import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WorkflowId } from "@convex-dev/workflow";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PLACE_BY_SLUG } from "../../convex/places/data";
import { localTimeToMs } from "../../convex/plans/time";
import { tripTo } from "../../convex/plans/travel";
import { makeT, token, type T } from "../backend/setup.helpers";

declare const process: { env: Record<string, string | undefined> };

const DAY = "2026-11-15";
const SATURDAY = "2026-11-21";
const SUNDAY = "2026-11-22";
const NOON = localTimeToMs(DAY, 12 * 60);
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

async function crew(names: string[], options: { days?: string[]; seedPlaces?: boolean } = {}) {
  const t = makeT();
  if (options.seedPlaces !== false) await t.mutation(internal.places.seed.seedPlaces, {});
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(names[0]),
    firstName: names[0],
    groupName: "Sunset Crew",
  });
  const ids: Record<string, Id<"users">> = { [names[0]]: created.userId };
  for (const name of names.slice(1)) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
    ids[name] = joined.userId;
  }
  await t.run(async (ctx) => {
    for (const userId of Object.values(ids)) {
      for (const day of options.days ?? [DAY]) {
        await ctx.db.insert("availability", { groupId: created.groupId, userId, day, state: "now", updatedAt: NOON });
      }
    }
  });
  return { t, groupId: created.groupId, ids, inviteCode: created.inviteCode };
}

type Run = Awaited<ReturnType<typeof crew>>;

async function settle(t: T, done: () => Promise<boolean>, ticks = 40): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    if (await done()) return;
    vi.advanceTimersByTime(TICK);
    await t.finishInProgressScheduledFunctions();
  }
}

const frolicsOf = async (run: Run) => await run.t.run(async (ctx) => await ctx.db.query("frolics").take(20));

const frolicOpened = (run: Run) => async () =>
  await run.t.run(async (ctx) =>
    (await ctx.db.query("frolics").take(20)).some((row) => row.status === "open" && row.planId !== undefined),
  );

const viewFor = async (run: Run, name: string) =>
  await run.t.query(api.frolics.today, { deviceToken: token(name), groupId: run.groupId });

const openView = async (run: Run) => {
  const view = await viewFor(run, "Maya");
  expect(view.phase).toBe("open");
  expect(view.frolic).not.toBeNull();
  return view;
};

describe("the drop leaves a plan everyone can tap", () => {
  test("a daily drop opens the frolic with the plan attached", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, frolicOpened(run));

    const view = await openView(run);
    const frolic = view.frolic!;
    expect(frolic.day).toBe(DAY);
    expect(frolic.origin).toBe("daily");
    expect(frolic.plan).not.toBeNull();
    expect(frolic.plan!.title.length).toBeGreaterThan(0);
    expect(frolic.plan!.place).not.toBeNull();
    expect(view.myTap).toBeNull();

    const stored = await run.t.run(async (ctx) => {
      const row = await ctx.db.get("frolics", frolic.frolicId);
      const plan = row?.planId ? await ctx.db.get("plans", row.planId) : null;
      const place = plan ? await ctx.db.get("places", plan.placeId) : null;
      return { row, plan, place };
    });
    expect(stored.plan).not.toBeNull();
    expect(stored.row!.planId).toBe(stored.plan!._id);

    const travel = tripTo(null, PLACE_BY_SLUG.get(stored.place!.slug)!).minutes;
    const leaveAt = stored.plan!.startsAt - travel * 60 * 1000;
    expect(frolic.deadline).toBe(leaveAt);
    expect(frolic.deadline).toBeLessThan(stored.plan!.startsAt);
    expect(frolic.deadline).toBeGreaterThan(NOON);
    expect(frolic.window.start).toBe(leaveAt);
    expect(frolic.window.end).toBe(stored.plan!.startsAt + stored.plan!.durationMinutes * 60 * 1000);
    expect(frolic.durationMinutes).toBe(stored.plan!.durationMinutes);
  });

  test("a tap on the dropped plan reads back as waiting", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, frolicOpened(run));

    const frolic = (await openView(run)).frolic!;
    await run.t.mutation(api.taps.tap, {
      deviceToken: token("Maya"),
      frolicId: frolic.frolicId,
      kind: "down",
    });

    const after = await viewFor(run, "Maya");
    expect(after.phase).toBe("waiting");
    expect(after.myTap?.kind).toBe("down");
    expect(after.frolic!.frolicId).toBe(frolic.frolicId);

    const friend = await viewFor(run, "Dev");
    expect(friend.phase).toBe("open");
    expect(friend.myTap).toBeNull();
  });

  test("running the drop twice in one day opens one frolic", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, frolicOpened(run));
    const first = (await openView(run)).frolic!;

    const second = await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, frolicOpened(run), 4);

    expect(second.started).toBe(0);
    expect(await frolicsOf(run)).toHaveLength(1);
    expect((await openView(run)).frolic!.frolicId).toBe(first.frolicId);
  });

  test("opening the same day again reuses the frolic", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, frolicOpened(run));

    const first = await run.t.mutation(internal.plans.drop.openDropFrolic, {
      groupId: run.groupId,
      day: DAY,
      kind: "daily",
    });
    const second = await run.t.mutation(internal.plans.drop.openDropFrolic, {
      groupId: run.groupId,
      day: DAY,
      kind: "daily",
    });
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(await frolicsOf(run)).toHaveLength(1);
  });

  test("a plan that cannot be written leaves no frolic behind", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"], { seedPlaces: false });
    await run.t.mutation(internal.plans.drop.dailyDrop, {});
    await settle(run.t, async () => false);

    const runs = await run.t.run(async (ctx) => await ctx.db.query("planRuns").take(5));
    expect(runs).toHaveLength(1);
    expect(await run.t.run(async (ctx) => await ctx.db.query("plans").take(5))).toHaveLength(0);
    expect(await frolicsOf(run)).toHaveLength(0);

    const view = await viewFor(run, "Maya");
    expect(view.phase).toBe("none");
    expect(view.frolic).toBeNull();
  });

  test("a plan already past its start does not open a dead frolic", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    await run.t.mutation(internal.plans.drop.writePlan, {
      groupId: run.groupId,
      day: DAY,
      kind: "daily",
      plan: {
        placeSlug: "rose-garden",
        title: "Golden hour at Cragmont Rock",
        line: "Clear and 62 degrees.",
        why: "it's free and it looks at the Golden Gate.",
        whySource: "template",
        whyMemoryId: null,
        whyInputs: {
          placeName: "Cragmont Rock Park",
          memory: null,
          topTags: ["sunsets"],
          weather: "Clear, 62 degrees",
          tempF: 62,
          sunsetAt: NOON,
          rainSwap: false,
        },
        chips: ["Free", "12 min walk"],
        cost: 0,
        costLabel: "Free",
        payUpFront: false,
        startsAt: NOON - 60 * 60 * 1000,
        durationMinutes: 60,
        meetingPoint: { lat: 37.8932, lng: -122.2649, label: "The lookout" },
        sunsetAt: NOON,
        weather: "Clear, 62 degrees",
        weatherSwap: false,
        favoredUserId: null,
        source: "scorer",
      },
    });

    expect(
      await run.t.mutation(internal.plans.drop.openDropFrolic, {
        groupId: run.groupId,
        day: DAY,
        kind: "daily",
      }),
    ).toBeNull();
    expect(await frolicsOf(run)).toHaveLength(0);
  });

  test("a drop that falls back still leaves a frolic to tap", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    const planId = await run.t.mutation(internal.plans.drop.dropComplete, {
      workflowId: "wf_00000000000000000000000000000001" as WorkflowId,
      result: { kind: "failed", error: "pick failed" },
      context: { groupId: run.groupId, day: DAY, kind: "daily" },
    });
    expect(planId).not.toBeNull();

    const frolic = (await openView(run)).frolic!;
    expect(frolic.plan).not.toBeNull();
    const stored = await run.t.run(async (ctx) => await ctx.db.get("frolics", frolic.frolicId));
    expect(stored!.planId).toBe(planId);
  });

  test("the weekend drop opens a frolic for each weekend day", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"], { days: [DAY, SATURDAY, SUNDAY] });
    const started = await run.t.mutation(internal.plans.drop.weekendDrop, {});
    expect(started.started).toBe(2);
    await settle(run.t, async () => (await frolicsOf(run)).length === 2, 80);

    const rows = await frolicsOf(run);
    expect(rows.map((row) => row.day).sort()).toEqual([SATURDAY, SUNDAY]);
    expect(rows.every((row) => row.status === "open")).toBe(true);
    expect(rows.every((row) => row.planId !== undefined)).toBe(true);
    expect(rows.every((row) => row.kind === "weekend")).toBe(true);
  });

  test("the free path still attaches its own plan and opens no second frolic", async () => {
    const run = await crew(["Maya", "Dev", "Jordan"]);
    const started = await run.t.mutation(api.frolics.imFree, {
      deviceToken: token("Maya"),
      groupId: run.groupId,
      forMinutes: 120,
    });
    await settle(run.t, async () => {
      const row = await run.t.run(async (ctx) => await ctx.db.get("frolics", started.frolicId));
      return row?.planId !== undefined;
    });

    const free = await run.t.run(async (ctx) => await ctx.db.get("frolics", started.frolicId));
    expect(free!.origin).toBe("free");
    expect(free!.planId).toBeDefined();
    expect((await frolicsOf(run)).filter((row) => row.origin !== "free")).toHaveLength(0);
  });
});
