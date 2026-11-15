import { api } from "../../../convex/_generated/api";
import { dayOf, gardenView, liveMembers, rows, today, type Sim } from "./sim";

const TERMINAL = ["released", "refunded", "forfeited", "paid", "waived", "failed", "needsAttention"];

export function fail(day: number, actor: string, invariant: string, detail: string): never {
  throw new Error(`day ${day} / ${actor} / ${invariant}: ${detail}`);
}

function expectSame(day: number, actor: string, invariant: string, actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) fail(day, actor, invariant, `expected ${right}, got ${left}`);
}

const sum = (list: { amountCents: number }[]) => list.reduce((total, row) => total + row.amountCents, 0);

function nightHappened(frolic: { status: string; endsAt?: number }, now: number): boolean {
  return frolic.status === "done" || (frolic.status === "on" && frolic.endsAt !== undefined && frolic.endsAt <= now);
}

export async function checkSecrecyBeforeReveal(sim: Sim, frolicId: string, actors: string[]): Promise<void> {
  const day = sim.n;
  const frolic = (await rows(sim, "frolics")).find((row) => row._id === frolicId);
  if (!frolic) fail(day, "system", "secrecy", "the frolic vanished");
  if (frolic.status !== "open") fail(day, "system", "secrecy", `checked a frolic that is already ${frolic.status}`);
  const logged = (await rows(sim, "revealLog")).filter((row) => row.frolicId === frolicId);
  expectSame(day, "system", "secrecy", logged.length, 0);
  const seated = (await rows(sim, "attendees")).filter((row) => row.frolicId === frolicId);
  expectSame(day, "system", "secrecy", seated.length, 0);
  for (const name of actors) {
    if (!(await liveMembers(sim)).includes(name)) continue;
    const view = await today(sim, name, frolicId as never);
    expectSame(day, name, "secrecy", view.reveal, null);
    if (JSON.stringify(view).includes("notToday") && view.myTap?.kind !== "notToday") {
      fail(day, name, "secrecy", "someone else's pass is readable before the reveal");
    }
  }
}

export async function checkRevealOnce(sim: Sim): Promise<void> {
  const day = sim.n;
  const frolics = await rows(sim, "frolics");
  const queued = await rows(sim, "reveals");
  for (const row of queued) {
    const owner = frolics.find((frolic) => frolic._id === row.frolicId);
    if (owner && owner.status !== "open") fail(day, "system", "reveal fires once", `a reveal is still queued for a frolic that is ${owner.status}`);
  }
  const logged = await rows(sim, "revealLog");
  const seats = await rows(sim, "attendees");
  const names = await liveMembers(sim);
  for (const frolic of frolics.filter((row) => row.status === "on" || row.status === "done")) {
    const mine = logged.filter((row) => row.frolicId === frolic._id);
    const going = seats.filter((row) => row.frolicId === frolic._id && row.status === "going");
    const every = seats.filter((row) => row.frolicId === frolic._id);
    if (frolic.revealAt === undefined) fail(day, "system", "reveal fires once", `frolic on ${frolic.day} is ${frolic.status} with no revealAt`);
    const users = mine.map((row) => row.userId as string);
    expectSame(day, "system", "reveal fires once", users.sort(), [...new Set(users)].sort());
    for (const row of mine) {
      if (row.revealAt !== frolic.revealAt) {
        fail(day, "system", "reveal fires once", `${row.userId} flipped at ${row.revealAt} while the frolic says ${frolic.revealAt}`);
      }
      if (row.flippedAt < row.revealAt) {
        fail(day, "system", "reveal fires once", `${row.userId} flipped ${row.revealAt - row.flippedAt}ms early`);
      }
      if (!every.some((seat) => seat.userId === row.userId && seat.role === "matched")) {
        fail(day, "system", "reveal fires once", `${row.userId} was revealed with no matched seat`);
      }
    }
    const stamps = new Set(mine.map((row) => row.flippedAt));
    expectSame(day, "system", "reveal fires once", stamps.size, mine.length === 0 ? 0 : 1);
    for (const name of names) {
      const view = await today(sim, name, frolic._id);
      if (view.frolic?.frolicId !== frolic._id || view.reveal === null) continue;
      if (view.reveal.revealAt !== frolic.revealAt) {
        fail(day, name, "reveal fires once", `the phone shows revealAt ${view.reveal.revealAt} while the frolic says ${frolic.revealAt}`);
      }
    }
  }
}

export async function checkMoney(sim: Sim): Promise<void> {
  const day = sim.n;
  const shares = await rows(sim, "shares");
  const seats = await rows(sim, "attendees");
  const ledger = await rows(sim, "fundLedger");
  const users = await sim.t.run(async (ctx) => await ctx.db.query("users").collect());
  const alive = new Set(users.map((user) => user._id as string));
  for (const share of shares) {
    if (!TERMINAL.includes(share.status)) {
      fail(day, "money", "no cent is left in the air", `share ${share._id} on frolic ${share.frolicId} is still ${share.status}`);
    }
    if (!alive.has(share.userId) && share.status === "held") {
      fail(day, "money", "a departed account never keeps a hold", `${share.userId} is gone and their hold still stands`);
    }
  }
  const forfeited = shares.filter((share) => share.status === "forfeited");
  const released = shares.filter((share) => share.status === "released");
  const refunded = shares.filter((share) => share.status === "refunded");
  const paidUpFront = shares.filter((share) => share.status === "paid");
  expectSame(
    day,
    "money",
    "held equals captured plus refunded",
    sim.ledger.capturedCents - sim.ledger.refundedCents,
    sum(forfeited) + sum(paidUpFront),
  );
  expectSame(day, "money", "held equals captured plus refunded", sim.ledger.voidedCents, sum(released));
  expectSame(day, "money", "held equals captured plus refunded", sim.ledger.refundedCents, sum(refunded));
  const credited = ledger.filter((row) => row.entry === "forfeit");
  const cleared = forfeited.reduce((total, share) => {
    const payment = [...sim.ledger.payments.values()].find((row) => row.shareId === share._id);
    return total + (payment ? payment.afterFeesCents : share.amountCents);
  }, 0);
  expectSame(day, "money", "the fund books what cleared", sum(credited), cleared);
  for (const frolic of await rows(sim, "frolics")) {
    const entries = ledger.filter((row) => row.frolicId === frolic._id);
    const calledOff = entries.some((row) => row.entry === "adjustment" && row.amountCents === 0 && !row.shareId && row.whopPaymentId === undefined);
    if (!calledOff) continue;
    const mine = shares.filter((share) => share.frolicId === frolic._id && (share.status === "forfeited" || share.status === "paid" || share.status === "held"));
    if (mine.length > 0) {
      fail(day, "money", "a called off plan takes no money", `${mine.length} shares still take money on the frolic from ${frolic.day}`);
    }
  }
  for (const seat of seats.filter((row) => row.status === "going")) {
    const holds = shares.filter((share) => share.frolicId === seat.frolicId && share.userId === seat.userId && share.kind === "deposit");
    if (holds.length > 1) fail(day, "money", "one person owes one hold per plan", `${seat.userId} has ${holds.length} holds on ${seat.frolicId}`);
  }
  const balance = ledger.reduce((total, row) => total + row.amountCents, 0);
  if (balance < 0) fail(day, "money", "the fund never goes negative", `balance is ${balance} cents`);
}

export async function checkGarden(sim: Sim): Promise<void> {
  const day = sim.n;
  const frolics = await rows(sim, "frolics");
  const seats = await rows(sim, "attendees");
  const now = Date.now();
  const expected = frolics
    .filter((frolic) => {
      const going = seats.filter((row) => row.frolicId === frolic._id && row.status === "going").length;
      return going >= 2 && nightHappened(frolic, now);
    })
    .map((frolic) => frolic._id as string)
    .sort();
  for (const name of await liveMembers(sim)) {
    const view = await gardenView(sim, name);
    expectSame(day, name, "one flower per frolic that happened", view.collection.flowers.map((flower) => flower.frolicId as string).sort(), expected);
  }
  for (const frolic of frolics.filter((row) => row.status === "faded")) {
    if (expected.includes(frolic._id)) fail(day, "system", "one flower per frolic that happened", `the faded frolic on ${frolic.day} grew a flower`);
  }
}

export async function checkMembership(sim: Sim): Promise<void> {
  const day = sim.n;
  const seats = await rows(sim, "attendees");
  const frolics = await rows(sim, "frolics");
  const now = Date.now();
  const users = await sim.t.run(async (ctx) => await ctx.db.query("users").collect());
  const alive = new Set(users.map((user) => user._id as string));
  const memberships = await sim.t.run(
    async (ctx) => await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", sim.groupId)).collect(),
  );
  const inside = new Set(memberships.map((row) => row.userId as string));
  for (const seat of seats) {
    const frolic = frolics.find((row) => row._id === seat.frolicId);
    const record = frolic !== undefined && nightHappened(frolic, now);
    if (!alive.has(seat.userId) && record) continue;
    if (!alive.has(seat.userId)) fail(day, "system", "no seat for someone who left", `a seat points at departed user ${seat.userId}`);
    if (!inside.has(seat.userId)) fail(day, "system", "no seat for someone who left", `${seat.userId} holds a seat with no membership`);
  }
  for (const name of await liveMembers(sim)) {
    const view = await today(sim, name);
    if (view.reveal === null) continue;
    const going = seats
      .filter((row) => row.frolicId === view.frolic?.frolicId && row.status === "going" && alive.has(row.userId))
      .map((row) => row.userId as string)
      .sort();
    expectSame(day, name, "a phone shows exactly who is going", view.reveal.going.map((person) => person.userId as string).sort(), going);
  }
}

export async function checkOutsiderIsRefused(sim: Sim): Promise<void> {
  const day = sim.n;
  const outsider = "device-zed-0123456789abcdefghijklmnop";
  await sim.t.mutation(api.users.createGroup, { deviceToken: outsider, firstName: "Zed", groupName: "Other Crew" });
  for (const read of [
    async () => await sim.t.query(api.frolics.today, { deviceToken: outsider, groupId: sim.groupId }),
    async () => await sim.t.query(api.garden.overview, { deviceToken: outsider, groupId: sim.groupId }),
  ]) {
    let refused = false;
    try {
      await read();
    } catch (e) {
      refused = String((e as { data?: { code?: string } }).data?.code ?? e).includes("NOT_A_MEMBER");
    }
    if (!refused) fail(day, "Zed", "a plan never reaches someone who is not in the crew", "a stranger read the crew's day");
  }
}

export async function checkAll(sim: Sim): Promise<void> {
  await checkRevealOnce(sim);
  await checkMoney(sim);
  await checkGarden(sim);
  await checkMembership(sim);
  if (sim.ledger.bugs.length > 0) fail(sim.n, "system", "the harness saw a refusal", sim.ledger.bugs.join("; "));
  const stray = await sim.t.run(async (ctx) =>
    (await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", sim.groupId).eq("day", dayOf(sim.n))).take(5)).filter(
      (row) => row.groupId !== sim.groupId,
    ),
  );
  if (stray.length > 0) fail(sim.n, "system", "a plan stays in its crew", `${stray.length} plans escaped`);
}
