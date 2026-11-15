import { vi } from "vitest";

declare const process: { env: Record<string, string | undefined> };
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { addDays, localTimeToMs, solarTimes } from "../../../convex/plans/time";
import { makeT, token, type T } from "../setup.helpers";

export const FIRST_DAY = "2026-11-15";
export const WHOP_BASE = "https://sandbox-api.whop.com/api/v1";

export const dayOf = (n: number) => addDays(FIRST_DAY, n - 1);
export const minuteOf = (n: number, minutes: number) => localTimeToMs(dayOf(n), minutes);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Payment = { id: string; shareId: string; status: string; substatus: string; amountCents: number; afterFeesCents: number };

export type Ledger = {
  payments: Map<string, Payment>;
  capturedCents: number;
  voidedCents: number;
  refundedCents: number;
  rain: boolean;
  bugs: string[];
};

export type Sim = {
  t: T;
  groupId: Id<"groups">;
  ids: Record<string, Id<"users">>;
  tokens: Record<string, string>;
  ledger: Ledger;
  n: number;
  inviteCode: string;
};

function rainyBody(day: string) {
  const sun = solarTimes(day);
  const hours = Array.from({ length: 24 }, (_, i) => localTimeToMs(day, i * 60) / 1000);
  return {
    hourly: {
      time: hours,
      temperature_2m: hours.map(() => 58),
      precipitation_probability: hours.map(() => 90),
      weather_code: hours.map(() => 63),
      cloud_cover: hours.map(() => 95),
    },
    daily: { sunrise: [sun.sunriseMs / 1000], sunset: [sun.sunsetMs / 1000] },
  };
}

export function makeLedger(): Ledger {
  const ledger: Ledger = { payments: new Map(), capturedCents: 0, voidedCents: 0, refundedCents: 0, rain: false, bugs: [] };
  let seq = 0;
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
  const shape = (p: Payment) => ({
    id: p.id,
    status: p.status,
    substatus: p.substatus,
    client_secret: "cs",
    amount_after_fees: { amount: (p.afterFeesCents / 100).toFixed(2) },
  });
  const fake = async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    if (url.startsWith("https://api.open-meteo.com/")) {
      if (!ledger.rain) return reply({ error: "no weather in this run" }, 503);
      const day = new URL(url).searchParams.get("start_date") ?? FIRST_DAY;
      return reply(rainyBody(day));
    }
    if (!url.startsWith(WHOP_BASE)) return reply({ error: "offline" }, 503);
    const path = url.slice(WHOP_BASE.length);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" && path === "/payments") {
      const body = JSON.parse(init?.body ?? "{}") as {
        capture?: boolean;
        variant?: { initial_price?: number };
        metadata?: { shareId?: string };
      };
      const amountCents = Math.round(Number(body.variant?.initial_price ?? 0) * 100);
      const straight = body.capture === true;
      const payment: Payment = {
        id: `pay_${++seq}`,
        shareId: String(body.metadata?.shareId ?? ""),
        status: straight ? "paid" : "authorized",
        substatus: straight ? "succeeded" : "requires_capture",
        amountCents,
        afterFeesCents: Math.round(amountCents * 0.88),
      };
      if (straight) ledger.capturedCents += amountCents;
      ledger.payments.set(payment.id, payment);
      return reply(shape(payment));
    }
    const match = /^\/payments\/([^/?]+)(?:\/(void|capture|refund))?(?:\?.*)?$/.exec(path);
    if (!match) return reply({ error: "unknown route" }, 404);
    const payment = ledger.payments.get(match[1]);
    if (!payment) return reply({ error: "no such payment" }, 404);
    if (match[2] === "capture") {
      payment.status = "paid";
      payment.substatus = "succeeded";
      ledger.capturedCents += payment.amountCents;
    }
    if (match[2] === "void") {
      payment.status = "void";
      payment.substatus = "canceled";
      payment.afterFeesCents = 0;
      ledger.voidedCents += payment.amountCents;
    }
    if (match[2] === "refund") {
      payment.status = "refunded";
      payment.substatus = "refunded";
      ledger.refundedCents += payment.amountCents;
    }
    return reply(shape(payment));
  };
  vi.stubGlobal("fetch", fake);
  return ledger;
}

export async function openCrew(ledger: Ledger): Promise<Sim> {
  process.env.WHOP_API_BASE = WHOP_BASE;
  process.env.WHOP_SANDBOX_API_KEY = "sim";
  process.env.WHOP_ACCOUNT_ID = "biz_sim";
  process.env.WHOP_HOLD_PRODUCT_ID = "prod_hold_sim";
  process.env.WHOP_PLANS_PRODUCT_ID = "prod_plans_sim";
  process.env.CONVEX_SITE_URL = "https://frolic.convex.site";
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token("Maya"),
    firstName: "Maya",
    groupName: "Sunset Crew",
  });
  const ids: Record<string, Id<"users">> = { Maya: created.userId };
  const tokens: Record<string, string> = { Maya: token("Maya") };
  for (const name of ["Dev", "Jordan", "Priya"]) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
    ids[name] = joined.userId;
    tokens[name] = token(name);
  }
  await t.run(async (ctx) => await ctx.db.patch("groups", created.groupId, { holdEnabled: true }));
  return { t, groupId: created.groupId, ids, tokens, ledger, n: 0, inviteCode: created.inviteCode };
}

export async function settle(t: T): Promise<void> {
  await t.finishInProgressScheduledFunctions();
}

export async function advance(t: T, ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  await settle(t);
}

export async function jumpTo(t: T, at: number): Promise<void> {
  const delta = at - Date.now();
  if (delta > 0) vi.advanceTimersByTime(delta);
  await settle(t);
}

export function localHourInstant(day: string, timezone: string, hour: number): number {
  const midnight = localTimeToMs(day, 0);
  const read = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", hour: "2-digit" });
  for (let i = 0; i < 96; i++) {
    const at = midnight + i * 15 * MINUTE;
    if (Number(read.format(at)) % 24 === hour) return at;
  }
  return midnight + hour * HOUR;
}

export async function frolicsOf(sim: Sim): Promise<Doc<"frolics">[]> {
  return await sim.t.run(
    async (ctx) => await ctx.db.query("frolics").withIndex("by_groupId_and_day", (q) => q.eq("groupId", sim.groupId)).collect(),
  );
}

export async function frolicOn(sim: Sim, day: string): Promise<Doc<"frolics"> | null> {
  return (
    (await frolicsOf(sim)).filter((row) => row.day === day && row.origin !== "free").sort((a, b) => a._creationTime - b._creationTime)[0] ??
    null
  );
}

export async function planOn(sim: Sim, day: string): Promise<Doc<"plans"> | null> {
  return await sim.t.run(
    async (ctx) =>
      (await ctx.db.query("plans").withIndex("by_groupId_and_day", (q) => q.eq("groupId", sim.groupId).eq("day", day)).take(10)).find(
        (row) => row.kind === "daily",
      ) ?? null,
  );
}

export async function rows<N extends "taps" | "reveals" | "attendees" | "revealLog" | "shares" | "checkins" | "hopIns" | "fundLedger" | "gardenNudges" | "frolics">(
  sim: Sim,
  table: N,
): Promise<Doc<N>[]> {
  return await sim.t.run(async (ctx) => await ctx.db.query(table).collect());
}

export async function settleReveal(sim: Sim, frolicId: Id<"frolics">, rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await advance(sim.t, 1_000);
    const logged = (await rows(sim, "revealLog")).filter((row) => row.frolicId === frolicId);
    const money = (await rows(sim, "shares")).filter((row) => row.frolicId === frolicId);
    if (logged.length > 0 && money.length > 0) return;
  }
}

export async function setFree(sim: Sim, name: string, state: "now" | "window" | "busy", window?: { start: number; end: number }) {
  await sim.t.mutation(api.crew.setFree, {
    deviceToken: sim.tokens[name],
    groupId: sim.groupId,
    day: dayOf(sim.n),
    state,
    window,
  });
}

export async function tap(sim: Sim, name: string, kind: "down" | "notToday", onlyIf?: string[]) {
  const frolic = await frolicOn(sim, dayOf(sim.n));
  if (!frolic) throw new Error(`day ${sim.n} / ${name} / no frolic to tap`);
  return await sim.t.mutation(api.taps.tap, {
    deviceToken: sim.tokens[name],
    frolicId: frolic._id,
    kind,
    onlyIf: onlyIf?.map((other) => sim.ids[other]),
  });
}

export async function tapQuietly(sim: Sim, name: string, kind: "down" | "notToday", onlyIf?: string[]): Promise<string | null> {
  try {
    await tap(sim, name, kind, onlyIf);
    return null;
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? (e instanceof Error ? e.message : String(e));
  }
}

export async function untap(sim: Sim, name: string) {
  const frolic = await frolicOn(sim, dayOf(sim.n));
  if (!frolic) return;
  await sim.t.mutation(api.taps.untap, { deviceToken: sim.tokens[name], frolicId: frolic._id });
}

export async function sitOut(sim: Sim, name: string) {
  const frolic = await frolicOn(sim, dayOf(sim.n));
  if (!frolic) return;
  await sim.t.mutation(api.frolics.sitOut, { deviceToken: sim.tokens[name], frolicId: frolic._id });
}

export async function checkIn(sim: Sim, name: string) {
  const frolic = await frolicOn(sim, dayOf(sim.n));
  if (!frolic) return;
  await sim.t.mutation(api.checkins.checkInMe, { deviceToken: sim.tokens[name], frolicId: frolic._id, method: "geofence" });
}

export async function payHold(sim: Sim, name: string): Promise<void> {
  const frolic = await frolicOn(sim, dayOf(sim.n));
  if (!frolic) return;
  const share = await sim.t.run(
    async (ctx) =>
      await ctx.db
        .query("shares")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolic._id).eq("userId", sim.ids[name]))
        .unique(),
  );
  if (!share?.token) {
    sim.ledger.bugs.push(`day ${sim.n} / ${name} / no share to pay`);
    return;
  }
  const result = await sim.t.action(internal.whop.actions.charge, { token: share.token, confirmationToken: `${share._id}-${name}` });
  if (!result.ok) sim.ledger.bugs.push(`day ${sim.n} / ${name} / charge refused: ${result.message}`);
}

export async function liveMembers(sim: Sim): Promise<string[]> {
  const users = await sim.t.run(async (ctx) => await ctx.db.query("users").collect());
  const alive = new Set(users.map((user) => user._id as string));
  return Object.keys(sim.ids).filter((name) => alive.has(sim.ids[name]));
}

export async function today(sim: Sim, name: string, frolicId?: Id<"frolics">) {
  return await sim.t.query(api.frolics.today, {
    deviceToken: sim.tokens[name],
    groupId: sim.groupId,
    frolicId,
  });
}

export async function crewView(sim: Sim, name: string) {
  return await sim.t.query(api.crew.crew, { deviceToken: sim.tokens[name], groupId: sim.groupId, day: dayOf(sim.n) });
}

export async function gardenView(sim: Sim, name: string) {
  return await sim.t.query(api.garden.overview, { deviceToken: sim.tokens[name], groupId: sim.groupId, day: dayOf(sim.n) });
}

export async function groupRow(sim: Sim): Promise<Doc<"groups">> {
  return (await sim.t.run(async (ctx) => await ctx.db.get("groups", sim.groupId)))!;
}
