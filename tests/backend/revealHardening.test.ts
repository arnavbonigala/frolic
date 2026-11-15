import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOON, flipDue, makeT, setupCrew, tap, today, token } from "./setup.helpers";

vi.mock("../../convex/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../convex/lib/hooks")>();
  return {
    ...actual,
    planFacts: async () => {
      throw new Error("plan facts broke");
    },
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

const frolicOf = (t: ReturnType<typeof makeT>, crew: Awaited<ReturnType<typeof setupCrew>>) =>
  t.run(async (ctx) => await ctx.db.get("frolics", crew.frolicId));

describe("reveal hardening", () => {
  test("a side effect that throws after the flip does not undo the reveal", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    await flipDue(t, 10);
    const frolic = await frolicOf(t, crew);
    expect(frolic?.status).toBe("on");
    const maya = await today(t, crew, "Maya");
    expect(maya.phase).toBe("on");
    expect(maya.reveal?.going.map((p) => p.name).sort()).toEqual(["Dev", "Maya"]);
    const log = await t.run(async (ctx) => await ctx.db.query("revealLog").collect());
    expect(log).toHaveLength(2);
    const memory = await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect());
    expect(memory.filter((e) => e.kind === "reveal")).toHaveLength(0);
    const remember = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((s) => s.name.includes("remember")),
    );
    expect(remember.map((s) => s.state.kind)).toEqual(["failed"]);
  });

  test("a match just before the deadline, then an untap after it, ends faded", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: 10_000 });
    vi.advanceTimersByTime(9_000);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    vi.advanceTimersByTime(1_000);
    await t.finishInProgressScheduledFunctions();
    expect((await frolicOf(t, crew))?.status).toBe("open");
    vi.advanceTimersByTime(200);
    await t.mutation(api.taps.untap, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    await flipDue(t, 2_000);
    expect((await frolicOf(t, crew))?.status).toBe("faded");
    expect(await t.run(async (ctx) => await ctx.db.query("reveals").collect())).toHaveLength(0);
    expect(await t.run(async (ctx) => await ctx.db.query("taps").collect())).toHaveLength(0);
    expect((await today(t, crew, "Maya")).reveal).toBeNull();
  });

  test("an untap after the deadline with nothing pending is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: 10_000 });
    await tap(t, crew, "Maya");
    await t.run(async (ctx) => await ctx.db.patch("frolics", crew.frolicId, { deadline: NOON - 1 }));
    await expect(
      t.mutation(api.taps.untap, { deviceToken: token("Maya"), frolicId: crew.frolicId }),
    ).rejects.toThrow(/over/);
  });

  test("a match before the deadline still reveals after it when nobody untaps", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: 10_000 });
    vi.advanceTimersByTime(9_000);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t, 2_000);
    expect((await frolicOf(t, crew))?.status).toBe("on");
  });
});
