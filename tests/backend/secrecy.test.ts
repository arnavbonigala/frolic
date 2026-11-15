/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "./setup.helpers";
import { freeCrew, imFree, settle, type FreeCrew } from "./imFree.helpers";

const DAY = "2026-11-15";
const NAMES = ["Maya", "Dev", "Jordan", "Priya"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("CONVEX_SITE_URL", "https://frolic.convex.site");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function everything(t: T, crew: Crew, name: string) {
  return {
    today: await t.query(api.frolics.today, { deviceToken: token(name), groupId: crew.groupId }),
    crew: await t.query(api.crew.crew, { deviceToken: token(name), groupId: crew.groupId, day: DAY }),
    me: await t.query(api.users.me, { deviceToken: token(name) }),
    invite: await t.query(api.users.invitePreview, { inviteCode: crew.inviteCode }),
    limits: await t.query(api.limits.mine, { deviceToken: token(name) }),
    etas: await t.query(api.etas.forFrolic, { deviceToken: token(name), frolicId: crew.frolicId }),
  };
}

type Snapshot = Awaited<ReturnType<typeof everything>>;

function walk(value: unknown, visit: (key: string, node: unknown) => void, key = ""): void {
  visit(key, value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, "");
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, inner] of Object.entries(value)) walk(inner, visit, k);
  }
}

function onlyIfIds(value: unknown): string[] {
  const found: string[] = [];
  walk(value, (key, node) => {
    if (key !== "onlyIf" || !Array.isArray(node)) return;
    for (const item of node) {
      if (typeof item === "string") found.push(item);
      else if (item && typeof item === "object" && typeof (item as { userId?: unknown }).userId === "string") {
        found.push((item as { userId: string }).userId);
      }
    }
  });
  return found;
}

function keys(value: unknown): string[] {
  const found: string[] = [];
  walk(value, (key) => {
    if (key) found.push(key);
  });
  return found;
}

describe("secrecy", () => {
  test("no public function shows another person's tap or only if, before or after the reveal", async () => {
    const t = makeT();
    const crew = await setupCrew(t, NAMES);
    const own: Record<string, Id<"users">[]> = {
      Maya: [crew.ids.Dev],
      Dev: [],
      Jordan: [crew.ids.Priya],
      Priya: [],
    };

    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });
    await tap(t, crew, "Jordan", { onlyIf: ["Priya"] });
    const quiet = { Jordan: await everything(t, crew, "Jordan"), Priya: await everything(t, crew, "Priya") };

    await tap(t, crew, "Dev");

    const beforeFlip: Record<string, Snapshot> = {};
    for (const name of NAMES) beforeFlip[name] = await everything(t, crew, name);

    expect(beforeFlip.Jordan).toEqual(quiet.Jordan);
    expect(beforeFlip.Priya).toEqual(quiet.Priya);

    for (const name of NAMES) {
      expect(beforeFlip[name].crew.members).toHaveLength(4);
      expect(beforeFlip[name].me?.name).toBe(name);
      expect(beforeFlip[name].invite?.memberCount).toBe(4);
      expect([...new Set(onlyIfIds(beforeFlip[name]))]).toEqual(own[name]);
      expect(keys(beforeFlip[name]).filter((k) => /^taps?$/i.test(k))).toEqual([]);
      expect(beforeFlip[name].today.phase).toBe(name === "Priya" ? "open" : "waiting");
      expect(beforeFlip[name].today.reveal).toBeNull();
      expect(beforeFlip[name].etas).toEqual([]);
    }

    expect(onlyIfIds(beforeFlip.Maya)).toEqual([crew.ids.Dev]);
    expect(onlyIfIds(beforeFlip.Jordan)).toEqual([crew.ids.Priya]);
    expect(onlyIfIds(beforeFlip.Dev)).toEqual([]);
    expect(onlyIfIds(beforeFlip.Priya)).toEqual([]);
    expect(beforeFlip.Priya.today.myTap).toBeNull();
    expect(beforeFlip.Maya.today.myTap?.onlyIf.map((p) => p.userId)).toEqual([crew.ids.Dev]);
    expect(beforeFlip.Maya.today.myTap?.onlyIf.map((p) => p.name)).toEqual(["Dev"]);
    expect(beforeFlip.Dev.today.myTap?.onlyIf).toEqual([]);
    expect(beforeFlip.Jordan.today.myTap?.onlyIf.map((p) => p.userId)).toEqual([crew.ids.Priya]);
    expect(beforeFlip.Jordan.today.myTap?.onlyIf.map((p) => p.name)).toEqual(["Priya"]);

    await flipDue(t);

    const afterFlip: Record<string, Snapshot> = {};
    for (const name of NAMES) afterFlip[name] = await everything(t, crew, name);

    for (const name of NAMES) {
      expect([...new Set(onlyIfIds(afterFlip[name]))]).toEqual(own[name]);
      expect(afterFlip[name].today.phase).toBe("on");
      const going = afterFlip[name].today.reveal?.going.map((p) => p.name).sort();
      expect(going).toEqual(["Dev", "Maya"]);
      for (const person of afterFlip[name].today.reveal?.going ?? []) {
        expect(person.userId).not.toBe(crew.ids.Jordan);
      }
    }

    expect(afterFlip.Priya.today.myTap).toBeNull();
    expect(onlyIfIds(afterFlip.Maya)).toEqual([crew.ids.Dev]);
    expect(onlyIfIds(afterFlip.Jordan)).toEqual([crew.ids.Priya]);
    expect(onlyIfIds(afterFlip.Dev)).toEqual([]);
    expect(onlyIfIds(afterFlip.Priya)).toEqual([]);
    expect(afterFlip.Dev.today.myTap?.onlyIf).toEqual([]);
    expect(afterFlip.Maya.today.myTap?.onlyIf.map((p) => p.userId)).toEqual([crew.ids.Dev]);
    expect(afterFlip.Jordan.today.myTap?.onlyIf.map((p) => p.userId)).toEqual([crew.ids.Priya]);
    expect(afterFlip.Jordan.today.reveal?.me).toMatchObject({ going: false, role: null });
    expect(afterFlip.Jordan.today.reveal?.me.hopInWaiting).toBe(false);
    expect(afterFlip.Priya.today.reveal?.me.going).toBe(false);

    const rows = await t.run(async (ctx) => ({
      attendees: await ctx.db.query("attendees").collect(),
      reveals: await ctx.db.query("reveals").collect(),
      log: await ctx.db.query("revealLog").collect(),
    }));
    expect(rows.attendees.map((a) => a.userId).sort()).toEqual([crew.ids.Dev, crew.ids.Maya].sort());
    expect(rows.attendees.map((a) => a.userId)).not.toContain(crew.ids.Jordan);
    expect(rows.reveals).toHaveLength(0);
    expect(rows.log.map((l) => l.userId).sort()).toEqual([crew.ids.Dev, crew.ids.Maya].sort());
  });

  test("crew and invite views never carry anyone's limits or only if", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Priya"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 25, energy: "chill", maxMinutes: 90 });
    await tap(t, crew, "Maya", { onlyIf: ["Dev"] });

    const view = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: crew.groupId, day: DAY });
    const invite = await t.query(api.users.invitePreview, { inviteCode: crew.inviteCode });
    const me = await t.query(api.users.me, { deviceToken: token("Dev") });

    expect(onlyIfIds(view)).toEqual([]);
    expect(onlyIfIds(invite)).toEqual([]);
    expect(onlyIfIds(me)).toEqual([]);
    expect(keys(view).filter((k) => /tap|onlyIf|limit|budget/i.test(k))).toEqual([]);
    expect(keys(invite).filter((k) => /tap|onlyIf|limit|budget/i.test(k))).toEqual([]);
    expect(keys(me).filter((k) => /tap|onlyIf|limit|budget/i.test(k))).toEqual([]);
    expect(view.members.map((m) => m.name).sort()).toEqual(["Dev", "Maya", "Priya"]);
  });

  test("limits only ever come back to their owner", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya", "Dev", "Priya"]);
    await t.mutation(api.limits.set, { deviceToken: token("Maya"), budgetCap: 25, energy: "chill", maxMinutes: 45 });
    await t.mutation(api.limits.set, { deviceToken: token("Dev"), budgetCap: 90, homeBy: 22 * 60 });

    const maya = await t.query(api.limits.mine, { deviceToken: token("Maya") });
    const dev = await t.query(api.limits.mine, { deviceToken: token("Dev") });
    const priya = await t.query(api.limits.mine, { deviceToken: token("Priya") });

    expect(maya).toEqual({ budgetCap: 25, energy: "chill", maxMinutes: 45, homeBy: null });
    expect(dev).toEqual({ budgetCap: 90, energy: null, maxMinutes: null, homeBy: 22 * 60 });
    expect(priya).toEqual({ budgetCap: null, energy: null, maxMinutes: null, homeBy: null });
    expect(JSON.stringify(maya)).not.toContain(JSON.stringify(22 * 60));
    expect(JSON.stringify(priya)).not.toContain("25");
    expect(JSON.stringify(dev)).not.toContain("45");

    const rows = await t.run(async (ctx) => await ctx.db.query("limits").collect());
    expect(rows).toHaveLength(2);
  });
});

describe("secrecy of who said I'm free", () => {
  const CREW = ["Maya", "Dev", "Jordan", "Priya"];

  async function seen(c: FreeCrew, name: string, frolicId: Id<"frolics">, code: string) {
    const today = await c.t.query(api.frolics.today, { deviceToken: token(name), groupId: c.groupId });
    const going = [...(today.reveal?.going ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return {
      today: today.reveal ? { ...today, reveal: { ...today.reveal, going } } : today,
      byId: await c.t.query(api.frolics.today, { deviceToken: token(name), groupId: c.groupId, frolicId }),
      crew: await c.t.query(api.crew.crew, { deviceToken: token(name), groupId: c.groupId, day: DAY }),
      me: await c.t.query(api.users.me, { deviceToken: token(name) }),
      invite: await c.t.query(api.users.invitePreview, { inviteCode: c.inviteCode }),
      etas: await c.t.query(api.etas.forFrolic, { deviceToken: token(name), frolicId }),
      web: await c.t.query(api.web.share.watch, { code, deviceToken: token(name) }),
      garden: await c.t.query(api.garden.overview, { deviceToken: token(name), groupId: c.groupId }),
      texts: await c.t.run(async (ctx) => {
        const rows = await ctx.db.query("keikiOutbox").withIndex("by_frolicId", (q) => q.eq("frolicId", frolicId)).collect();
        return rows
          .filter((r) => r.userId === c.ids[name] || !r.userId)
          .map((r) => ({ kind: r.kind, text: r.text }))
          .sort((a, b) => (a.kind + a.text).localeCompare(b.kind + b.text));
      }),
    };
  }

  async function run(starter: string, second: string) {
    vi.setSystemTime(NOON);
    const c = await freeCrew(CREW, true);
    const { frolicId } = await imFree(c, starter, 120);
    await settle(c.t);
    const { code } = await c.t.mutation(api.web.share.create, { frolicId, deviceToken: token("Priya") });
    const before: Record<string, Awaited<ReturnType<typeof seen>>> = {};
    for (const name of CREW) before[name] = await seen(c, name, frolicId, code);
    await c.t.mutation(api.taps.tap, { deviceToken: token(second), frolicId, kind: "down" });
    const pending: Record<string, Awaited<ReturnType<typeof seen>>> = {};
    for (const name of CREW) pending[name] = await seen(c, name, frolicId, code);
    await flipDue(c.t);
    await settle(c.t, 5);
    const after: Record<string, Awaited<ReturnType<typeof seen>>> = {};
    for (const name of CREW) after[name] = await seen(c, name, frolicId, code);
    const starterId = c.ids[starter];
    return { c, before, pending, after, starterId };
  }

  test("no public view, web page or text says who started it, before or after the reveal", async () => {
    const maya = await run("Maya", "Dev");
    const dev = await run("Dev", "Maya");

    for (const scenario of [maya, dev]) {
      for (const stage of [scenario.before, scenario.pending, scenario.after]) {
        for (const name of CREW) {
          expect(keys(stage[name]).filter((k) => /started|starter|origin.?user|host.?id/i.test(k))).toEqual([]);
          expect(JSON.stringify(stage[name])).not.toMatch(/startedBy/);
          for (const text of stage[name].texts) {
            if (text.kind === "drop") expect(text.text).not.toMatch(/Maya|Dev/);
            expect(text.text).not.toMatch(/[—!]/);
          }
        }
      }
    }

    for (const observer of ["Jordan", "Priya"]) {
      expect(maya.before[observer]).toEqual(dev.before[observer]);
      expect(maya.pending[observer]).toEqual(dev.pending[observer]);
      expect(maya.after[observer]).toEqual(dev.after[observer]);
      expect(maya.before[observer].today.phase).toBe("open");
      expect(maya.before[observer].today.frolic?.notice).toMatch(/^Someone in your crew is free\. /);
      expect(maya.after[observer].today.phase).toBe("on");
      expect(maya.before[observer].texts).toHaveLength(1);
    }

    const strip = (v: Awaited<ReturnType<typeof seen>>) => ({ ...v, me: null, texts: null, crew: null, today: { ...v.today, myTap: null, phase: null }, byId: { ...v.byId, myTap: null, phase: null }, web: { ...v.web, me: null, avatar: null, phase: null } });
    expect(strip(maya.pending.Maya)).toEqual(strip(dev.pending.Maya));
    expect(strip(maya.pending.Dev)).toEqual(strip(dev.pending.Dev));
    expect(maya.after.Maya.today).toEqual(dev.after.Maya.today);
    expect(maya.after.Dev.today).toEqual(dev.after.Dev.today);
    expect(maya.after.Maya.web).toEqual(dev.after.Maya.web);

    expect(maya.before.Maya.texts).toEqual([]);
    expect(dev.before.Dev.texts).toEqual([]);
  });
});
