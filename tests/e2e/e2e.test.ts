/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HERO_KEYS } from "../../convex/places/data";
import { NOON, flipDue, makeT, type T } from "../backend/setup.helpers";

const SECRET = "e2e-secret-for-tests";
const RUN = "run-1";
const HOUR = 60 * 60 * 1000;

type SeededUser = { userId: Id<"users">; deviceToken: string; link: string };
type SeedBody = {
  run: string;
  groupId: Id<"groups">;
  inviteCode: string;
  frolicId: Id<"frolics">;
  deadline: number;
  users: { maya: SeededUser; dev: SeededUser; jordan: SeededUser; priya: SeededUser };
  reveal_at: null;
};
type RevealRow = {
  frolicId: Id<"frolics">;
  userId: Id<"users">;
  name: string;
  reveal_at: number;
  bloom_at: number;
  delivered_at: number;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("E2E_SECRET", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function post(t: T, path: string, body: unknown, secret: string = SECRET) {
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-e2e-secret": secret },
    body: JSON.stringify(body),
  });
}

async function seed(t: T, run = RUN, scenario?: "three-phone" | "demo"): Promise<SeedBody> {
  const response = await post(t, "/e2e/seed", scenario ? { run, scenario } : { run });
  expect(response.status).toBe(200);
  return (await response.json()) as SeedBody;
}

async function reveals(t: T, run = RUN): Promise<RevealRow[]> {
  const response = await t.fetch(`/e2e/reveals?run=${run}`, {
    method: "GET",
    headers: { "x-e2e-secret": SECRET },
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { reveals: RevealRow[] };
  return body.reveals;
}

async function counts(t: T) {
  return await t.run(async (ctx) => ({
    groups: (await ctx.db.query("groups").take(50)).length,
    users: (await ctx.db.query("users").take(50)).length,
    memberships: (await ctx.db.query("memberships").take(50)).length,
    invites: (await ctx.db.query("invites").take(50)).length,
    availability: (await ctx.db.query("availability").take(50)).length,
    plans: (await ctx.db.query("plans").take(50)).length,
    frolics: (await ctx.db.query("frolics").take(50)).length,
    taps: (await ctx.db.query("taps").take(50)).length,
    attendees: (await ctx.db.query("attendees").take(50)).length,
    revealLog: (await ctx.db.query("revealLog").take(50)).length,
  }));
}

describe("e2e guard", () => {
  test("404 when E2E_SECRET is not set", async () => {
    vi.stubEnv("E2E_SECRET", undefined);
    const t = makeT();
    const response = await post(t, "/e2e/reset", { run: RUN });
    expect(response.status).toBe(404);
    const listed = await t.fetch(`/e2e/reveals?run=${RUN}`);
    expect(listed.status).toBe(404);
  });

  test("401 when the secret header is wrong or missing", async () => {
    const t = makeT();
    const wrong = await post(t, "/e2e/seed", { run: RUN }, "not-the-secret");
    expect(wrong.status).toBe(401);
    const missing = await t.fetch("/e2e/advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run: RUN }),
    });
    expect(missing.status).toBe(401);
  });

  test("400 on a bad body or a bad run id", async () => {
    const t = makeT();
    expect((await post(t, "/e2e/seed", {})).status).toBe(400);
    expect((await post(t, "/e2e/seed", { run: "two words" })).status).toBe(400);
    expect((await post(t, "/e2e/seed", { run: "x".repeat(65) })).status).toBe(400);
    expect((await post(t, "/e2e/seed", { run: 7 })).status).toBe(400);
    expect((await post(t, "/e2e/seed", { run: RUN, scenario: "party" })).status).toBe(400);
    expect((await post(t, "/e2e/reset", { run: [] })).status).toBe(400);
    const badJson = await t.fetch("/e2e/reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-e2e-secret": SECRET },
      body: "{",
    });
    expect(badJson.status).toBe(400);
    const badQuery = await t.fetch("/e2e/reveals?run=", {
      method: "GET",
      headers: { "x-e2e-secret": SECRET },
    });
    expect(badQuery.status).toBe(400);
  });
});

describe("seed and reset", () => {
  test("seed builds the crew and reset clears every table it wrote", async () => {
    const t = makeT();
    const body = await seed(t);
    expect(body.run).toBe(RUN);
    expect(body.reveal_at).toBeNull();
    expect(body.deadline).toBe(NOON + 3 * HOUR);
    expect(body.users.maya.deviceToken).toHaveLength(64);
    expect(body.users.maya.link).toBe(
      `frolic://signin?deviceToken=${body.users.maya.deviceToken}&groupId=${body.groupId}`,
    );

    const group = await t.run(async (ctx) => await ctx.db.get("groups", body.groupId));
    expect(group?.name).toBe("Sunset Crew");
    expect(group?.timezone).toBe("America/Los_Angeles");
    expect(group?.e2eRun).toBe(RUN);

    const seeded = await counts(t);
    expect(seeded).toEqual({
      groups: 1,
      users: 4,
      memberships: 4,
      invites: 1,
      availability: 1,
      plans: 1,
      frolics: 1,
      taps: 0,
      attendees: 0,
      revealLog: 0,
    });

    const colors = await t.run(
      async (ctx) => (await ctx.db.query("memberships").take(10)).map((m) => m.color),
    );
    expect(new Set(colors).size).toBe(4);

    const me = await t.query(api.users.me, { deviceToken: body.users.priya.deviceToken });
    expect(me?.name).toBe("Priya");

    const priyaWindow = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("availability")
        .withIndex("by_groupId_and_day", (q) => q.eq("groupId", body.groupId))
        .take(5);
      return rows[0]?.window ?? null;
    });
    expect(priyaWindow).toEqual({
      start: Date.UTC(2026, 10, 16, 1, 0),
      end: Date.UTC(2026, 10, 16, 4, 0),
    });

    const reset = await post(t, "/e2e/reset", { run: RUN });
    expect(reset.status).toBe(200);
    const resetBody = (await reset.json()) as { run: string; cleared: number };
    expect(resetBody.run).toBe(RUN);
    expect(resetBody.cleared).toBeGreaterThanOrEqual(12);
    expect(await counts(t)).toEqual({
      groups: 0,
      users: 0,
      memberships: 0,
      invites: 0,
      availability: 0,
      plans: 0,
      frolics: 0,
      taps: 0,
      attendees: 0,
      revealLog: 0,
    });

    const again = await seed(t);
    expect(again.groupId).not.toBe(body.groupId);
    expect((await post(t, "/e2e/reset", { run: "another-run" })).status).toBe(200);
  });
});

describe("demo scenario", () => {
  test("advance opens the kayak frolic that frolics.today returns for Maya", async () => {
    const t = makeT();
    const body = await seed(t, RUN, "demo");
    const first = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect(first.frolic?.plan?.title).toBe("Sunset at Indian Rock");
    expect(first.frolic?.day).toBe("2026-11-15");
    expect(first.frolic?.plan?.startsAt).toBe(Date.UTC(2026, 10, 16, 0, 30));
    expect(first.frolic?.plan?.heroKey).toBe("plan-sunsets");
    expect(first.phase).toBe("open");

    const advanced = await post(t, "/e2e/advance", { run: RUN });
    expect(advanced.status).toBe(200);
    const { frolicId } = (await advanced.json()) as { run: string; frolicId: Id<"frolics"> };
    expect(frolicId).not.toBe(body.frolicId);

    const paid = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect(HERO_KEYS).toContain(paid.frolic!.plan!.heroKey);
    expect(paid.frolic!.plan!.cost).toBe(8);
    expect(paid.frolic!.plan!.costLabel).toBe("$8");
    expect(paid.frolic!.plan!.payUpFront).toBe(true);

    await t.mutation(api.taps.tap, {
      deviceToken: body.users.dev.deviceToken,
      frolicId,
      kind: "down",
    });
    await t.mutation(api.taps.tap, {
      deviceToken: body.users.priya.deviceToken,
      frolicId,
      kind: "down",
    });
    await flipDue(t);
    const kayak = (await t.query(api.frolics.today, {
      deviceToken: body.users.jordan.deviceToken,
      groupId: body.groupId,
      frolicId,
    })) as { phase: string; reveal: { going: { name: string }[] } | null };
    expect(kayak.phase).toBe("on");
    expect(kayak.reveal!.going.map((p) => p.name).sort()).toEqual(["Dev", "Priya"]);
    const maya = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect(maya.frolic!.frolicId).toBe(frolicId);
    expect(maya.frolic!.plan!.title).toBe("Kayaks at the Marina");
    expect(maya.myTap).toBeNull();

    const second = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect(second.frolic!.frolicId).toBe(frolicId);
    expect(second.frolic!.plan?.title).toBe("Kayaks at the Marina");
    expect(second.frolic!.durationMinutes).toBe(90);
    expect(second.frolic!.day).toBe("2026-11-15");
    expect(second.frolic!.day).toBe(first.frolic!.day);

    const third = await post(t, "/e2e/advance", { run: RUN });
    expect(((await third.json()) as { frolicId: string }).frolicId).toBe(frolicId);
  });

  test("advance is 404 for a run with no demo seed", async () => {
    const t = makeT();
    await seed(t);
    const response = await post(t, "/e2e/advance", { run: RUN });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    const unknown = await post(t, "/e2e/advance", { run: "never-seeded" });
    expect(unknown.status).toBe(404);
  });
});

describe("reveal log", () => {
  test("taps from two seeded tokens match and flip, and the log shows one shared reveal instant", async () => {
    const t = makeT();
    const body = await seed(t);
    expect(await reveals(t)).toEqual([]);

    await t.mutation(api.taps.tap, {
      deviceToken: body.users.maya.deviceToken,
      frolicId: body.frolicId,
      kind: "down",
      onlyIf: [body.users.dev.userId],
    });
    await t.mutation(api.taps.tap, {
      deviceToken: body.users.dev.deviceToken,
      frolicId: body.frolicId,
      kind: "down",
    });

    expect(await reveals(t)).toEqual([]);

    const before = await t.query(api.frolics.today, {
      deviceToken: body.users.jordan.deviceToken,
      groupId: body.groupId,
    });
    expect(before.phase).toBe("open");
    expect(before.reveal).toBeNull();

    await flipDue(t);

    const log = await reveals(t);
    expect(log).toHaveLength(2);
    expect(new Set(log.map((row) => row.reveal_at)).size).toBe(1);
    expect(log.map((row) => row.name).sort()).toEqual(["Dev", "Maya"]);
    for (const row of log) {
      expect(row.frolicId).toBe(body.frolicId);
      expect(row.delivered_at).toBeGreaterThanOrEqual(row.reveal_at);
      expect(row.bloom_at).toBe(row.reveal_at + 800);
    }

    const maya = await t.query(api.frolics.today, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
    });
    expect(maya.phase).toBe("on");
    expect(maya.reveal?.revealAt).toBe(log[0].reveal_at);
    expect(maya.reveal?.me.going).toBe(true);
    expect(maya.reveal?.going.map((person) => person.name).sort()).toEqual(["Dev", "Maya"]);

    const jordan = await t.query(api.frolics.today, {
      deviceToken: body.users.jordan.deviceToken,
      groupId: body.groupId,
    });
    expect(jordan.reveal?.me.going).toBe(false);

    expect(await reveals(t, "another-run")).toEqual([]);
  });
});describe("demo portraits", () => {
  beforeEach(() => vi.stubEnv("E2E_SECRET", SECRET));
  afterEach(() => vi.unstubAllEnvs());

  test("every seeded friend has a portrait and a flower color", async () => {
    vi.stubEnv("CONVEX_SITE_URL", "https://frolic.convex.site");
    const t = makeT();
    const body = await seed(t, "demo-portraits", "demo");
    const expected: Record<string, [string, string]> = {
      Maya: ["maya", "pink"],
      Dev: ["dev", "cobalt"],
      Jordan: ["jordan", "moss"],
      Priya: ["priya", "marigold"],
    };
    const crew = (await t.query(api.crew.crew, {
      deviceToken: body.users.maya.deviceToken,
      groupId: body.groupId,
      day: new Date().toISOString().slice(0, 10),
    })) as { members: { name: string; color: string; photoUrl: string | null }[] };
    expect(crew.members).toHaveLength(4);
    for (const member of crew.members) {
      const [key, color] = expected[member.name];
      expect(member.photoUrl).toBe(`https://frolic.convex.site/p/avatar/${key}.jpg`);
      expect(member.color).toBe(color);
    }
    const me = (await t.query(api.users.me, { deviceToken: body.users.jordan.deviceToken })) as { photoUrl: string | null };
    expect(me.photoUrl).toBe("https://frolic.convex.site/p/avatar/jordan.jpg");
  });
});


