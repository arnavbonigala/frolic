/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import workflow from "@convex-dev/workflow/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

export const modules = import.meta.glob("../**/*.ts");

export const NOON = Date.UTC(2026, 10, 15, 20, 0, 0);
export const HOUR = 60 * 60 * 1000;

export function makeT() {
  const t = convexTest(schema, modules);
  presence.register(t);
  rateLimiter.register(t);
  workflow.register(t);
  return t;
}

export type T = ReturnType<typeof makeT>;

export const token = (name: string) => `device-${name.toLowerCase()}-0123456789abcdefghijklmnop`;

export type Crew = {
  groupId: Id<"groups">;
  frolicId: Id<"frolics">;
  ids: Record<string, Id<"users">>;
  inviteCode: string;
};

export async function setupCrew(
  t: T,
  names: string[],
  opts: { capacity?: number; deadlineIn?: number; window?: { start: number; end: number } } = {},
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
  const frolicId = await t.mutation(internal.frolics.open, {
    groupId: created.groupId,
    day: "2026-11-15",
    kind: "daily",
    window: opts.window ?? { start: now + HOUR, end: now + 6 * HOUR },
    durationMinutes: 60,
    deadline: now + (opts.deadlineIn ?? 4 * HOUR),
    capacity: opts.capacity,
  });
  return { groupId: created.groupId, frolicId, ids, inviteCode: created.inviteCode };
}

export async function tap(
  t: T,
  crew: Crew,
  name: string,
  extra: { onlyIf?: string[]; window?: { start: number; end: number }; kind?: "down" | "notToday" } = {},
) {
  return await t.mutation(api.taps.tap, {
    deviceToken: token(name),
    frolicId: crew.frolicId,
    kind: extra.kind ?? "down",
    onlyIf: extra.onlyIf?.map((n) => crew.ids[n]),
    window: extra.window,
  });
}

export async function today(t: T, crew: Crew, name: string) {
  return await t.query(api.frolics.today, { deviceToken: token(name), groupId: crew.groupId });
}

export async function flipDue(t: T, ms = 2500) {
  const { vi } = await import("vitest");
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
}
