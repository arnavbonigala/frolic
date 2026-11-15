import type { HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { authenticate, identify, sha256Hex } from "./auth";
import type { Identity } from "./auth";
import { parseSharedLocation } from "./lib";
import { checkoutLinkFor } from "./refs";
import { keikiEnv } from "./env";

export const TOOL_NAMES = [
  "get_member",
  "join_crew",
  "get_today",
  "tap_down",
  "tap_only_if",
  "tap_pass",
  "get_reveal",
  "on_my_way",
  "check_in",
  "submit_snap",
  "pay_deposit",
  "remember",
  "pause",
  "link_group_chat",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const WRITES: ReadonlySet<ToolName> = new Set([
  "join_crew",
  "tap_down",
  "tap_only_if",
  "tap_pass",
  "on_my_way",
  "check_in",
  "submit_snap",
  "pay_deposit",
  "remember",
  "pause",
  "link_group_chat",
]);

const DM_ONLY: ReadonlySet<ToolName> = new Set(TOOL_NAMES.filter((t) => t !== "get_today" && t !== "link_group_chat"));

type Json = Record<string, unknown>;
type Attachment = { url?: unknown; mime_type?: unknown; size?: unknown };
type Call = { input: Json; context: Json; identity: Identity; now: number };

class BadInput extends Error {}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function str(input: Json, key: string, max = 200, required = true): string | undefined {
  const value = input[key];
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadInput(key + " is required");
    return undefined;
  }
  if (typeof value !== "string" || value.length > max) throw new BadInput(key + " must be a string");
  return value;
}

function num(input: Json, key: string, required = true): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    if (required) throw new BadInput(key + " is required");
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BadInput(key + " must be a number");
  return value;
}

function names(input: Json): string[] {
  const value = input.names;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((n) => typeof n !== "string" || n.length > 60)) throw new BadInput("names must be a list of names");
  return value as string[];
}

function attachmentOf(context: Json, id: string): Attachment | null {
  const attachments = context.attachments;
  if (!attachments || typeof attachments !== "object") return null;
  const entry = (attachments as Record<string, unknown>)[id];
  return entry && typeof entry === "object" ? (entry as Attachment) : null;
}

async function fetchAttachment(context: Json, id: string): Promise<{ blob: Blob; mime: string } | null> {
  const entry = attachmentOf(context, id);
  if (!entry || typeof entry.url !== "string" || !entry.url.startsWith("https://")) return null;
  const res = await fetch(entry.url);
  if (!res.ok) return null;
  const blob = await res.blob();
  const mime = typeof entry.mime_type === "string" ? entry.mime_type : blob.type;
  return { blob, mime };
}

function phoneOf(call: Call): string {
  if (call.identity.kind !== "person") throw new BadInput("person required");
  return call.identity.phone;
}

async function locationFrom(call: Call): Promise<{ lat: number; lng: number } | undefined | "unreadable"> {
  const lat = num(call.input, "lat", false);
  const lng = num(call.input, "lng", false);
  if (lat !== undefined && lng !== undefined) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadInput("lat/lng out of range");
    return { lat, lng };
  }
  const attachmentId = str(call.input, "attachment_id", 200, false);
  if (!attachmentId) return undefined;
  const file = await fetchAttachment(call.context, attachmentId);
  if (!file || file.blob.size > 256 * 1024) return "unreadable";
  return parseSharedLocation(await file.blob.text()) ?? "unreadable";
}

async function run(ctx: ActionCtx, tool: ToolName, call: Call): Promise<unknown> {
  const { input, now } = call;
  switch (tool) {
    case "get_member":
      return await ctx.runQuery(internal.keiki.tools.getMember, { phone: phoneOf(call) });
    case "join_crew":
      return await ctx.runMutation(internal.keiki.tools.joinCrew, {
        phone: phoneOf(call),
        code: str(input, "invite_code", 64)!,
        name: str(input, "first_name", 40)!,
        now,
      });
    case "get_today":
      return await ctx.runQuery(
        internal.keiki.tools.getToday,
        call.identity.kind === "group" ? { chatId: call.identity.chatId, now } : { phone: phoneOf(call), now },
      );
    case "tap_down":
      return await ctx.runMutation(internal.keiki.tools.tap, { phone: phoneOf(call), kind: "down", onlyWith: [], now });
    case "tap_only_if": {
      const onlyWith = names(input);
      const after = str(input, "after", 20, false);
      if (onlyWith.length === 0 && !after) throw new BadInput("names or after is required");
      return await ctx.runMutation(internal.keiki.tools.tap, { phone: phoneOf(call), kind: "down", onlyWith, after, now });
    }
    case "tap_pass":
      return await ctx.runMutation(internal.keiki.tools.tap, { phone: phoneOf(call), kind: "pass", onlyWith: [], now });
    case "get_reveal":
      return await ctx.runQuery(internal.keiki.tools.getReveal, { phone: phoneOf(call), now });
    case "on_my_way":
      return await ctx.runMutation(internal.keiki.tools.onMyWay, { phone: phoneOf(call), minutes: num(input, "minutes")!, now });
    case "check_in": {
      const coords = await locationFrom(call);
      if (coords === "unreadable") return { ok: false, error: "location_unreadable", say: "Couldn't read that location. Ask them to say when they're there." };
      return await ctx.runMutation(internal.keiki.tools.checkIn, { phone: phoneOf(call), coords, now });
    }
    case "submit_snap": {
      const attachmentId = str(input, "attachment_id", 200)!;
      const target = await ctx.runQuery(internal.keiki.tools.snapTarget, { phone: phoneOf(call), now });
      if (!target.ok) return target.body;
      const file = await fetchAttachment(call.context, attachmentId);
      if (!file) return { ok: false, error: "photo_unreadable", say: "That photo didn't come through. Ask them to send it again." };
      if (!file.mime.startsWith("image/") || file.blob.size > 15 * 1024 * 1024) return { ok: false, error: "not_a_photo", say: "Ask for one photo." };
      const storageId = await ctx.storage.store(file.blob);
      try {
        return await ctx.runMutation(internal.keiki.tools.submitSnap, { userId: target.userId, frolicId: target.frolicId, storageId, now });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
    }
    case "pay_deposit": {
      const target = await ctx.runQuery(internal.keiki.tools.depositTarget, { phone: phoneOf(call), now });
      if (!target.ok) return target.body;
      const amount = "$" + (target.amountCents / 100).toFixed(target.amountCents % 100 ? 2 : 0);
      if (call.context.preflight === true) return { ok: true, amount, preflight: true };
      const link = await ctx.runAction(checkoutLinkFor, { userId: target.userId, frolicId: target.frolicId });
      if (!link) return { ok: false, error: "no_link", say: "The deposit link didn't go through. Offer to try again." };
      return { ok: true, amount, url: link.url, approvedWithFaceId: !!call.context.approval, say: "Send the link once. It comes back when they arrive." };
    }
    case "remember":
      return await ctx.runMutation(internal.keiki.tools.remember, { phone: phoneOf(call), text: str(input, "text", 500)!, now });
    case "pause": {
      const paused = input.paused === undefined ? true : input.paused;
      if (typeof paused !== "boolean") throw new BadInput("paused must be true or false");
      return await ctx.runMutation(internal.keiki.tools.pause, { phone: phoneOf(call), paused });
    }
    case "link_group_chat":
      if (call.identity.kind !== "group") return { ok: false, error: "group_only", say: "Add Frolic to the crew's group chat and ask there." };
      return await ctx.runMutation(internal.keiki.tools.linkGroupChat, { chatId: call.identity.chatId, code: str(input, "invite_code", 64)!, now });
  }
}

export function toolHandler(tool: ToolName) {
  return httpAction(async (ctx, req) => {
    const now = Date.now();
    const raw = await req.text();
    const auth = await authenticate(req.headers, raw, keikiEnv(), now);
    if (!auth.ok) return json(auth.reason === "not_configured" ? 503 : 401, { ok: false, error: auth.reason });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }
    if (!body || typeof body !== "object") return json(400, { ok: false, error: "invalid_body" });
    const input = ((body as Json).input ?? {}) as Json;
    const context = ((body as Json).context ?? {}) as Json;
    if (typeof input !== "object" || typeof context !== "object") return json(400, { ok: false, error: "invalid_body" });
    const identity = identify(context.phone);
    if (identity.kind === "unknown") return json(400, { ok: false, error: "unknown_sender" });
    if (identity.kind === "group" && DM_ONLY.has(tool)) {
      return json(200, { ok: false, error: "dm_only", say: "Answers in the group chat aren't secret. Ask them to text you directly." });
    }
    if (WRITES.has(tool) && (context.internal === true || req.headers.get("x-orchid-internal") === "true")) {
      return json(200, { ok: false, error: "steered_turn", say: "A steered turn can't act for this person." });
    }
    const traceId = req.headers.get("x-orchid-trace-id");
    const replayable = WRITES.has(tool) && traceId && context.preflight !== true;
    const requestKey = replayable
      ? await sha256Hex([tool, traceId, JSON.stringify(context.phone), JSON.stringify(input), JSON.stringify(context.approval ?? null)].join("|"))
      : null;
    if (requestKey) {
      const seen = await ctx.runQuery(internal.keiki.tools.findRequest, { requestKey });
      if (seen) return new Response(seen.response, { status: seen.status, headers: { "Content-Type": "application/json", "Keiki-Replayed": "true" } });
    }
    let status = 200;
    let result: unknown;
    try {
      result = await run(ctx, tool, { input, context, identity, now });
    } catch (error) {
      if (error instanceof BadInput) return json(400, { ok: false, error: "invalid_input", detail: error.message });
      console.error("keiki tool failed", tool, error instanceof Error ? error.message : "unknown");
      return json(500, { ok: false, error: "failed", say: "It didn't go through. Offer to try again." });
    }
    const response = JSON.stringify(result);
    if (requestKey) await ctx.runMutation(internal.keiki.tools.saveRequest, { requestKey, tool, status, response, now });
    return new Response(response, { status, headers: { "Content-Type": "application/json" } });
  });
}

export function registerKeikiRoutes(http: HttpRouter): void {
  for (const tool of TOOL_NAMES) {
    http.route({ path: "/keiki/tools/" + tool, method: "POST", handler: toolHandler(tool) });
  }
}
