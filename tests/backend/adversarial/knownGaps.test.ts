import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { advance, dayOf, frolicOn, gardenView, makeLedger, minuteOf, openCrew, planOn, setFree, settleReveal, tap } from "./sim";

beforeEach(() => {
  vi.useFakeTimers();
  delete process.env.OPENAI_API_KEY;
  delete process.env.SUPERMEMORY_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

declare const process: { env: Record<string, string | undefined> };

test.fails("day 1 / the system / the daily drop hands the crew a frolic to tap", async () => {
  const sim = await openCrew(makeLedger());
  sim.n = 1;
  const day = dayOf(1);
  vi.setSystemTime(minuteOf(1, 15 * 60));
  const evening = { start: minuteOf(1, 17 * 60), end: minuteOf(1, 21 * 60) };
  for (const name of ["Dev", "Jordan", "Priya"]) await setFree(sim, name, "window", evening);
  await sim.t.mutation(internal.plans.drop.dailyDrop, {});
  for (let i = 0; i < 25; i++) {
    if (await planOn(sim, day)) break;
    await advance(sim.t, 60_000);
  }
  expect(await planOn(sim, day), "the drop writes a plan").not.toBeNull();
  expect(await frolicOn(sim, day), "the drop opens the day's frolic").not.toBeNull();
  const view = await sim.t.query(api.frolics.today, { deviceToken: sim.tokens.Dev, groupId: sim.groupId });
  expect(view.frolic, "the crew's phone shows the plan to tap").not.toBeNull();
});

test("day 2 / Jordan / a member leaving keeps the flowers the crew grew", async () => {
  const sim = await openCrew(makeLedger());
  sim.n = 1;
  const day = dayOf(1);
  vi.setSystemTime(minuteOf(1, 15 * 60));
  const now = Date.now();
  const frolicId = await sim.t.mutation(internal.frolics.open, {
    groupId: sim.groupId,
    day,
    kind: "daily",
    window: { start: now, end: now + 8 * 60 * 60 * 1000 },
    durationMinutes: 60,
    deadline: now + 3 * 60 * 60 * 1000,
  });
  await tap(sim, "Dev", "down");
  await tap(sim, "Jordan", "down");
  await settleReveal(sim, frolicId);
  const started = (await frolicOn(sim, day))!.startsAt!;
  vi.setSystemTime(started - 5 * 60_000);
  for (const name of ["Dev", "Jordan"]) {
    await sim.t.mutation(api.checkins.checkInMe, { deviceToken: sim.tokens[name], frolicId, method: "geofence" });
  }
  vi.setSystemTime(started + 75 * 60_000);
  await advance(sim.t, 2_000);
  await advance(sim.t, 2_000);
  expect((await gardenView(sim, "Dev")).collection.flowers.length, "one flower after one frolic").toBe(1);
  await sim.t.mutation(api.users.deleteAccount, { deviceToken: sim.tokens.Jordan });
  expect((await gardenView(sim, "Dev")).collection.flowers.length, "the garden still holds the night Dev and Jordan had").toBe(1);
});
