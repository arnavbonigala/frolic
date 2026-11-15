import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findFunction, makeTest, matchState, seed, settle, sitOutAs, hopInAs, tapById } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

type Scheduled = { name: string; args: unknown };

async function scheduled(t: any): Promise<Scheduled[]> {
  return await t.run(async (ctx: any) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows
      .filter((row: any) => String(row.name).startsWith("whop/money:"))
      .map((row: any) => ({
        name: String(row.name).replace("whop/money:", ""),
        args: Array.isArray(row.args) ? row.args[0] : row.args,
      }));
  });
}

async function revealed(t: any, names: string[] = ["Maya", "Dev"], capacity?: number) {
  const f = await seed(t);
  if (capacity !== undefined) {
    await t.run(async (ctx: any) => {
      await ctx.db.patch("frolics", f.frolicId, { capacity });
    });
  }
  for (const name of names) await tapById(t, f, name);
  await settle(t);
  const { frolic } = await matchState(t, f.frolicId);
  expect(frolic.status, "fixture needs a revealed frolic").toBe("on");
  return f;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("holds: no money moves before the reveal", () => {
  it("a tap schedules no money hook", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    expect(await scheduled(t), "one private yes must not start any money path").toHaveLength(0);
  });

  it("a pending match schedules no money hook before revealAt", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const { pending } = await matchState(t, f.frolicId);
    expect(pending, "fixture needs a pending match").toBeTruthy();
    expect(
      await scheduled(t),
      "a match that has not revealed yet must not touch a hold, or a phone learns the plan from its wallet",
    ).toHaveLength(0);
  });

  it("a sit out before the reveal schedules no money hook", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await sitOutAs(t, f, "Dev").catch(() => undefined);
    expect(
      (await scheduled(t)).filter((s) => s.name === "onBail"),
      "nobody was charged before the reveal, so nothing may be released",
    ).toHaveLength(0);
  });
});

describe("holds: the reveal takes the deposit once", () => {
  it("onReveal fires exactly once when the frolic flips", async () => {
    const t = fresh();
    const f = await revealed(t);
    const hooks = await scheduled(t);
    const onReveal = hooks.filter((s) => s.name === "onReveal");
    expect(onReveal, "the reveal starts the deposit path exactly once").toHaveLength(1);
    expect(onReveal[0].args).toMatchObject({ frolicId: f.frolicId });
  });

  it("a repeated flip does not take a second deposit", async () => {
    const t = fresh();
    const f = await revealed(t);
    const { frolic } = await matchState(t, f.frolicId);
    const { ref } = await findFunction("flip");
    await t.mutation(ref, { frolicId: f.frolicId, revealAt: frolic.revealAt as number });
    expect(
      (await scheduled(t)).filter((s) => s.name === "onReveal"),
      "a second flip must not run the deposit path again",
    ).toHaveLength(1);
  });

  it("a stale reveal trigger takes no deposit", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const { pending, frolic } = await matchState(t, f.frolicId);
    const revealAt = pending!.revealAt as number;
    const { ref } = await findFunction("flip");
    await t.mutation(ref, { frolicId: f.frolicId, revealAt: revealAt - 1000 });
    const after = await matchState(t, f.frolicId);
    expect(after.frolic.status, "a trigger carrying the wrong revealAt is ignored").toBe("open");
    expect(
      (await scheduled(t)).filter((s) => s.name === "onReveal"),
      "a replayed reveal trigger must not start the deposit path",
    ).toHaveLength(0);
    expect(frolic.status).toBe("open");
  });
});

describe("holds: joins and bails", () => {
  it("a hop in fires one join and no bail", async () => {
    const t = fresh();
    const f = await revealed(t);
    await hopInAs(t, f, "Jordan");
    const hooks = await scheduled(t);
    const joins = hooks.filter((s) => s.name === "onJoin");
    expect(joins, "a hop in puts one person on the deposit path").toHaveLength(1);
    expect(joins[0].args).toMatchObject({ frolicId: f.frolicId, userId: f.users.Jordan });
    expect(hooks.filter((s) => s.name === "onBail"), "nobody sat out").toHaveLength(0);
  });

  it("sitting out fires one bail, and sitting out twice does not refund twice", async () => {
    const t = fresh();
    const f = await revealed(t);
    await sitOutAs(t, f, "Dev");
    const first = (await scheduled(t)).filter((s) => s.name === "onBail");
    expect(first, "a sit out releases that person's hold once").toHaveLength(1);
    expect(first[0].args).toMatchObject({ frolicId: f.frolicId, userId: f.users.Dev });
    await sitOutAs(t, f, "Dev");
    await sitOutAs(t, f, "Dev");
    expect(
      (await scheduled(t)).filter((s) => s.name === "onBail"),
      "a double tap on Can't make it must not release the hold twice",
    ).toHaveLength(1);
  });

  it("a refill puts the waiting person on the deposit path and releases the one who left", async () => {
    const t = fresh();
    const f = await revealed(t, ["Maya", "Dev"], 2);
    await hopInAs(t, f, "Jordan");
    const afterHop = await scheduled(t);
    expect(
      afterHop.filter((s) => s.name === "onJoin"),
      "a hop in onto a full frolic joins the waitlist, with no hold yet",
    ).toHaveLength(0);
    await sitOutAs(t, f, "Dev");
    const hooks = await scheduled(t);
    const joins = hooks.filter((s) => s.name === "onJoin");
    expect(joins, "the refill puts exactly one person on the deposit path").toHaveLength(1);
    expect(joins[0].args).toMatchObject({ userId: f.users.Jordan });
    const bails = hooks.filter((s) => s.name === "onBail");
    expect(bails, "the person who left is released once").toHaveLength(1);
    expect(bails[0].args).toMatchObject({ userId: f.users.Dev });
  });

  it("the same person cannot be charged as both a matched and a hopping attendee", async () => {
    const t = fresh();
    const f = await revealed(t);
    await hopInAs(t, f, "Maya");
    expect(
      (await scheduled(t)).filter((s) => s.name === "onJoin"),
      "someone already going does not join again, so no second hold",
    ).toHaveLength(0);
  });
});

describe("holds: arriving and finishing", () => {
  it("a check in fires arrive once per person", async () => {
    const t = fresh();
    const f = await revealed(t);
    const checkIn = await findFunction("checkInAs");
    await t.mutation(checkIn.ref, {
      userId: f.users.Maya,
      frolicId: f.frolicId,
      method: "geofence",
    });
    const hooks = await scheduled(t);
    const arrives = hooks.filter((s) => s.name === "onArrive");
    expect(arrives, "arriving settles that person's deposit").toHaveLength(1);
    expect(arrives[0].args).toMatchObject({ frolicId: f.frolicId, userId: f.users.Maya });
    await t.mutation(checkIn.ref, {
      userId: f.users.Maya,
      frolicId: f.frolicId,
      method: "manual",
    });
    expect(
      (await scheduled(t)).filter((s) => s.name === "onArrive"),
      "checking in twice must not settle twice",
    ).toHaveLength(1);
  });

  it("a check in from someone not going is refused, so no arrival settles", async () => {
    const t = fresh();
    const f = await revealed(t);
    const checkIn = await findFunction("checkInAs");
    await expect(
      t.mutation(checkIn.ref, {
        userId: f.users.Priya,
        frolicId: f.frolicId,
        method: "manual",
      }),
    ).rejects.toThrow();
    expect((await scheduled(t)).filter((s) => s.name === "onArrive")).toHaveLength(0);
  });

  it("finishing fires done once", async () => {
    const t = fresh();
    const f = await revealed(t);
    const complete = await findFunction("complete");
    await t.mutation(complete.ref, { frolicId: f.frolicId });
    const hooks = await scheduled(t);
    expect(
      hooks.filter((s) => s.name === "onDone"),
      "finishing the frolic closes the money path once",
    ).toHaveLength(1);
    await t.mutation(complete.ref, { frolicId: f.frolicId });
    expect(
      (await scheduled(t)).filter((s) => s.name === "onDone"),
      "a repeated completion must not run the settlement again",
    ).toHaveLength(1);
  });

  it("a faded frolic never fires a deposit", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 31 * MIN);
    const fade = await findFunction("fade");
    await t.mutation(fade.ref, { frolicId: f.frolicId });
    expect(
      await scheduled(t),
      "a frolic that never happened must never touch a hold",
    ).toHaveLength(0);
  });
});
