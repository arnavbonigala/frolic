import { vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { makeT, token, type T } from "./setup.helpers";

export type FreeCrew = { t: T; groupId: Id<"groups">; inviteCode: string; ids: Record<string, Id<"users">> };

export async function freeCrew(names: string[], phones = false): Promise<FreeCrew> {
  const t = makeT();
  await t.mutation(internal.places.seed.seedPlaces, {});
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
  if (phones) {
    await t.run(async (ctx) => {
      let n = 0;
      for (const name of names) {
        n += 1;
        await ctx.db.insert("keikiLinks", { phone: "+1510555000" + n, userId: ids[name], paused: false, linkedAt: Date.now() });
      }
    });
  }
  return { t, groupId: created.groupId, inviteCode: created.inviteCode, ids };
}

export async function imFree(c: FreeCrew, name: string, forMinutes = 120) {
  return await c.t.mutation(api.frolics.imFree, { deviceToken: token(name), groupId: c.groupId, forMinutes });
}

export async function settle(t: T, rounds = 40) {
  for (let i = 0; i < rounds; i++) {
    vi.advanceTimersByTime(100);
    await t.finishInProgressScheduledFunctions();
  }
}

export async function later(t: T, ms: number) {
  vi.advanceTimersByTime(ms);
  await t.finishInProgressScheduledFunctions();
  await settle(t, 5);
}
