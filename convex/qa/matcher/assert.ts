import { expect } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { matchState } from "./surface";

type T = any;

export async function expectNoMatch(t: T, frolicId: Id<"frolics">) {
  const { frolic, pending, attendees } = await matchState(t, frolicId);
  expect(pending, "no pending reveal may be scheduled without a real match").toBeNull();
  expect(frolic.status, "a frolic with no match must never be on").not.toBe("on");
  expect(frolic.revealAt ?? null, "no revealAt may be written without a match").toBeNull();
  expect(
    attendees.filter((a: any) => a.status === "going"),
    "no attendee may exist without a match",
  ).toHaveLength(0);
}

export async function revealedUserIds(t: T, frolicId: Id<"frolics">): Promise<Id<"users">[]> {
  const { pending, attendees } = await matchState(t, frolicId);
  if (pending) return (pending.userIds as Id<"users">[]).slice().sort();
  return attendees
    .filter((a: any) => a.status === "going" && a.role === "matched")
    .map((a: any) => a.userId)
    .sort();
}

export async function expectMatch(
  t: T,
  frolicId: Id<"frolics">,
  expected: (Id<"users"> | undefined)[],
  now: number,
) {
  const { frolic, pending, attendees } = await matchState(t, frolicId);
  const want = (expected.filter(Boolean) as Id<"users">[]).sort();
  const got = await revealedUserIds(t, frolicId);
  expect(got, "exactly the matched users are scheduled or going").toEqual(want);

  const revealAt = pending ? pending.revealAt : frolic.revealAt;
  expect(typeof revealAt, "a match must schedule a server reveal moment").toBe("number");
  expect(revealAt as number).toBeGreaterThanOrEqual(now);
  expect(revealAt as number).toBeLessThanOrEqual(now + 60_000);

  if (frolic.status === "on") {
    const going = attendees.filter((a: any) => a.status === "going");
    for (const attendee of going) {
      expect(
        attendee.revealAt,
        "every attendee carries the one revealAt, or phones flip in different frames",
      ).toBe(frolic.revealAt);
    }
  }
}
