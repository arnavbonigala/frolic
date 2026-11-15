import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { findFunction, findOptional, mutate, readAttendees, readFrolic, seed, tapAs } from "./surface";

const modules = (import.meta as unknown as { glob: (p: string) => Record<string, () => Promise<unknown>> }).glob(
  "../../**/*.ts",
);

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

async function hopIn(t: any, f: any, who: string) {
  return await mutate(t, ["hopIn", "hopInFrolic", "joinFrolic", "join"], {
    frolicId: f.frolicId,
    userId: f.users[who],
  });
}

async function bail(t: any, f: any, who: string) {
  return await mutate(t, ["bail", "sitOut", "cantMakeIt", "leaveFrolic"], {
    frolicId: f.frolicId,
    userId: f.users[who],
  });
}

async function matchedFrolic(t: any, names = ["Maya", "Dev"], extra: any = {}) {
  const f = await seed(t, { names: ["Maya", "Dev", "Jordan", "Priya", "Sam"], ...extra });
  for (const name of names) await tapAs(t, f, name);
  await settle(t);
  const frolic = await readFrolic(t, f.frolicId);
  expect(frolic.status, "fixture needs a match").toBe("on");
  return f;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hop in", () => {
  it("hop in is refused while the frolic is still open", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await expect(hopIn(t, f, "Jordan")).rejects.toThrow();
    const attendees = await readAttendees(t, f.frolicId);
    expect(attendees).toHaveLength(0);
  });

  it("hop in is refused between the match and the reveal", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) - 1);
    await hopIn(t, f, "Jordan").catch(() => undefined);
    const attendees = await readAttendees(t, f.frolicId);
    expect(
      attendees.filter((a: any) => a.userId === f.users.Jordan),
      "nobody may join before the reveal, or names leak one phone early",
    ).toHaveLength(0);
  });

  it("hop in lands as a hopIn attendee after the reveal", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) + 1_000);
    await hopIn(t, f, "Jordan");
    const attendees = await readAttendees(t, f.frolicId);
    const jordan = attendees.find((a: any) => a.userId === f.users.Jordan);
    expect(jordan, "a hop in after the reveal joins the frolic").toBeTruthy();
    expect(jordan.status).toBe("going");
    expect(["hopIn", "refill"]).toContain(jordan.role);
  });

  it("hopping in twice does not create two attendee rows", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) + 1_000);
    await hopIn(t, f, "Jordan");
    await hopIn(t, f, "Jordan").catch(() => undefined);
    const attendees = await readAttendees(t, f.frolicId);
    expect(
      attendees.filter((a: any) => a.userId === f.users.Jordan),
      "hop in is idempotent per user",
    ).toHaveLength(1);
  });
});

describe("refill", () => {
  it("a bail after the reveal keeps the frolic on", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) + MIN);
    await bail(t, f, "Dev");
    const after = await readFrolic(t, f.frolicId);
    expect(["on"], "one person sitting out must not cancel the frolic").toContain(after.status);
  });

  it("two people sitting out at once never exceed capacity", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev", "Jordan"], { });
    await t.run(async (ctx: any) => {
      await ctx.db.patch("frolics", f.frolicId, { capacity: 3 });
    });
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) + MIN);
    await hopIn(t, f, "Priya");
    await hopIn(t, f, "Sam");
    await Promise.allSettled([bail(t, f, "Dev"), bail(t, f, "Jordan")]);
    await settle(t);
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees.filter((a: any) => a.status === "going");
    expect(
      new Set(going.map((a: any) => a.userId)).size,
      "no user appears twice after a double refill",
    ).toBe(going.length);
    expect(going.length, "a double refill must not overfill the frolic").toBeLessThanOrEqual(3);
  });

  it("a refill pulls from the hop in pool, not from a hidden tap", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    vi.setSystemTime((frolic.revealAt as number) + MIN);
    await bail(t, f, "Dev");
    await settle(t);
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees.filter((a: any) => a.status === "going");
    for (const attendee of going) {
      expect(
        [f.users.Maya, f.users.Dev, f.users.Jordan].includes(attendee.userId),
        "a refill may not add someone who never asked to hop in",
      ).toBe(true);
    }
  });
});

describe("bail before reveal", () => {
  it("a tapper who bails before reveal is not an attendee", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapAs(t, f, "Maya");
    await tapAs(t, f, "Dev");
    await bail(t, f, "Dev").catch(() => undefined);
    await settle(t);
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees.filter((a: any) => a.status === "going");
    expect(
      going.some((a: any) => a.userId === f.users.Dev),
      "someone who sat out must not be revealed as going",
    ).toBe(false);
  });
});
