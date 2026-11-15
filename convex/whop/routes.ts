import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { whopConfig } from "./config";
import { PAY_ART } from "./art";
import { closedPage, payPage } from "./page";
import { verifyWebhook } from "./signature";

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const webhook = httpAction(async (ctx, req) => {
  const body = await req.text();
  const ok = await verifyWebhook(
    whopConfig().webhookSecret,
    { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
    body,
    Date.now(),
  );
  if (!ok) return new Response("bad signature", { status: 401 });
  let type = "unknown";
  try {
    const parsed = JSON.parse(body) as { type?: unknown };
    if (typeof parsed.type === "string") type = parsed.type;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  await ctx.runMutation(internal.whop.webhooks.ingest, { eventId: req.headers.get("webhook-id")!, type, payload: body });
  return new Response("ok", { status: 200 });
});

export const page = httpAction(async (ctx, req) => {
  const token = new URL(req.url).pathname.split("/").pop() ?? "";
  if (!/^[0-9a-f]{32}$/.test(token)) return html(closedPage("This link has expired."), 404);
  const view = await ctx.runQuery(internal.whop.money.payView, { token });
  if (!view.ok) {
    const alreadySet = view.art === undefined ? 410 : 200;
    return html(closedPage(view.message, view.art), alreadySet);
  }
  const cfg = whopConfig();
  return html(
    payPage({
      token,
      title: view.title,
      when: view.when,
      kind: view.kind,
      amountCents: view.amountCents,
      fundCents: view.fundCents,
      accountId: cfg.accountId,
      sandbox: cfg.baseUrl.includes("sandbox"),
    }),
  );
});

export const confirm = httpAction(async (ctx, req) => {
  let token: unknown, confirmationToken: unknown;
  try {
    ({ token, confirmationToken } = (await req.json()) as { token?: unknown; confirmationToken?: unknown });
  } catch {
    return json({ ok: false, message: "That didn't go through. Try again." }, 400);
  }
  if (typeof token !== "string" || typeof confirmationToken !== "string" || !/^[0-9a-f]{32}$/.test(token) || !confirmationToken.startsWith("ctok_")) {
    return json({ ok: false, message: "That didn't go through. Try again." }, 400);
  }
  const out = await ctx.runAction(internal.whop.actions.charge, { token, confirmationToken });
  return json(out, out.ok ? 200 : 409);
});

export const art = httpAction(async (_ctx, req) => {
  const key = new URL(req.url).pathname.slice("/pay-art/".length).replace(/\.webp$/, "");
  if (!Object.prototype.hasOwnProperty.call(PAY_ART, key)) return new Response("Not found", { status: 404 });
  const bytes = PAY_ART[key];
  return new Response(Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)).buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const applePay = httpAction(async () => {
  const res = await fetch("https://whop.com/.well-known/apple-platform-integrator/apple-developer-merchantid-domain-association");
  return new Response(await res.arrayBuffer(), { status: res.status, headers: { "Content-Type": "application/octet-stream" } });
});

export function registerWhopRoutes(http: HttpRouter): void {
  http.route({ path: "/whop/webhook", method: "POST", handler: webhook });
  http.route({ path: "/pay/confirm", method: "POST", handler: confirm });
  http.route({ pathPrefix: "/pay-art/", method: "GET", handler: art });
  http.route({ pathPrefix: "/pay/", method: "GET", handler: page });
  http.route({ path: "/.well-known/apple-developer-merchantid-domain-association", method: "GET", handler: applePay });
}
