import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectMatch } from "./assert";
import {
  hopInAs,
  makeTest,
  matchState,
  readAttendees,
  readFrolic,
  seed,
  settle,
  sitOutAs,
  tapById,
} from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

async function matchedFrolic(t: any, names: string[] = ["Maya", "Dev"], capacity?: number) {
  const f = await seed(t);
  if (capacity !== undefined) {
    await t.run(async (ctx: any) => {
      await ctx.db.patch("frolics", f.frolicId, { capacity });
    });
  }
  for (const name of names) await tapById(t, f, name);
  await settle(t);
  const { frolic } = await matchState(t, f.frolicId);
  expect(frolic.status, "fixture needs a revealed match").toBe("on");
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
    await tapById(t, f, "Maya");
    await expect(hopInAs(t, f, "Jordan")).rejects.toThrow();
    expect(await readAttendees(t, f.frolicId)).toHaveLength(0);
  });

  it("hop in is refused between the match and the reveal", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    const pending = await matchState(t, f.frolicId);
    expect(pending.pending, "fixture needs a pending reveal").toBeTruthy();
    await hopInAs(t, f, "Jordan").catch(() => undefined);
    expect(
      (await readAttendees(t, f.frolicId)).filter((a: any) => a.userId === f.users.Jordan),
      "nobody may join before the reveal, or names leak one phone early",
    ).toHaveLength(0);
  });

  it("hop in lands as a hopIn attendee after the reveal", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const result = await hopInAs(t, f, "Jordan");
    expect(result).toBe("going");
    const attendees = await readAttendees(t, f.frolicId);
    const jordan = attendees.find((a: any) => a.userId === f.users.Jordan);
    expect(jordan, "a hop in after the reveal joins the frolic").toBeTruthy();
    expect(jordan.status).toBe("going");
    expect(jordan.role).toBe("hopIn");
  });

  it("hopping in twice does not create two attendee rows", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    await hopInAs(t, f, "Jordan");
    await hopInAs(t, f, "Jordan");
    const attendees = await readAttendees(t, f.frolicId);
    expect(
      attendees.filter((a: any) => a.userId === f.users.Jordan),
      "hop in is idempotent per user",
    ).toHaveLength(1);
  });

  it("a full frolic puts the late arrival on a waiting list instead of in", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev"], 2);
    const result = await hopInAs(t, f, "Jordan");
    expect(result, "no room means waiting, not going").toBe("waiting");
    const attendees = await readAttendees(t, f.frolicId);
    expect(attendees.filter((a: any) => a.status === "going")).toHaveLength(2);
  });
});

describe("sit out and refill", () => {
  it("a sit out after the reveal keeps the frolic on", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev", "Jordan"]);
    await sitOutAs(t, f, "Dev");
    const { frolic, attendees } = await matchState(t, f.frolicId);
    expect(frolic.status, "one person sitting out must not cancel the frolic").toBe("on");
    const dev = attendees.find((a: any) => a.userId === f.users.Dev);
    expect(dev.status).toBe("sittingOut");
  });

  it("refill pulls the waiting person in when a spot frees up", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev"], 2);
    await hopInAs(t, f, "Jordan");
    await sitOutAs(t, f, "Dev");
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees.filter((a: any) => a.status === "going");
    expect(
      going.map((a: any) => a.userId).sort(),
      "the waiting person takes the freed spot",
    ).toEqual([f.users.Maya, f.users.Jordan].sort());
    const jordan = attendees.find((a: any) => a.userId === f.users.Jordan);
    expect(jordan.role).toBe("refill");
  });

  it("two people sitting out at once never overfill a small frolic", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev", "Jordan"], 3);
    await hopInAs(t, f, "Priya");
    await hopInAs(t, f, "Sam");
    await Promise.allSettled([sitOutAs(t, f, "Dev"), sitOutAs(t, f, "Jordan")]);
    await settle(t);
    const attendees = await readAttendees(t, f.frolicId);
    const going = attendees.filter((a: any) => a.status === "going");
    expect(
      new Set(going.map((a: any) => a.userId)).size,
      "no user appears twice after a double refill",
    ).toBe(going.length);
    expect(going.length, "a double refill must not overfill the frolic").toBeLessThanOrEqual(3);
  });

  it("a refill only adds someone who asked to hop in", async () => {
    const t = fresh();
    const f = await matchedFrolic(t, ["Maya", "Dev"]);
    await sitOutAs(t, f, "Dev");
    await settle(t);
    const going = (await readAttendees(t, f.frolicId)).filter((a: any) => a.status === "going");
    for (const attendee of going) {
      expect(
        [f.users.Maya, f.users.Dev].includes(attendee.userId),
        "a refill may not invent an attendee who never asked",
      ).toBe(true);
    }
  });

  it("a sit out before the reveal cancels the pending match", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya");
    await tapById(t, f, "Dev");
    await sitOutAs(t, f, "Dev").catch(() => undefined);
    const { pending } = await matchState(t, f.frolicId);
    if (pending) {
      expect(
        pending.userIds.includes(f.users.Dev),
        "someone who sat out must not still be in the pending reveal",
      ).toBe(false);
    }
  });
});

describe("hop in does not leak the plan early", () => {
  it("a hop in cannot add an attendee whose revealAt is in the past relative to the frolic", async () => {
    const t = fresh();
    const f = await matchedFrolic(t);
    const frolic = await readFrolic(t, f.frolicId);
    await hopInAs(t, f, "Priya");
    const attendees = await readAttendees(t, f.frolicId);
    const priya = attendees.find((a: any) => a.userId === f.users.Priya)!;
    expect(
      priya.bloomAt,
      "a hop in blooms on its own moment, never before it can see the plan",
    ).toBeGreaterThanOrEqual(priya.revealAt);
    expect(frolic.status).toBe("on");
  });
});
