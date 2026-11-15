/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { seedPerf, median } from "./perf.seed";
import { makeT, token } from "./setup.helpers";

const BUDGET_MS = 50;

async function documentsRead(t: ReturnType<typeof makeT>, run: (ctx: never) => Promise<unknown>) {
  return await t.run(async (ctx) => {
    const before = await ctx.meta.getTransactionMetrics();
    await run(ctx as never);
    const after = await ctx.meta.getTransactionMetrics();
    return after.documentsRead.used - before.documentsRead.used;
  });
}

async function wallClock(run: () => Promise<unknown>, runs = 5) {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    await run();
    times.push(performance.now() - started);
  }
  return median(times);
}

describe("query cost", () => {
  test("the group snap reads only its own window, not every snap of the night", async () => {
    const t = makeT();
    const crew = await seedPerf(t, { decoySnaps: 400 });
    const args = { deviceToken: token(crew.names[0]), frolicId: crew.doneFrolicId };
    const read = async () =>
      await documentsRead(t, (ctx: never) =>
        (ctx as never as { runQuery: typeof t.query }).runQuery(api.snaps.forFrolic, args),
      );
    const scan = await t.run(async (ctx) => {
      const started = await ctx.meta.getTransactionMetrics();
      await ctx.db.query("snaps").withIndex("by_frolicId", (q) => q.eq("frolicId", crew.doneFrolicId)).take(50);
      const finished = await ctx.meta.getTransactionMetrics();
      return finished.documentsRead.used - started.documentsRead.used;
    });
    expect(scan).toBe(50);
    const reads = await read();
    expect(reads).toBeLessThan(12);
    const rows = await t.query(api.snaps.forFrolic, args);
    expect(rows.length).toBe(3);
    const ms = await wallClock(() => t.query(api.snaps.forFrolic, args));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test("a new snap window replaces the old rows instead of stacking them", async () => {
    const t = makeT();
    const crew = await seedPerf(t);
    const mine = crew.userIds[0];
    const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array([9])])));
    await t.run(async (ctx) => {
      await ctx.db.insert("snaps", {
        frolicId: crew.doneFrolicId,
        groupId: crew.groupId,
        userId: mine,
        storageId,
        snapAt: crew.snapAt,
        takenAt: crew.snapAt,
      });
      await ctx.db.insert("snaps", {
        frolicId: crew.doneFrolicId,
        groupId: crew.groupId,
        userId: mine,
        storageId,
        snapAt: crew.snapAt + 90_000,
        takenAt: crew.snapAt + 90_000,
      });
    });
    const rows = await t.query(api.snaps.forFrolic, {
      deviceToken: token(crew.names[0]),
      frolicId: crew.doneFrolicId,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].takenAt).toBe(crew.snapAt + 90_000);
  });

  test("on my way reads the people going, not a whole crew of rows", async () => {
    const t = makeT();
    const crew = await seedPerf(t);
    const reads = await documentsRead(t, (ctx: never) =>
      (ctx as never as { runQuery: typeof t.query }).runQuery(api.etas.forFrolic, {
        deviceToken: token(crew.names[0]),
        frolicId: crew.onFrolicId,
      }),
    );
    expect(reads).toBeLessThan(20);
    const rows = await t.query(api.etas.forFrolic, {
      deviceToken: token(crew.names[0]),
      frolicId: crew.onFrolicId,
    });
    expect(rows.length).toBe(10);
    const ms = await wallClock(() =>
      t.query(api.etas.forFrolic, { deviceToken: token(crew.names[0]), frolicId: crew.onFrolicId }),
    );
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test("hopping into a night with 40 attendee rows reads only the 3 still going", async () => {
    const t = makeT();
    const crew = await seedPerf(t);
    const rows = await t.run(
      async (ctx) =>
        await ctx.db
          .query("attendees")
          .withIndex("by_frolicId", (q) => q.eq("frolicId", crew.onFrolicId))
          .take(100),
    );
    expect(rows.length).toBe(40);
    expect(rows.filter((row) => row.status === "going").length).toBe(3);
    const outsider = crew.names[20];
    const reads = await documentsRead(t, (ctx: never) =>
      (ctx as never as { runMutation: typeof t.mutation }).runMutation(api.frolics.hopIn, {
        deviceToken: token(outsider),
        frolicId: crew.onFrolicId,
      }),
    );
    expect(reads).toBeLessThan(40);
  });
});
