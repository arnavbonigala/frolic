import { whopConfig } from "./config";

export class WhopError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type WhopMoney = { amount: string } | number | string | null | undefined;

export type WhopPayment = {
  id: string;
  status?: string;
  substatus?: string;
  client_secret?: string | null;
  metadata?: Record<string, unknown> | null;
  amount_after_fees?: WhopMoney;
  refunded_amount?: WhopMoney;
  capture_expires_at?: string | null;
};

export function moneyToCents(m: WhopMoney): number | undefined {
  if (m === null || m === undefined) return undefined;
  const raw = typeof m === "object" ? m.amount : m;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

async function call(path: string, method: "GET" | "POST", opts: { body?: unknown; idempotencyKey?: string }): Promise<unknown> {
  const cfg = whopConfig();
  if (!cfg.baseUrl.startsWith("https://sandbox-api.whop.com/")) throw new WhopError(0, "Frolic only talks to the Whop sandbox");
  if (!cfg.apiKey) throw new WhopError(0, "WHOP_SANDBOX_API_KEY is not set");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey.slice(0, 255);
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new WhopError(res.status, text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}

export const whop = {
  createPayment: async (body: Record<string, unknown>, idempotencyKey: string) =>
    (await call("/payments", "POST", { body, idempotencyKey })) as WhopPayment,
  getPayment: async (id: string) => (await call(`/payments/${id}`, "GET", {})) as WhopPayment,
  listPayments: async (params: Record<string, string>) =>
    ((await call(`/payments?${new URLSearchParams(params).toString()}`, "GET", {})) as { data?: WhopPayment[] }).data ?? [],
  voidPayment: async (id: string, idempotencyKey: string) =>
    (await call(`/payments/${id}/void`, "POST", { body: {}, idempotencyKey })) as WhopPayment,
  capturePayment: async (id: string, idempotencyKey: string) =>
    (await call(`/payments/${id}/capture`, "POST", { body: {}, idempotencyKey })) as WhopPayment,
  refundPayment: async (id: string, idempotencyKey: string) =>
    (await call(`/payments/${id}/refund`, "POST", { body: {}, idempotencyKey })) as WhopPayment,
  createProduct: async (body: Record<string, unknown>, idempotencyKey: string) =>
    (await call("/products", "POST", { body, idempotencyKey })) as { id: string },
  listProducts: async (params: Record<string, string>) =>
    ((await call(`/products?${new URLSearchParams(params).toString()}`, "GET", {})) as { data?: WhopListed[] }).data ?? [],
  createVariant: async (body: Record<string, unknown>, idempotencyKey: string) =>
    (await call("/variants", "POST", { body, idempotencyKey })) as WhopListed,
  listVariants: async (params: Record<string, string>) =>
    ((await call(`/variants?${new URLSearchParams(params).toString()}`, "GET", {})) as { data?: WhopListed[] }).data ?? [],
  createCheckoutConfiguration: async (body: Record<string, unknown>, idempotencyKey: string) =>
    (await call("/checkout_configurations", "POST", { body, idempotencyKey })) as { id: string; purchase_url?: string | null },
};

export type WhopListed = { id: string; metadata?: Record<string, unknown> | null; purchase_url?: string | null };
