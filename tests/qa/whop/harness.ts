import { expect, vi } from "vitest";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";
import { signWebhook } from "../../../convex/whop/signature";

declare const process: { env: Record<string, string | undefined> };

export const modules = (import.meta as unknown as {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}).glob("/convex/**/*.ts");

export const WHOP_BASE = "https://sandbox-api.whop.com/api/v1";
export const WEBHOOK_SECRET = "ws_qa_secret";
export const NOON = Date.UTC(2026, 10, 15, 20, 0, 0);
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function makeT() {
  const t = convexTest(schema, modules);
  presence.register(t);
  rateLimiter.register(t);
  workflow.register(t);
  return t;
}

export type Call = { method: string; path: string; key: string | null; body: any };
export type PaymentState = {
  status: string;
  substatus: string;
  amountAfterFees?: string;
  metadata?: Record<string, unknown>;
  productId?: string;
};

export type WhopWorld = {
  payments: Map<string, PaymentState>;
  calls: Call[];
  createState: PaymentState;
  fail: {
    create?: boolean;
    createThrowsAfter?: boolean;
    read?: boolean;
    list?: boolean;
    capture?: boolean;
    void?: boolean;
    refund?: boolean;
  };
  onCapture?: PaymentState;
  onVoid?: PaymentState;
  onRefund?: PaymentState;
  seq: number;
};

export function newWorld(): WhopWorld {
  return {
    payments: new Map(),
    calls: [],
    createState: { status: "authorized", substatus: "requires_capture" },
    fail: {},
    seq: 0,
  };
}

function paymentJson(id: string, state: PaymentState) {
  return {
    id,
    status: state.status,
    substatus: state.substatus,
    client_secret: "cs",
    amount_after_fees: { amount: state.amountAfterFees ?? "2.62" },
    capture_expires_at: new Date(NOON + 5 * 24 * HOUR).toISOString(),
    metadata: state.metadata ?? {},
    product_id: state.productId ?? null,
  };
}

export function installWhop(world: WhopWorld) {
  const fake = async (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> => {
    const path = input.startsWith(WHOP_BASE) ? input.slice(WHOP_BASE.length) : input;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = init?.headers ?? {};
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    world.calls.push({ method, path, key: headers["Idempotency-Key"] ?? null, body });
    const reply = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

    if (method === "GET" && path.startsWith("/payments?")) {
      if (world.fail.list) return reply({ error: "boom" }, 500);
      const data = [...world.payments.entries()].map(([id, state]) => paymentJson(id, state));
      return reply({ data });
    }

    if (method === "POST" && path === "/payments") {
      if (world.fail.create) return reply({ error: "card_declined" }, 402);
      const id = `pay_${++world.seq}`;
      world.payments.set(id, {
        ...world.createState,
        metadata: (body?.metadata as Record<string, unknown> | undefined) ?? {},
        productId: (body?.variant as { product_id?: string } | undefined)?.product_id,
      });
      if (world.fail.createThrowsAfter) throw new Error("network reset after the payment was created");
      return reply(paymentJson(id, world.createState));
    }

    const match = /^\/payments\/([^/]+)(?:\/(void|capture|refund))?$/.exec(path);
    if (!match) return reply({ error: "unknown" }, 404);
    const [, id, action] = match;
    if (action === undefined) {
      if (world.fail.read) return reply({ error: "boom" }, 500);
      return reply(paymentJson(id, world.payments.get(id) ?? { status: "authorized", substatus: "requires_capture" }));
    }
    if (action === "void") {
      if (world.fail.void) return reply({ error: "cannot_void" }, 409);
      const state = world.onVoid ?? { status: "void", substatus: "canceled" };
      world.payments.set(id, state);
      return reply(paymentJson(id, state));
    }
    if (action === "capture") {
      if (world.fail.capture) return reply({ error: "cannot_capture" }, 409);
      const state = world.onCapture ?? { status: "paid", substatus: "succeeded" };
      world.payments.set(id, state);
      return reply(paymentJson(id, state));
    }
    if (world.fail.refund) return reply({ error: "cannot_refund" }, 409);
    const state = world.onRefund ?? { status: "refunded", substatus: "refunded" };
    world.payments.set(id, state);
    return reply(paymentJson(id, state));
  };
  vi.stubGlobal("fetch", fake);
}

export function setEnv() {
  process.env.WHOP_SANDBOX_API_KEY = "test";
  process.env.WHOP_API_BASE = WHOP_BASE;
  process.env.WHOP_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.WHOP_ACCOUNT_ID = "biz_qa";
  process.env.WHOP_HOLD_PRODUCT_ID = "prod_hold";
  process.env.WHOP_PLANS_PRODUCT_ID = "prod_plans";
  process.env.CONVEX_SITE_URL = "https://frolic.convex.site";
  process.env.FROLIC_HOLD_CENTS = "300";
}

export const token = (name: string) => `device-${name.toLowerCase()}-0123456789abcdefghijklmnop`;

export type Crew = {
  groupId: Id<"groups">;
  frolicId: Id<"frolics">;
  ids: Record<string, Id<"users">>;
};

export async function crew(
  t: any,
  names: string[],
  opts: { costDollars?: number; durationMinutes?: number; windowStartIn?: number; windowEndIn?: number } = {},
): Promise<Crew> {
  const [first, ...rest] = names;
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(first),
    firstName: first,
    groupName: "Sunset Crew",
  });
  const ids: Record<string, Id<"users">> = { [first]: created.userId };
  for (const name of rest) {
    const joined = await t.mutation(api.users.joinGroup, {
      deviceToken: token(name),
      firstName: name,
      inviteCode: created.inviteCode,
    });
    ids[name] = joined.userId;
  }
  const now = Date.now();
  let planId: Id<"plans"> | undefined;
  const costDollars = opts.costDollars;
  if (costDollars !== undefined) {
    planId = await t.run(async (ctx: any) => {
      const placeId = await ctx.db.insert("places", {
        slug: "kayaks-at-the-marina",
        name: "Aquatic Park",
        title: "Kayaks at the Marina",
        address: "Aquatic Park, Berkeley",
        lat: 37.8677,
        lng: -122.3045,
        cost: costDollars,
        costPerPersonCents: Math.round(costDollars * 100),
        costLabel: `$${costDollars}`,
        payUpFront: true,
        priceVerified: true,
        tags: ["water"],
        hours: [{ day: 6, open: 0, close: 24 }],
        indoor: false,
        sober: true,
        energy: "active",
        needsDaylight: true,
        durationMinutes: opts.durationMinutes ?? 60,
        meetSpot: "The dock",
        source: "qa",
      });
      return await ctx.db.insert("plans", {
        groupId: created.groupId,
        day: "2026-11-15",
        kind: "daily",
        placeId,
        title: "Kayaks at the Marina",
        line: "Clear and 64",
        cost: costDollars,
        costLabel: `$${costDollars}`,
        payUpFront: true,
        chips: ["water"],
        startsAt: now + (opts.windowStartIn ?? HOUR),
        durationMinutes: opts.durationMinutes ?? 60,
        source: "scorer",
        whySource: "template",
        whyInputs: { placeName: "Aquatic Park", topTags: ["water"], rainSwap: false },
        weatherSwap: false,
        generatedAt: now,
      });
    });
  }
  const frolicId = await t.mutation(internal.frolics.open, {
    groupId: created.groupId,
    day: "2026-11-15",
    kind: "daily",
    window: {
      start: now + (opts.windowStartIn ?? HOUR),
      end: now + (opts.windowEndIn ?? 6 * HOUR),
    },
    durationMinutes: opts.durationMinutes ?? 60,
    deadline: now + 4 * HOUR,
    planId,
  });
  return { groupId: created.groupId, frolicId, ids };
}

export async function drain(t: any, rounds = 12, stepMs = 1) {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(stepMs);
    await t.finishInProgressScheduledFunctions();
  }
}

export async function revealed(t: any, c: Crew, names: string[]) {
  for (const name of names) {
    await t.mutation(api.taps.tap, {
      deviceToken: token(name),
      frolicId: c.frolicId,
      kind: "down",
      onlyIf: [],
    });
  }
  const pending = await t.run(
    async (ctx: any) =>
      await ctx.db
        .query("reveals")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", c.frolicId))
        .unique(),
  );
  expect(pending, "fixture needs a pending reveal").toBeTruthy();
  await drain(t, 4, 2000);
  const frolic = await t.run(async (ctx: any) => await ctx.db.get("frolics", c.frolicId));
  expect(frolic.status, "fixture needs a revealed frolic").toBe("on");
  return frolic;
}

export async function shares(t: any, frolicId: Id<"frolics">) {
  return await t.run(
    async (ctx: any) =>
      await ctx.db
        .query("shares")
        .withIndex("by_frolicId", (q: any) => q.eq("frolicId", frolicId))
        .collect(),
  );
}

export async function shareOf(t: any, frolicId: Id<"frolics">, userId: Id<"users">) {
  return await t.run(
    async (ctx: any) =>
      await ctx.db
        .query("shares")
        .withIndex("by_frolicId_and_userId", (q: any) =>
          q.eq("frolicId", frolicId).eq("userId", userId),
        )
        .unique(),
  );
}

export async function fundBalance(t: any, groupId: Id<"groups">) {
  return await t.run(async (ctx: any) => {
    const rows = await ctx.db
      .query("fundLedger")
      .withIndex("by_groupId", (q: any) => q.eq("groupId", groupId))
      .collect();
    return rows.reduce((sum: number, r: any) => sum + r.amountCents, 0);
  });
}

export async function ledger(t: any, groupId: Id<"groups">) {
  return await t.run(
    async (ctx: any) =>
      await ctx.db
        .query("fundLedger")
        .withIndex("by_groupId", (q: any) => q.eq("groupId", groupId))
        .collect(),
  );
}

export type Delivery = {
  id?: string;
  type: string;
  data: Record<string, unknown>;
  timestamp?: number;
  secret?: string;
};

export async function deliver(t: any, delivery: Delivery) {
  const body = JSON.stringify({ type: delivery.type, data: delivery.data });
  const id = delivery.id ?? `evt_${Math.random().toString(16).slice(2)}`;
  const timestamp = String(Math.floor((delivery.timestamp ?? Date.now()) / 1000));
  const signature = await signWebhook(delivery.secret ?? WEBHOOK_SECRET, id, timestamp, body);
  return await t.fetch("/whop/webhook", {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
      "content-type": "application/json",
    },
    body,
  });
}

export async function rawWebhook(
  t: any,
  args: { id: string; timestamp: string; signature: string; body: string },
) {
  return await t.fetch("/whop/webhook", {
    method: "POST",
    headers: {
      "webhook-id": args.id,
      "webhook-timestamp": args.timestamp,
      "webhook-signature": args.signature,
      "content-type": "application/json",
    },
    body: args.body,
  });
}

export async function findExport(names: string[]) {
  const { makeFunctionReference } = await import("convex/server");
  const kinds = new Map<string, string>();
  for (const path of Object.keys(modules)) {
    if (path.includes("_generated")) continue;
    let mod: Record<string, unknown>;
    try {
      mod = (await modules[path]()) as Record<string, unknown>;
    } catch {
      continue;
    }
    const module = path.replace(/^\/convex\//, "").replace(/\.ts$/, "");
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") kinds.set(`${module}:${name}`, module);
    }
  }
  for (const name of names) {
    const hit = [...kinds.keys()].find((key) => key.endsWith(`:${name}`));
    if (hit) {
      return {
        key: hit,
        ref: makeFunctionReference(hit) as never,
      };
    }
  }
  return null;
}

export function paymentEvent(
  shareId: Id<"shares">,
  paymentId: string,
  status: string,
  substatus: string,
): Record<string, unknown> {
  return {
    id: paymentId,
    status,
    substatus,
    metadata: { shareId },
    amount_after_fees: { amount: "2.62" },
  };
}

export async function charge(t: any, shareId: Id<"shares">, world: WhopWorld) {
  const share = await t.run(async (ctx: any) => await ctx.db.get("shares", shareId));
  const begun = await t.mutation(internal.whop.money.beginCharge, { token: share.token });
  expect(begun.ok, "fixture needs a share that can be charged").toBe(true);
  const state = world.createState;
  const id = `pay_${++world.seq}`;
  world.payments.set(id, { ...state });
  await t.mutation(internal.whop.money.recordCharge, {
    shareId,
    whopPaymentId: id,
    signal: state.substatus === "requires_capture" ? "authorized" : "succeeded",
  });
  await drain(t);
  return id;
}
