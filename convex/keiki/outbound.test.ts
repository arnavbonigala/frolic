import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { ANA_PHONE, SAM_PHONE, linkChat, nowFor, seedCrew, seat } from "../../keiki/test/seed";
import type { Seed, SeedOptions, T } from "../../keiki/test/seed";
import {
  API_KEY,
  advance,
  attendeesOf,
  installFetch,
  makeT,
  outboxOf,
  storeBlob,
  testEnv,
} from "../../keiki/test/harness";

const CHAT = "imsg:chat:abc";
const STORAGE_URL = "https://some-deployment.convex.cloud/api/storage/";

beforeEach(() => {
  vi.useFakeTimers();
  testEnv().KEIKI_API_KEY = API_KEY;
  delete testEnv().KEIKI_AGENT_ID;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
  delete testEnv().KEIKI_AGENT_ID;
});

async function seeded(options: SeedOptions = {}): Promise<{ t: T; seed: Seed }> {
  vi.setSystemTime(new Date(nowFor(options.variant)));
  const t = makeT();
  const seed = await seedCrew(t, options);
  return { t, seed };
}

describe("onDrop", () => {
  it("queues one notice per linked member and one per linked chat, once", async () => {
    const { t, seed } = await seeded();
    await linkChat(t, seed.groupId, CHAT);
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    expect(rows.map((row) => row.target).sort()).toEqual([SAM_PHONE, ANA_PHONE, CHAT].sort());
    expect(rows.every((row) => row.kind === "drop" && row.status === "queued")).toBe(true);
    expect(rows.every((row) => row.text.includes("Sunset at Indian Rock"))).toBe(true);
    const chatRow = rows.find((row) => row.target === CHAT)!;
    expect(chatRow.text).toContain("It stays secret");
    expect(rows.find((row) => row.target === SAM_PHONE)!.text).not.toContain("It stays secret");

    await advance(t, 0);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE, CHAT].sort());
    expect(fetchMock.notices[0].text.startsWith("Frolic drop event.")).toBe(true);

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    expect(await outboxOf(t)).toHaveLength(3);
    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(3);
  });

  it("retries a failing notice three times then marks it failed", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch({ noticeStatus: 500 });

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    expect((await outboxOf(t)).every((row) => row.attempts === 1 && row.status === "queued")).toBe(true);
    await advance(t, 2000);
    expect((await outboxOf(t)).every((row) => row.attempts === 2 && row.status === "queued")).toBe(true);
    await advance(t, 2000);

    const rows = await outboxOf(t);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "failed" && row.attempts === 3)).toBe(true);
    expect(rows.every((row) => row.error === "http_500")).toBe(true);
    expect(fetchMock.stub).toHaveBeenCalledTimes(6);

    await advance(t, 2000);
    expect(fetchMock.stub).toHaveBeenCalledTimes(6);
  });
});

describe("onLeaveNudge", () => {
  it("nudges only the people who are going", async () => {
    const { t, seed } = await seeded();
    await seat(t, seed.frolicId, seed.groupId, [seed.samId, seed.mayaId], seed.now);
    await t.run(async (ctx) => {
      await ctx.db.insert("etas", { frolicId: seed.frolicId, userId: seed.samId, minutes: 15, onTheWay: true, updatedAt: seed.now });
    });
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onLeaveNudge, { frolicId: seed.frolicId, leaveAt: seed.now + 60_000 });
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "nudge", userId: seed.samId, target: SAM_PHONE, notBefore: seed.now + 60_000 });
    expect(fetchMock.notices).toHaveLength(0);

    await advance(t, 60_000);
    expect(fetchMock.notices).toHaveLength(1);
    expect(fetchMock.notices[0].text).toContain("Time to head out. Indian Rock is 15 min away. Meet at");
  });
});

describe("onSnapWindow", () => {
  it("asks only the people who checked in", async () => {
    const { t, seed } = await seeded();
    await seat(t, seed.frolicId, seed.groupId, [seed.samId, seed.mayaId], seed.now);
    await t.run(async (ctx) => {
      await ctx.db.insert("checkins", { frolicId: seed.frolicId, userId: seed.samId, method: "imessage", at: seed.now });
    });
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onSnapWindow, { frolicId: seed.frolicId, snapAt: seed.now });
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "snap", userId: seed.samId });

    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(1);
    expect(fetchMock.notices[0].text).toContain("Group snap. Send me one photo right now.");
    expect(fetchMock.notices[0].phone).toBe(SAM_PHONE);
  });
});

describe("onFaded", () => {
  it("tells every linked unpaused member the plan faded", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    await t.mutation(internal.keiki.outbound.onFaded, { frolicId: seed.frolicId });
    const rows = await outboxOf(t);
    expect(rows.map((row) => row.target).sort()).toEqual([SAM_PHONE, ANA_PHONE].sort());
    expect(rows.every((row) => row.kind === "faded")).toBe(true);

    await advance(t, 0);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE].sort());
    expect(fetchMock.notices[0].text).toContain("Today's plan faded.");
  });
});

describe("onCollage", () => {
  it("sends the collage to the people in it and to the linked chat", async () => {
    const { t, seed } = await seeded();
    await linkChat(t, seed.groupId, CHAT);
    const storageId = await storeBlob(t, [255, 216, 255, 224], "image/jpeg");
    await t.run(async (ctx) => {
      await ctx.db.insert("snaps", {
        frolicId: seed.frolicId,
        groupId: seed.groupId,
        userId: seed.samId,
        storageId,
        snapAt: seed.now,
        takenAt: seed.now,
      });
    });
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onCollage, { frolicId: seed.frolicId, storageId });
    const rows = await outboxOf(t);
    expect(rows.map((row) => row.target).sort()).toEqual([SAM_PHONE, CHAT].sort());
    expect(rows.every((row) => row.kind === "collage" && row.text.includes(STORAGE_URL))).toBe(true);

    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(2);
    expect(fetchMock.notices.find((notice) => notice.phone === SAM_PHONE)!.text).toContain("Here's your group snap:");
    expect(fetchMock.notices.find((notice) => notice.phone === CHAT)!.text).toContain("Today's group snap:");
  });

  it("skips a plan with no going attendees", async () => {
    const { t, seed } = await seeded();
    const storageId = await storeBlob(t, [255, 216, 255, 224], "image/jpeg");
    await t.mutation(internal.keiki.outbound.onCollage, { frolicId: seed.frolicId, storageId });
    expect(await outboxOf(t)).toHaveLength(0);
    expect(await attendeesOf(t, seed.frolicId)).toHaveLength(0);
  });
});
