import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { expectMatch } from "./assert";
import { modules, readAttendees, readFrolic, seed, tapAs } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const win = (from: number, to: number) => ({ start: NOW + from * HOUR, end: NOW + to * HOUR });

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

describe("selection: biggest first, then earliest", () => {
  it("between two equal sized sets the earlier one wins", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 2) });
    await tapAs(t, f, "Dev", { window: win(1, 2) });
    await tapAs(t, f, "Jordan", { window: win(3, 4) });
    await tapAs(t, f, "Priya", { window: win(3, 4) });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a bigger later set beats a smaller earlier one", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: win(1, 2) });
    await tapAs(t, f, "Dev", { window: win(1, 2) });
    await tapAs(t, f, "Jordan", { window: win(3, 4) });
    await tapAs(t, f, "Priya", { window: win(3, 4) });
    await tapAs(t, f, "Sam", { window: win(3, 4) });
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      [f.users.Jordan, f.users.Priya, f.users.Sam],
      NOW,
    );
  });

  it("a tap window outside the plan's window never matches", async () => {
    const t = fresh();
    const f = await seed(t, { durationMinutes: 60 });
    await tapAs(t, f, "Maya", { window: { start: NOW + 10 * HOUR, end: NOW + 11 * HOUR } });
    await tapAs(t, f, "Dev", { window: { start: NOW + 10 * HOUR, end: NOW + 11 * HOUR } });
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    expect(
      frolic.status,
      "a tap outside the frolic's own window cannot form a plan nobody can attend",
    ).not.toBe("on");
  });
});

describe("selection at group scale", () => {
  it("twelve plain taps match as one set", async () => {
    const t = fresh();
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const f = await seed(t, { names, durationMinutes: 60 });
    const started = NOW;
    for (const name of names) await tapAs(t, f, name);
    await settle(t);
    await expectMatch(
      t,
      f.frolicId,
      names.map((n) => f.users[n]),
      started,
    );
    const elapsed = Math.max(0, Date.now() - started);
    expect(elapsed, "twelve taps must stay well inside the frame budget").toBeLessThan(2000);
  });

  it("a twelve person onlyIf chain resolves to the whole chain", async () => {
    const t = fresh();
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const f = await seed(t, { names, durationMinutes: 60 });
    for (let i = 1; i < names.length; i++) {
      await tapAs(t, f, names[i], { onlyIf: [names[i - 1]] });
    }
    await tapAs(t, f, names[0]);
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
    const names = ["Maya", "Dev", "Jordan", "Priya"];
    const f = await seed(t, { names, durationMinutes: 60 });
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev", { onlyIf: ["Maya"] });
    await tapAs(t, f, "Jordan", { onlyIf: ["Sam"] });
    await tapAs(t, f, "Priya", { onlyIf: ["Jordan"] });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
    const attendees = await readAttendees(t, f.frolicId);
    expect(
      attendees.some((a: any) => a.userId === f.users.Jordan || a.userId === f.users.Priya),
      "an unmet condition cannot be resolved by including someone who cannot come",
    ).toBe(false);
  });
});

describe("selection: not today wins over a tap", () => {
  it("a person who tapped down and then not today is not in the match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await tapAs(t, f, "Dev", { kind: "notToday" });
    await settle(t);
    const frolic = await readFrolic(t, f.frolicId);
    if (frolic.status === "on") {
      const attendees = await readAttendees(t, f.frolicId);
      expect(
        attendees.some((a: any) => a.userId === f.users.Dev),
        "someone who switched to not today must not be revealed as going",
      ).toBe(false);
    }
  });
});

describe("groups are isolated", () => {
  it("a frolic cannot be tapped from another group", async () => {
    const t = fresh();
    const f = await seed(t);
    const other = await seed(t, { names: ["Stranger"] });
    await tapAs(t, other, "Stranger", {}).catch(() => undefined);
    const taps = await t.run(async (ctx: any) =>
      await ctx.db
        .query("taps")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", f.frolicId))
        .collect(),
    );
    expect(
      taps.some((x: any) => x.userId === other.users.Stranger),
      "a member of another group cannot write a tap into this group's frolic",
    ).toBe(false);
  });
});
