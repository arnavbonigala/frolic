import { expect } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { readAttendees, readFrolic } from "./surface";

type T = any;

export async function expectNoMatch(t: T, frolicId: Id<"frolics">) {
  const frolic = await readFrolic(t, frolicId);
  const attendees = await readAttendees(t, frolicId);
  expect(frolic.status, "frolic must not be on before a real match").not.toBe("on");
  expect(frolic.revealAt ?? null, "no reveal may be scheduled without a match").toBeNull();
  expect(attendees.length, "no attendee rows may exist without a match").toBe(0);
}

export async function expectMatch(
  t: T,
  frolicId: Id<"frolics">,
  expected: (Id<"users"> | undefined)[],
  now: number,
) {
  const frolic = await readFrolic(t, frolicId);
  const attendees = await readAttendees(t, frolicId);
  expect(frolic.status, "a valid set must turn the frolic on").toBe("on");
  expect(typeof frolic.revealAt, "revealAt must be a server timestamp").toBe("number");
  expect(frolic.revealAt as number).toBeGreaterThanOrEqual(now);
  expect(frolic.revealAt as number).toBeLessThanOrEqual(now + 60_000);
  const got = attendees.map((a: any) => a.userId).sort();
  const want = (expected.filter(Boolean) as Id<"users">[]).sort();
  expect(got, "exactly the matched users are attendees").toEqual(want);
  for (const attendee of attendees) {
    expect(attendee.revealAt, "every attendee shares one revealAt").toBe(frolic.revealAt);
  }
}
