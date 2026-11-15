import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { noticeToken } from "../../convex/keiki/notice";
import { ANA_PHONE, SAM_PHONE, linkChat, linkPhone, nowFor, seedCrew, seat } from "../../keiki/test/seed";
import type { Seed, SeedOptions, T } from "../../keiki/test/seed";
import {
  API_KEY,
  advance,
  attendeesOf,
  installFetch,
  makeT,
  outboxOf,
  patchFrolic,
  storeBlob,
  testEnv,
} from "../../keiki/test/harness";

const CHAT = "imsg:chat:abc";
const MAYA_PHONE = "+15105550106";
const STORAGE_URL = "https://some-deployment.convex.cloud/api/storage/";

beforeEach(() => {
  vi.useFakeTimers();
  testEnv().KEIKI_API_KEY = API_KEY;
  delete testEnv().KEIKI_AGENT_ID;
  delete testEnv().KEIKI_DEDICATED_LINE;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
  delete testEnv().KEIKI_AGENT_ID;
  delete testEnv().KEIKI_DEDICATED_LINE;
});

async function seeded(options: SeedOptions = {}): Promise<{ t: T; seed: Seed }> {
  vi.setSystemTime(new Date(nowFor(options.variant)));
  const t = makeT();
  const seed = await seedCrew(t, options);
  return { t, seed };
}

describe("onDrop", () => {
  it("queues one notice per linked member and one per linked chat, once", async () => {
    testEnv().KEIKI_DEDICATED_LINE = "1";
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
    expect(chatRow.text).toContain("It stays secret unless someone else is too.");
    expect(rows.find((row) => row.target === SAM_PHONE)!.text).not.toContain("It stays secret");

    await advance(t, 0);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE, CHAT].sort());
    expect(fetchMock.notices[0].text.startsWith("FROLIC-OPS " + noticeToken(API_KEY) + "\n")).toBe(true);
    expect(fetchMock.notices[0].text).not.toContain("get_member");

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    expect(await outboxOf(t)).toHaveLength(3);
    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(3);
  });

  it("retries a failing notice three times with a growing delay, then marks it failed", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch({ noticeStatus: 500 });

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    expect((await outboxOf(t)).every((row) => row.attempts === 1 && row.status === "queued")).toBe(true);
    await advance(t, 2000);
    expect((await outboxOf(t)).every((row) => row.attempts === 2 && row.status === "queued")).toBe(true);
    await advance(t, 4000);
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "failed" && row.attempts === 3)).toBe(true);
    expect(rows.every((row) => row.error === "http_500")).toBe(true);
    expect(fetchMock.stub).toHaveBeenCalledTimes(6);

    await advance(t, 8000);
    expect(fetchMock.stub).toHaveBeenCalledTimes(6);
  });

  it("keeps a missing conversation apart from a retry", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch({ noticeStatus: 404 });
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    const rows = await outboxOf(t);
    expect(rows.every((row) => row.status === "failed" && row.attempts === 1 && row.error === "lost_404")).toBe(true);
    expect(fetchMock.stub).toHaveBeenCalledTimes(2);
    await advance(t, 2000);
    expect(fetchMock.stub).toHaveBeenCalledTimes(2);
  });

  it("treats a notice the agent could not run as a retry", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch({ noticeBody: { results: [{ outcome: "unavailable" }] } });
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    expect((await outboxOf(t)).every((row) => row.status === "queued" && row.attempts === 1 && row.error === "unavailable")).toBe(true);
    await advance(t, 2000);
    expect((await outboxOf(t)).every((row) => row.attempts === 2)).toBe(true);
    expect(fetchMock.notices).toHaveLength(4);
  });

  it("treats a queued notice as sent", async () => {
    const { t, seed } = await seeded();
    installFetch({ noticeBody: { results: [{ outcome: "queued" }] } });
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    expect((await outboxOf(t)).every((row) => row.status === "sent")).toBe(true);
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

describe("onMoney", () => {
  it("texts a linked person when their hold comes back", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onMoney, {
      frolicId: seed.frolicId,
      userId: seed.samId,
      event: "released",
      amountCents: 300,
    });
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: seed.samId, target: SAM_PHONE, status: "queued" });

    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(1);
    expect(fetchMock.notices[0].phone).toBe(SAM_PHONE);
    expect(fetchMock.notices[0].text.endsWith("Your $3 is back.")).toBe(true);
  });

  it("texts the fund credit without naming the no-show", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onMoney, {
      frolicId: seed.frolicId,
      userId: seed.samId,
      event: "noShowCredit",
      amountCents: 1250,
    });
    await advance(t, 0);

    expect(fetchMock.notices).toHaveLength(1);
    expect(fetchMock.notices[0].phone).toBe(SAM_PHONE);
    expect(fetchMock.notices[0].text.endsWith("A no-show added $12.50 to the Frolic Fund.")).toBe(true);
    expect(fetchMock.notices[0].text).not.toContain("Sam");
    expect(fetchMock.notices[0].text).not.toContain("Rivera");
  });

  it("sends one text when the same event fires twice", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    const args = { frolicId: seed.frolicId, userId: seed.samId, event: "released" as const, amountCents: 300 };

    await t.mutation(internal.keiki.outbound.onMoney, args);
    await t.mutation(internal.keiki.outbound.onMoney, args);
    expect(await outboxOf(t)).toHaveLength(1);

    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(1);
  });

  it("skips a paused person", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    await t.run(async (ctx) => {
      const link = await ctx.db
        .query("keikiLinks")
        .withIndex("by_userId", (q) => q.eq("userId", seed.samId))
        .first();
      await ctx.db.patch("keikiLinks", link!._id, { paused: true });
    });

    await t.mutation(internal.keiki.outbound.onMoney, {
      frolicId: seed.frolicId,
      userId: seed.samId,
      event: "noShowCredit",
      amountCents: 300,
    });
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("skipped");

    await advance(t, 0);
    expect(fetchMock.notices).toHaveLength(0);
  });
});

describe("shared line", () => {
  it("drops to direct messages only, even when a chat is linked", async () => {
    const { t, seed } = await seeded();
    await linkChat(t, seed.groupId, CHAT);
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    const rows = await outboxOf(t);
    expect(rows.map((row) => row.target).sort()).toEqual([SAM_PHONE, ANA_PHONE].sort());
    expect(rows.every((row) => row.userId !== undefined)).toBe(true);

    await advance(t, 0);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE].sort());
  });

  it("reveals by direct message and asks the rest of the crew to hop in", async () => {
    const { t, seed } = await seeded();
    await linkChat(t, seed.groupId, CHAT);
    await linkPhone(t, seed.mayaId, MAYA_PHONE);
    await seat(t, seed.frolicId, seed.groupId, [seed.samId, seed.anaId], seed.now);
    await patchFrolic(t, seed.frolicId, { revealAt: seed.now - 1_000, status: "on" });
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onReveal, {
      frolicId: seed.frolicId,
      userIds: [seed.samId, seed.anaId],
      bloomAt: seed.now,
    });
    const rows = await outboxOf(t);
    expect(rows.some((row) => row.target === CHAT)).toBe(false);
    const reveal = rows.find((row) => row.kind === "reveal" && row.userId === seed.samId)!;
    expect(reveal).toMatchObject({ target: SAM_PHONE, notBefore: seed.now - 1_000 });
    expect(reveal.text).toContain("It's on. You, Ana.");
    const hopIn = rows.find((row) => row.kind === "hopIn")!;
    expect(hopIn).toMatchObject({ userId: seed.mayaId, target: MAYA_PHONE });
    expect(hopIn.text).toContain("Room for one more?");

    await advance(t, 0);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE, MAYA_PHONE].sort());
  });
});

describe("due", () => {
  it("holds a queued notice once the person pauses", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await t.run(async (ctx) => {
      const link = await ctx.db
        .query("keikiLinks")
        .withIndex("by_userId", (q) => q.eq("userId", seed.samId))
        .first();
      await ctx.db.patch("keikiLinks", link!._id, { paused: true });
    });
    await advance(t, 0);

    expect(fetchMock.notices.map((notice) => notice.phone)).toEqual([ANA_PHONE]);
    expect((await outboxOf(t)).find((row) => row.userId === seed.samId)?.status).toBe("queued");
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
    expect(fetchMock.notices[0].text).toContain("This one drifted off. Nobody knows you said yes.");
  });
});

describe("onCollage", () => {
  it("sends the collage to the people in it and to the linked chat", async () => {
    testEnv().KEIKI_DEDICATED_LINE = "1";
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

describe("delivery honesty", () => {
  it("retries a 200 it cannot read instead of counting it as sent", async () => {
    const { t, seed } = await seeded();
    installFetch({ noticeBody: { ok: true } });
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    expect((await outboxOf(t)).every((row) => row.status === "queued" && row.error === "unreadable_answer")).toBe(true);
  });

  it("holds a retry back even when another enqueue runs the sender early", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch({ noticeStatus: 500 });
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 0);
    const firstRun = fetchMock.stub.mock.calls.length;
    await t.mutation(internal.keiki.outbound.onReveal, { frolicId: seed.frolicId, userIds: [seed.samId], bloomAt: seed.now });
    await advance(t, 0);
    expect(fetchMock.stub.mock.calls.length).toBe(firstRun);
    await advance(t, 2000);
    expect(fetchMock.stub.mock.calls.length).toBeGreaterThan(firstRun);
  });

  it("fails a row that sat queued for longer than six hours", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    await advance(t, 7 * 60 * 60 * 1000);
    const rows = await outboxOf(t);
    expect(rows.every((row) => row.status === "failed" && row.error === "stale")).toBe(true);
    expect(fetchMock.stub).not.toHaveBeenCalled();
  });
});
