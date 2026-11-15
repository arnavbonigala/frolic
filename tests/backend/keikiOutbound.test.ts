import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { STALE_MS, retryWait } from "../../convex/keiki/outbound";
import { ANA_PHONE, SAM_PHONE, seedCrew } from "../../keiki/test/seed";
import type { Seed, T } from "../../keiki/test/seed";
import { API_KEY, installFetch, makeT, outboxOf, patchFrolic, testEnv } from "../../keiki/test/harness";

let queueCounter = 0;

async function seeded(): Promise<{ t: T; seed: Seed }> {
  const t = makeT();
  const seed = await seedCrew(t);
  return { t, seed };
}

async function queue(t: T, seed: Seed, fields: { kind: "drop" | "reveal" | "hopIn" | "faded"; target: string; notBefore: number; attempts?: number; userId?: Seed["samId"] }) {
  queueCounter += 1;
  return await t.run(async (ctx) =>
    ctx.db.insert("keikiOutbox", {
      key: "test:" + queueCounter,
      kind: fields.kind,
      frolicId: seed.frolicId,
      userId: fields.userId,
      target: fields.target,
      text: "A plan went out.",
      notBefore: fields.notBefore,
      status: "queued",
      attempts: fields.attempts ?? 0,
    }),
  );
}

beforeEach(() => {
  testEnv().KEIKI_API_KEY = API_KEY;
  delete testEnv().KEIKI_AGENT_ID;
  delete testEnv().KEIKI_DEDICATED_LINE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
});

describe("keiki outbound due", () => {
  it("returns nothing while the notice is still held back", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    expect(await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now: now - 1 })).toEqual([]);
    const ready = await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now });
    expect(ready.map((row) => row.target)).toEqual([SAM_PHONE]);
  });

  it("skips a paused person and keeps the rest of the crew", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now, userId: seed.samId });
    await queue(t, seed, { kind: "drop", target: ANA_PHONE, notBefore: now, userId: seed.anaId });
    await t.run(async (ctx) => {
      const link = await ctx.db
        .query("keikiLinks")
        .withIndex("by_userId", (q) => q.eq("userId", seed.samId))
        .first();
      await ctx.db.patch("keikiLinks", link!._id, { paused: true });
    });
    const ready = await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now });
    expect(ready.map((row) => row.target)).toEqual([ANA_PHONE]);
  });

  it("holds a retry back for its backoff window", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now - 5000, attempts: 1 + 1 });
    expect(retryWait(2)).toBe(4000);
    expect(await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now: now - 5000 + 3999 })).toEqual([]);
    const ready = await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now: now - 5000 + 4000 });
    expect(ready.map((row) => row.id)).toEqual([id]);
  });

  it("keeps a reveal notice back until revealAt has passed", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "reveal", target: SAM_PHONE, notBefore: now });
    expect(await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now })).toEqual([]);
    await patchFrolic(t, seed.frolicId, { revealAt: now - 1000 });
    const ready = await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now });
    expect(ready.map((row) => row.id)).toEqual([id]);
    expect(ready[0].stale).toBe(false);
  });

  it("marks a notice that sat six hours or more as stale", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now - STALE_MS - 1 });
    const ready = await t.query(internal.keiki.outbound.due, { frolicId: seed.frolicId, now });
    expect(ready).toHaveLength(1);
    expect(ready[0].stale).toBe(true);
  });
});

describe("keiki outbound settle", () => {
  it("counts a delivered notice as sent and stamps the time", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    await t.mutation(internal.keiki.outbound.settle, { frolicId: seed.frolicId, now, results: [{ id, ok: true }] });
    const row = (await outboxOf(t)).find((entry) => entry._id === id);
    expect(row?.status).toBe("sent");
    expect(row?.attempts).toBe(1);
    expect(row?.sentAt).toBe(now);
  });

  it("fails a notice the carrier will never take", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    await t.mutation(internal.keiki.outbound.settle, {
      frolicId: seed.frolicId,
      now,
      results: [{ id, ok: false, error: "lost_400", permanent: true }],
    });
    const row = (await outboxOf(t)).find((entry) => entry._id === id);
    expect(row).toMatchObject({ status: "failed", attempts: 1, error: "lost_400" });
  });

  it("keeps a transient failure queued and gives up on the third try", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    for (let attempt = 0; attempt < 2; attempt++) {
      await t.mutation(internal.keiki.outbound.settle, { frolicId: seed.frolicId, now, results: [{ id, ok: false, error: "http_500" }] });
    }
    const queued = (await outboxOf(t)).find((entry) => entry._id === id);
    expect(queued).toMatchObject({ status: "queued", attempts: 2, error: "http_500" });
    await t.mutation(internal.keiki.outbound.settle, { frolicId: seed.frolicId, now, results: [{ id, ok: false, error: "http_500" }] });
    const dead = (await outboxOf(t)).find((entry) => entry._id === id);
    expect(dead).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("leaves a notice that is already sent alone", async () => {
    const { t, seed } = await seeded();
    const now = Date.now();
    const id = await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    await t.run(async (ctx) => ctx.db.patch("keikiOutbox", id, { status: "sent", attempts: 1, sentAt: now }));
    await t.mutation(internal.keiki.outbound.settle, { frolicId: seed.frolicId, now: now + 1, results: [{ id, ok: false, error: "http_500" }] });
    const row = (await outboxOf(t)).find((entry) => entry._id === id);
    expect(row).toMatchObject({ status: "sent", attempts: 1, sentAt: now });
  });
});

describe("keiki outbound deliver", () => {
  it("sends the queued notices and marks them sent", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    const now = Date.now();
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: now });
    await t.action(internal.keiki.outbound.deliver, { frolicId: seed.frolicId });
    expect(fetchMock.notices.map((notice) => notice.phone)).toEqual([SAM_PHONE]);
    expect((await outboxOf(t)).every((row) => row.status === "sent")).toBe(true);
  });

  it("sends nothing when there is no api key and says so on the row", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    delete testEnv().KEIKI_API_KEY;
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: Date.now() });
    await t.action(internal.keiki.outbound.deliver, { frolicId: seed.frolicId });
    expect(fetchMock.stub).not.toHaveBeenCalled();
    const rows = await outboxOf(t);
    expect(rows[0]).toMatchObject({ status: "queued", attempts: 1, error: "not_configured" });
  });

  it("never sends a notice that is already stale", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    await queue(t, seed, { kind: "drop", target: SAM_PHONE, notBefore: Date.now() - STALE_MS - 1 });
    await t.action(internal.keiki.outbound.deliver, { frolicId: seed.frolicId });
    expect(fetchMock.stub).not.toHaveBeenCalled();
    const rows = await outboxOf(t);
    expect(rows[0]).toMatchObject({ status: "failed", error: "stale" });
  });
});

describe("keiki outbound helpers", () => {
  it("waits longer after each failed attempt, capped at a minute", () => {
    expect(retryWait(0)).toBe(0);
    expect(retryWait(1)).toBe(2000);
    expect(retryWait(2)).toBe(4000);
    expect(retryWait(6)).toBe(60000);
    expect(retryWait(9)).toBe(60000);
  });
});
