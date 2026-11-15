import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectMatch } from "./assert";
import { makeTest, matchState, readAttendees, seed, settle, tapById } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const win = (from: number, to: number) => ({ start: NOW + from * HOUR, end: NOW + to * HOUR });

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("selection: biggest first, then earliest", () => {
  it("between two equal sized sets the earlier one wins", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 2) });
    await tapById(t, f, "Dev", { window: win(1, 2) });
    await tapById(t, f, "Jordan", { window: win(3, 4) });
    await tapById(t, f, "Priya", { window: win(3, 4) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a bigger later set beats a smaller earlier one", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: win(1, 2) });
    await tapById(t, f, "Dev", { window: win(1, 2) });
    await tapById(t, f, "Jordan", { window: win(3, 4) });
    await tapById(t, f, "Priya", { window: win(3, 4) });
    await tapById(t, f, "Sam", { window: win(3, 4) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Jordan, f.users.Priya, f.users.Sam], NOW);
  });

  it("a tap window outside the plan's window never matches", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapById(t, f, "Maya", { window: { start: NOW + 10 * HOUR, end: NOW + 11 * HOUR } });
    await tapById(t, f, "Dev", { window: { start: NOW + 10 * HOUR, end: NOW + 11 * HOUR } });
    await settle(t);
    const { frolic, pending } = await matchState(t, f.frolicId);
    expect(
      pending ?? (frolic.status === "on" ? "on" : null),
      "a tap outside the frolic's own window cannot form a plan nobody can attend",
    ).toBeNull();
  });
});

describe("selection at group scale", () => {
  it("twelve plain taps match as one set", async () => {
    const t = fresh();
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const f = await seed(t, { names, durationMinutes: 60 });
    for (const name of names) await tapById(t, f, name);
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      names.map((n) => f.users[n]),
      NOW,
    );
  });

  it("a twelve person onlyIf chain resolves to the whole chain", async () => {
    const t = fresh();
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const f = await seed(t, { names, durationMinutes: 60 });
    for (let i = 1; i < names.length; i++) {
      await tapById(t, f, names[i], { onlyIf: [names[i - 1]] });
    }
    await tapById(t, f, names[0]);
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      names.map((n) => f.users[n]),
      NOW,
    );
  });

  it("one broken link cuts the chain to the part that still holds", async () => {
    const t = fresh();
    const f = await seed(t, { names: ["Maya", "Dev", "Jordan", "Priya"], durationMinutes: 60 });
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev", { onlyIf: ["Maya"] });
    await tapById(t, f, "Priya", { onlyIf: ["Sam"] }).catch(() => undefined);
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });
});

describe("selection: not today wins over a tap", () => {
  it("a person who tapped down and then not today is not in the match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await tapById(t, f, "Dev", { kind: "notToday" });
    await settle(t);
    const { frolic, attendees } = await matchState(t, f.frolicId);
    if (frolic.status === "on") {
      expect(
        attendees.filter((a: any) => a.userId === f.users.Dev && a.status === "going"),
        "someone who switched to not today must not be revealed as going",
      ).toHaveLength(0);
    }
  });
});

describe("groups are isolated", () => {
  it("a member of another group cannot write a tap into this frolic", async () => {
    const t = fresh();
    const f = await seed(t);
    const other = await seed(t, { names: ["Stranger"] });
    const { ref } = await (
      await import("./surface")
    ).findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: other.users.Stranger,
        kind: "down",
        onlyIf: [],
        source: "app",
      }),
    ).rejects.toThrow();
    const taps = await t.run(async (ctx: any) =>
      await ctx.db
        .query("taps")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
        .collect(),
    );
    expect(taps).toHaveLength(0);
  });

  it("a frolic from another group cannot be read through today", async () => {
    const t = fresh();
    const f = await seed(t);
    const other = await seed(t, { names: ["Stranger"] });
    const { ref } = await (await import("./surface")).findFunction("today");
    await expect(
      t.query(ref, {
        deviceToken: other.tokens.Stranger,
        groupId: other.groupId,
        frolicId: f.frolicId,
      }),
    ).rejects.toThrow();
  });
});

describe("a match is not re-decided after it is revealed", () => {
  it("a later tap cannot shrink a revealed set", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await settle(t);
    const before = await readAttendees(t, f.frolicId);
    await tapById(t, f, "Dev", { kind: "notToday" });
    const after = await readAttendees(t, f.frolicId);
    expect(after.length).toBe(before.length);
  });
});
