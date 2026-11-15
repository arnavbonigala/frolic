import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectMatch, expectNoMatch } from "./assert";
import { makeTest, matchState, readTaps, seed, settle, tapById } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const win = (from: number, to: number) => ({ start: NOW + from * HOUR, end: NOW + to * HOUR });

function fresh() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  return makeTest();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("matcher: the 2+ rule", () => {
  it("a single tap never matches", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("two plain taps match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a notToday tap never counts as a yes", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { kind: "notToday" });
    await tapById(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("matcher: onlyIf", () => {
  it("a satisfied onlyIf matches", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("an unsatisfied onlyIf stays unmatched", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Jordan");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("the named person arriving completes the set", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Jordan");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapById(t, f, "Dev");
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Maya, f.users.Dev, f.users.Jordan],
      NOW,
    );
  });

  it("a chain only matches once every link is in", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev", { onlyIf: ["Jordan"] });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapById(t, f, "Jordan");
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Maya, f.users.Dev, f.users.Jordan],
      NOW,
    );
  });

  it("a two-way cycle matches when both are in", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev", { onlyIf: ["Maya"] });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a self-reference does not block a match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Maya"] });
    await tapById(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("an onlyIf on someone outside the group is refused at the door", async () => {
    const t = fresh();
    const f = await seed(t);
    const outsider = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Outsider", source: "app" }),
    );
    const { ref } = await (
      await import("./surface")
    ).findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [outsider],
        source: "app",
      }),
    ).rejects.toThrow();
    await tapById(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an onlyIf naming someone who left the group is refused", async () => {
    const t = fresh();
    const f = await seed(t);
    await t.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("memberships")
        .withIndex("by_groupId_and_userId", (q: any) =>
          q.eq("groupId", f.groupId).eq("userId", f.users.Dev),
        )
        .collect();
      for (const row of rows) await ctx.db.delete("memberships", row._id);
    });
    const { ref } = await (await import("./surface")).findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [f.users.Dev],
        source: "app",
      }),
    ).rejects.toThrow();
  });
});

describe("matcher: set selection", () => {
  it("picks the biggest set, not the first pair", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await tapById(t, f, "Jordan");
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Maya, f.users.Dev, f.users.Jordan],
      NOW,
    );
  });

  it("drops a tapper whose onlyIf is not in the winning set", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 120 });
    await tapById(t, f, "Sam", { onlyIf: ["Priya"] });
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await tapById(t, f, "Jordan");
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Maya, f.users.Dev, f.users.Jordan],
      NOW,
    );
    const { attendees } = await matchState(t, f.frolicId);
    expect(
      attendees.some((a: any) => a.userId === f.users.Sam),
      "a tapper whose condition fails must not be revealed as attending",
    ).toBe(false);
  });

  it("a bigger set beats a pair only if its windows still overlap", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 4) });
    await tapById(t, f, "Dev", { window: win(1, 6) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });
});

describe("matcher: time windows", () => {
  it("disjoint windows do not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 2) });
    await tapById(t, f, "Dev", { window: win(3, 4) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("windows that touch at one instant do not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 2) });
    await tapById(t, f, "Dev", { window: win(2, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an overlap shorter than the plan does not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 120 });
    await tapById(t, f, "Maya", { window: win(1, 2.1) });
    await tapById(t, f, "Dev", { window: win(1.9, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an overlap of exactly the plan length matches", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 2) });
    await tapById(t, f, "Dev", { window: win(1, 3) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a tap window narrower than availability is the one that counts", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 1.5) });
    await tapById(t, f, "Dev", { window: win(1.9, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("matcher: retaps and take back", () => {
  it("retapping replaces the row instead of adding one", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Maya", { onlyIf: [] });
    const taps = await readTaps(t, f.frolicId);
    expect(taps.filter((x: any) => x.userId === f.users.Maya)).toHaveLength(1);
  });

  it("a retap can widen a set without moving revealAt", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapById(t, f, "Dev");
    const before = await matchState(t, f.frolicId);
    await tapById(t, f, "Maya", { onlyIf: [] });
    await tapById(t, f, "Jordan");
    const after = await matchState(t, f.frolicId);
    expect(
      after.pending?.revealAt ?? after.frolic.revealAt,
      "a second match must never move revealAt",
    ).toBe(before.pending?.revealAt ?? before.frolic.revealAt);
  });

  it("taking a tap back removes the yes before a match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Maya", { kind: "notToday" });
    await tapById(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("take back then tap again matches", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Maya", { kind: "notToday" });
    await tapById(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapById(t, f, "Maya");
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a match collapses back to no match when its second yes is taken back", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    expect((await matchState(t, f.frolicId)).pending).toBeTruthy();
    await tapById(t, f, "Dev", { kind: "notToday" });
    await expectNoMatch(t, f.frolicId);
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("matcher: membership", () => {
  it("a stranger cannot tap into the group's frolic", async () => {
    const t = fresh();
    const f = await seed(t);
    const outsider = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Outsider", source: "web" }),
    );
    const { ref } = await (await import("./surface")).findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: outsider,
        kind: "down",
        onlyIf: [],
        source: "web",
      }),
    ).rejects.toThrow();
    expect(await readTaps(t, f.frolicId)).toHaveLength(0);
  });
});
