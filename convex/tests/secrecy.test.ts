/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { NOON, flipDue, makeT, setupCrew, tap, token, type Crew, type T } from "./setup.helpers";

const DAY = "2026-11-15";
const NAMES = ["Maya", "Dev", "Jordan", "Priya"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
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
