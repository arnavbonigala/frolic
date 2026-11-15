import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { expectMatch, expectNoMatch } from "./assert";
import {
  findFunction,
  findOptional,
  modules,
  readFrolic,
  readTaps,
  seed,
  tapAs,
} from "./surface";



const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return convexTest(schema, modules);
}

async function settle(t: any) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sources: a web yes and an app yes match each other", () => {
  for (const pairing of [
    ["web", "app"],
    ["imessage", "app"],
    ["notification", "app"],
    ["web", "imessage"],
  ] as const) {
    it(`${pairing[0]} and ${pairing[1]} tap into the same match`, async () => {
      const t = fresh();
      const f = await seed(t);
      await tapAs(t, f, "Maya", { source: pairing[0] });
      await tapAs(t, f, "Dev", { source: pairing[1] });
      await settle(t);
      await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
      const taps = await readTaps(t, f.frolicId);
      expect(
        taps.map((x: any) => x.source).sort(),
        "the source is stored so the crew can tell a link yes from an app yes",
      ).toEqual([...pairing].sort());
    });
  }

  it("a web tap with an onlyIf is bound by it exactly like an app tap", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Sam"], source: "web" });
    await tapAs(t, f, "Dev", { source: "app" });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("a web tap past the deadline cannot match", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapAs(t, f, "Maya");
    vi.setSystemTime(NOW + 31 * MIN);
    await tapAs(t, f, "Dev", { source: "web" }).catch(() => undefined);
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("a source outside the union is rejected", async () => {
    const t = fresh();
    const f = await seed(t);
    const { ref } = await findFunction("tap");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [],
        source: "sms",
      }),
    ).rejects.toThrow();
  });
});

describe("identity: a device token cannot be swapped to tap twice", () => {
  it("the same person with a new token still has one tap per frolic", async () => {
    const t = fresh();
    const f = await seed(t);
    const tokenPool = ["token-a", "token-b", "token-c"];

    await t.run(async (ctx: any) => {
      for (const token of tokenPool) {
        await ctx.db.patch("users", f.users.Maya, { tokenHash: token });
      }
    });

    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await t.run(async (ctx: any) => {
      await ctx.db.patch("users", f.users.Maya, { tokenHash: "token-b" });
    });
    await tapAs(t, f, "Maya", { onlyIf: [] });
    await tapAs(t, f, "Dev");
    await settle(t);

    const taps = await readTaps(t, f.frolicId);
    expect(
      taps.filter((x: any) => x.userId === f.users.Maya),
      "a rotated token must not create a second tap row for the same person",
    ).toHaveLength(1);

    const second = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Maya", source: "app", tokenHash: "token-a" }),
    );
    const { ref } = await findFunction("tap");
    await t.mutation(ref, {
      frolicId: f.frolicId,
      userId: second,
      kind: "down",
      onlyIf: [],
      source: "app",
    }).catch(() => undefined);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status, "a duplicate identity must not disturb an already matched frolic").toBe(
      "on",
    );
  });

  it("a duplicated user row cannot be counted as a second yes for a match", async () => {
    const t = fresh();
    const f = await seed(t);
    await t.run(async (ctx: any) => {
      await ctx.db.insert("memberships", {
        groupId: f.groupId,
        userId: f.users.Maya,
        color: "pink",
        joinedVia: "invite",
      });
    });
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev").catch(() => undefined);
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(frolic.status).toBe("open");
  });

  it("one person cannot fill a two person match with two of their own taps", async () => {
    const t = fresh();
    const f = await seed(t);
    await t.run(async (ctx: any) => {
      await ctx.db.insert("memberships", {
        groupId: f.groupId,
        userId: f.users.Sam,
        color: "lilac",
        joinedVia: "invite",
      });
    });
    await tapAs(t, f, "Maya");
    await t.run(async (ctx: any) => {
      await ctx.db.insert("taps", {
        frolicId: f.frolicId,
        groupId: f.groupId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [],
        source: "app",
        updatedAt: NOW,
      });
    });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("my own tap", () => {
  it("a member can read their own tap and not someone else's", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    const mine = await findOptional("myTap", "myTaps", "ownTap", "myFrolicTap");
    if (!mine) {
      expect(mine, "each person is allowed to read their own tap, so a myTap query is expected").toBeTruthy();
      return;
    }
    const asMaya = await t.query(mine.ref, { userId: f.users.Maya, frolicId: f.frolicId });
    expect(JSON.stringify(asMaya ?? null).includes(String(f.users.Dev))).toBe(true);
    const asJordan = await t.query(mine.ref, { userId: f.users.Jordan, frolicId: f.frolicId });
    expect(
      JSON.stringify(asJordan ?? null).includes(String(f.users.Maya)),
      "another member's myTap must not return Maya's tap",
    ).toBe(false);
  });
});
