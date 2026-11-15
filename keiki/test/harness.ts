import { vi } from "vitest";
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { hmacHex } from "../../convex/keiki/auth";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import { modules } from "./fakes";
import type { T } from "./seed";

export const API_KEY = "test-key";
export const SIGNING_SECRET = "test-secret";
export const NOTICE_PREFIX = "https://onkeiki.com/api/v1/developer/agents/";
export const INDIAN_ROCK_MAP_LINK = "https://maps.apple.com/?ll=37.8925,-122.2717";
export const REVEAL_DELAY_MS = 1500;

let traceCount = 0;

function nextTrace(): string {
  traceCount += 1;
  return "tr_" + traceCount;
}

export function testEnv(): Record<string, string | undefined> {
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
}

export function makeT(map: Record<string, () => Promise<unknown>> = modules): T {
  const t = convexTest(schema, map);
  presence.register(t);
  rateLimiter.register(t);
  workflow.register(t);
  return t;
}

export async function advance(t: T, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
  for (let i = 0; i < 4; i++) {
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
  }
}

export async function tapAs(
  t: T,
  userId: Id<"users">,
  frolicId: Id<"frolics">,
  kind: "down" | "notToday" = "down",
  source: "app" | "notification" | "imessage" = "app",
) {
  return await t.mutation(internal.taps.tapAs, { userId, frolicId, kind, source });
}

export type CallArgs = {
  phone: string;
  input?: Record<string, unknown>;
  context?: Record<string, unknown>;
  trace?: string | null;
  headers?: Record<string, string>;
};

export function postTool(t: T, tool: string, args: CallArgs): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Orchid-Api-Key": API_KEY,
    ...(args.trace === null ? {} : { "X-Orchid-Trace-Id": args.trace ?? nextTrace() }),
    ...args.headers,
  };
  return t.fetch("/keiki/tools/" + tool, {
    method: "POST",
    headers,
    body: JSON.stringify({ input: args.input ?? {}, context: { phone: args.phone, ...args.context } }),
  });
}

export async function toolResult(t: T, tool: string, args: CallArgs) {
  const res = await postTool(t, tool, args);
  const text = await res.text();
  return {
    status: res.status,
    replayed: res.headers.get("Keiki-Replayed") === "true",
    text,
    body: JSON.parse(text) as any,
  };
}

export function toolBody(tool: string, input: Record<string, unknown>, context: Record<string, unknown>): string {
  return JSON.stringify({ input, context });
}

export async function signedHeaders(body: string, options: { secret?: string; timestamp?: number } = {}) {
  const timestamp = String(options.timestamp ?? Date.now());
  const signature = await hmacHex(options.secret ?? SIGNING_SECRET, timestamp + "." + body);
  return {
    "Content-Type": "application/json",
    "X-Keiki-Timestamp": timestamp,
    "X-Keiki-Signature": "sha256=" + signature,
  };
}

export type Notice = { url: string; phone: string; text: string; at: number };

export type FetchOptions = { noticeStatus?: number; mapLink?: string; noticeBody?: unknown };

export function installFetch(options: FetchOptions = {}) {
  const notices: Notice[] = [];
  const urls: string[] = [];
  const mapLink = options.mapLink ?? INDIAN_ROCK_MAP_LINK;
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    if (url.startsWith(NOTICE_PREFIX)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { phone: string; text: string };
      notices.push({ url, phone: body.phone, text: body.text, at: Date.now() });
      return new Response(JSON.stringify(options.noticeBody ?? {}), { status: options.noticeStatus ?? 200 });
    }
    if (url.endsWith(".vcf")) {
      return new Response("BEGIN:VCARD\nVERSION:3.0\nFN:Frolic\nURL:" + mapLink + "\nEND:VCARD\n", {
        status: 200,
        headers: { "Content-Type": "text/vcard" },
      });
    }
    if (url.endsWith(".jpg")) {
      return new Response(new Uint8Array([255, 216, 255, 224]), { status: 200, headers: { "Content-Type": "image/jpeg" } });
    }
    return new Response("missing", { status: 404 });
  });
  vi.stubGlobal("fetch", stub);
  return { notices, urls, stub };
}

export function tapsOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("taps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64));
}

export function outboxOf(t: T) {
  return t.run(async (ctx) => await ctx.db.query("keikiOutbox").take(256));
}

export function requestsOf(t: T) {
  return t.run(async (ctx) => await ctx.db.query("keikiRequests").take(64));
}

export function frolicOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.get("frolics", frolicId));
}

export function revealsOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("reveals").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(8));
}

export function attendeesOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("attendees").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64));
}

export function checkinsOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("checkins").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64));
}

export function etasOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("etas").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64));
}

export function snapsOf(t: T, frolicId: Id<"frolics">) {
  return t.run(async (ctx) => await ctx.db.query("snaps").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).take(64));
}

export function linksOf(t: T) {
  return t.run(async (ctx) => await ctx.db.query("keikiLinks").take(64));
}

export function membershipsOf(t: T, groupId: Id<"groups">) {
  return t.run(async (ctx) => await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", groupId)).take(64));
}

export function patchFrolic(t: T, frolicId: Id<"frolics">, fields: Record<string, unknown>) {
  return t.run(async (ctx) => {
    await ctx.db.patch("frolics", frolicId, fields);
  });
}

export function storeBlob(t: T, bytes: number[], type: string) {
  return t.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
}
