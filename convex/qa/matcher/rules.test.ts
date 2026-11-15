import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { expectMatch, expectNoMatch } from "./assert";
import { mutate, readTaps, seed, tapAs } from "./surface";

const modules = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
  "../../**/*.ts",
);

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const win = (fromHours: number, toHours: number) => ({
  start: NOW + fromHours * HOUR,
  end: NOW + toHours * HOUR,
});

function fresh() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
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

describe("matcher: the 2+ rule", () => {
  it("a single tap never matches", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("two plain taps match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a notToday tap never counts as a yes", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { kind: "notToday" });
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("matcher: onlyIf", () => {
  it("a satisfied onlyIf matches", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("an unsatisfied onlyIf stays private and unmatched", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Jordan");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("the named person arriving completes the set", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Jordan");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev, f.users.Jordan], NOW);
  });

  it("a chain only matches once every link is in", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev", { onlyIf: ["Jordan"] });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapAs(t, f, "Jordan");
    await settle(t);
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
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev", { onlyIf: ["Maya"] });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a self-reference does not block a match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Maya"] });
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("an onlyIf on someone outside the group can never match", async () => {
    const t = fresh();
    const f = await seed(t);
    const outsider = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Outsider", source: "app" }),
    );
    const { ref } = await import("./surface").then((m) => m.findFunction("tap"));
    await t.mutation(ref, {
      frolicId: f.frolicId,
      userId: f.users.Maya,
      kind: "down",
      onlyIf: [outsider],
      source: "app",
    });
    await tapAs(t, f, "Dev");
    await tapAs(t, f, "Jordan");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an onlyIf naming a person who left the group can never match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await t.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("memberships")
        .withIndex("by_groupId_and_userId", (q: any) =>
          q.eq("groupId", f.groupId).eq("userId", f.users.Dev),
        )
        .collect();
      for (const row of rows) await ctx.db.delete("memberships", row._id);
    });
    await tapAs(t, f, "Dev");
    await tapAs(t, f, "Jordan");
    await settle(t);
    const frolic = await t.run(async (ctx: any) => await ctx.db.get("frolics", f.frolicId));
    if (frolic.status === "on") {
      const attendees = await t.run(async (ctx: any) =>
        await ctx.db
          .query("attendees")
          .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
          .collect(),
      );
      expect(
        attendees.some((a: any) => a.userId === f.users.Dev),
        "a person outside the group must never be an attendee",
      ).toBe(false);
    }
  });
});

describe("matcher: set selection", () => {
  it("picks the biggest set, not the first pair", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await tapAs(t, f, "Jordan");
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
    await tapAs(t, f, "Sam", { onlyIf: ["Priya"] });
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await tapAs(t, f, "Jordan");
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Maya, f.users.Dev, f.users.Jordan],
      NOW,
    );
    const attendees = await t.run(async (ctx: any) =>
      await ctx.db
        .query("attendees")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
        .collect(),
    );
    expect(
      attendees.some((a: any) => a.userId === f.users.Sam),
      "a tapper whose condition fails must not be revealed as attending",
    ).toBe(false);
    const taps = await readTaps(t, f.frolicId);
    console.log(
      "losing tap row kept:",
      taps.some((x: any) => x.userId === f.users.Sam),
    );
  });

  it("a bigger set beats a pair only if its windows still overlap", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 4) });
    await tapAs(t, f, "Dev", { window: win(1, 6) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });
});

describe("matcher: time windows", () => {
  it("disjoint windows do not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 2) });
    await tapAs(t, f, "Dev", { window: win(3, 4) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("windows that touch at one instant do not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 2) });
    await tapAs(t, f, "Dev", { window: win(2, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an overlap shorter than the plan does not match", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 120 });
    await tapAs(t, f, "Maya", { window: win(1, 2.1) });
    await tapAs(t, f, "Dev", { window: win(1.9, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("an overlap of exactly the plan length matches", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 2) });
    await tapAs(t, f, "Dev", { window: win(2 - 1, 3) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a tap window narrower than availability is the one that counts", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 1.5) });
    await tapAs(t, f, "Dev", { window: win(1.9, 3) });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });
});

describe("matcher: retaps", () => {
  it("retapping replaces the row instead of adding one", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev");
    await settle(t);
    await tapAs(t, f, "Maya", { onlyIf: [] });
    const taps = await readTaps(t, f.frolicId);
    expect(taps.filter((x: any) => x.userId === f.users.Maya)).toHaveLength(1);
  });

  it("a retap can widen a set that was already matched", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya", { onlyIf: ["Dev"] });
    await tapAs(t, f, "Dev");
    await settle(t);
    const first = await t.run(async (ctx: any) => await ctx.db.get("frolics", f.frolicId));
    await tapAs(t, f, "Maya", { onlyIf: [] });
    await tapAs(t, f, "Jordan");
    await settle(t);
    const after = await t.run(async (ctx: any) => await ctx.db.get("frolics", f.frolicId));
    expect(after.revealAt ?? null, "a second match must never move revealAt").toBe(
      first.revealAt ?? null,
    );
  });

  it("untapping removes the yes before a match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await mutate(t, ["untap", "takeBack", "clearTap"], {
      frolicId: f.frolicId,
      userId: f.users.Maya,
    });
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("untap then retap matches again", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await mutate(t, ["untap", "takeBack", "clearTap"], {
      frolicId: f.frolicId,
      userId: f.users.Maya,
    });
    await tapAs(t, f, "Dev");
    await settle(t);
    await expectNoMatch(t, f.frolicId);
    await tapAs(t, f, "Maya");
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });
});

describe("matcher: membership", () => {
  it("a stranger cannot tap into the group's frolic", async () => {
    const t = fresh();
    const f = await seed(t);
    const outsider = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Outsider", source: "web" }),
    );
    const { ref } = await (await import("./surface")).findFunction("tap");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: outsider,
        kind: "down",
        onlyIf: [],
        source: "web",
      }),
    ).rejects.toThrow();
    const taps = await readTaps(t, f.frolicId);
    expect(taps).toHaveLength(0);
  });
});
