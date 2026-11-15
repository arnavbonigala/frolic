export const MAX_SKEW_MS = 5 * 60 * 1000;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export type AuthResult =
  | { ok: true; signed: boolean }
  | { ok: false; reason: "not_configured" | "unauthorized" | "stale" };

export async function authenticate(
  headers: Headers,
  rawBody: string,
  env: { apiKey?: string; signingSecret?: string },
  now: number,
): Promise<AuthResult> {
  if (!env.apiKey && !env.signingSecret) return { ok: false, reason: "not_configured" };
  const timestamp = headers.get("x-keiki-timestamp");
  const signature = headers.get("x-keiki-signature");
  if (env.signingSecret && timestamp && signature) {
    if (!/^\d+$/.test(timestamp)) return { ok: false, reason: "unauthorized" };
    const raw = Number(timestamp);
    const instant = raw < 1_000_000_000_000 ? raw * 1000 : raw;
    if (Math.abs(now - instant) > MAX_SKEW_MS) return { ok: false, reason: "stale" };
    const expected = "sha256=" + (await hmacHex(env.signingSecret, timestamp + "." + rawBody));
    return constantTimeEqual(signature, expected) ? { ok: true, signed: true } : { ok: false, reason: "unauthorized" };
  }
  const key = headers.get("x-orchid-api-key");
  if (env.apiKey && key && constantTimeEqual(key, env.apiKey)) return { ok: true, signed: false };
  return { ok: false, reason: "unauthorized" };
}

export type Identity =
  | { kind: "person"; phone: string }
  | { kind: "group"; chatId: string }
  | { kind: "unknown" };

export function identify(contextPhone: unknown): Identity {
  if (typeof contextPhone !== "string" || contextPhone.trim() === "") return { kind: "unknown" };
  const value = contextPhone.trim();
  if (value.startsWith("imsg:chat:")) return { kind: "group", chatId: value };
  const bare = value.replace(/^(wa|sms|imsg|tel):/, "");
  const digits = bare.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return { kind: "person", phone: digits };
  if (/^\d{10}$/.test(digits)) return { kind: "person", phone: "+1" + digits };
  if (/^1\d{10}$/.test(digits)) return { kind: "person", phone: "+" + digits };
  return { kind: "unknown" };
}
