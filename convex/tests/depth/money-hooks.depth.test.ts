import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../_generated/api";
import { HOUR, NOON, flipDue, makeT, setupCrew, tap, token, type T } from "../setup.helpers";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function jobs(t: T) {
  return (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).map((s) => ({
    name: s.name.replace(".js", ""),
    state: s.state.kind,
    args: (s.args as Array<Record<string, string>>)[0],
  }));
}

const fired = async (t: T, name: string) => (await jobs(t)).filter((j) => j.name === name);

describe("money hooks", () => {
  test("a reveal calls the deposit hook exactly once", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await fired(t, "whop/money:onReveal")).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    await t.finishInProgressScheduledFunctions();
    expect((await fired(t, "whop/money:onReveal")).map((j) => j.state)).toEqual(["success"]);
    await flipDue(t, 3000);
    expect(await fired(t, "whop/money:onReveal")).toHaveLength(1);
  });

  test("hop in after the reveal calls the join hook for that person", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await fired(t, "whop/money:onJoin")).toHaveLength(0);

    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe("going");
    const joins = await fired(t, "whop/money:onJoin");
    expect(joins).toHaveLength(1);
    expect(joins[0].args).toEqual({ frolicId: crew.frolicId, userId: crew.ids.Jordan });
  });

  test("a late tap that fits calls the join hook and one that does not fit does not", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);

    await tap(t, crew, "Jordan", { onlyIf: ["Priya"] });
    expect(await fired(t, "whop/money:onJoin")).toHaveLength(0);
    await tap(t, crew, "Jordan", { onlyIf: ["Maya"] });
    const joins = await fired(t, "whop/money:onJoin");
    expect(joins).toHaveLength(1);
    expect(joins[0].args.userId).toBe(crew.ids.Jordan);
  });

  test("a waiting hop in calls nothing, and sitting out calls bail then refill", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"], { capacity: 2 });
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);

    expect(await t.mutation(api.frolics.hopIn, { deviceToken: token("Jordan"), frolicId: crew.frolicId })).toBe(
      "waiting",
    );
    expect(await fired(t, "whop/money:onJoin")).toHaveLength(0);

    await t.mutation(api.frolics.sitOut, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    const bails = await fired(t, "whop/money:onBail");
    expect(bails).toHaveLength(1);
    expect(bails[0].args).toEqual({ frolicId: crew.frolicId, userId: crew.ids.Dev });
    const joins = await fired(t, "whop/money:onJoin");
    expect(joins).toHaveLength(1);
    expect(joins[0].args.userId).toBe(crew.ids.Jordan);
  });

  test("arrive fires on the first check in only", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    await t.mutation(api.checkins.checkInMe, { deviceToken: token("Maya"), frolicId: crew.frolicId, method: "manual" });
    const arrives = await fired(t, "whop/money:onArrive");
    expect(arrives).toHaveLength(1);
    expect(arrives[0].args).toEqual({ frolicId: crew.frolicId, userId: crew.ids.Maya });
  });

  test("done fires when the frolic finishes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    expect(await fired(t, "whop/money:onDone")).toHaveLength(0);
    await flipDue(t, 3 * HOUR);
    const done = await fired(t, "whop/money:onDone");
    expect(done).toHaveLength(1);
    expect(done[0].args).toEqual({ frolicId: crew.frolicId });
  });

  test("every money hook is registered and returns without a plan attached", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    expect(await t.mutation(internal.whop.money.onReveal, { frolicId: crew.frolicId })).toBeNull();
    expect(
      await t.mutation(internal.whop.money.onJoin, { frolicId: crew.frolicId, userId: crew.ids.Maya }),
    ).toBeNull();
    expect(
      await t.mutation(internal.whop.money.onBail, { frolicId: crew.frolicId, userId: crew.ids.Maya }),
    ).toBeNull();
    expect(
      await t.mutation(internal.whop.money.onArrive, { frolicId: crew.frolicId, userId: crew.ids.Maya }),
    ).toBeNull();
    expect(await t.mutation(internal.whop.money.onDone, { frolicId: crew.frolicId })).toBeNull();
  });
});
