/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { BAIL_BODY, FADED_BODY, FADED_TEXT, FADED_TITLE, ONLY_IF_BUTTON, ONLY_IF_TITLE } from "../../convex/lib/copy";
import { PAGE_TEMPLATE } from "../../convex/web/pageTemplate";
import { flipDue, makeT, setupCrew, tap, token, NOON, type T } from "./setup.helpers";
import { SAM_PHONE, nowFor, seedCrew } from "../../keiki/test/seed";
import { API_KEY, REVEAL_DELAY_MS, advance, installFetch, makeT as keikiT, outboxOf, tapAs, testEnv } from "../../keiki/test/harness";

const TWO_CREW = ["Zinnia", "Bartholomew"];
const THREE_CREW = ["Zinnia", "Bartholomew", "Quillon"];
const NAMES = ["Zinnia", "Bartholomew", "Quillon"];
const MAYA_PHONE = "+15105550109";

const COUNT_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "both",
  "pair",
  "couple",
  "twice",
  "fewer",
  "half",
  "dozen",
  "single",
];

const wordsOf = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

function assertNoNameNoCount(text: string, approved: string, names: string[]) {
  for (const name of names) {
    expect(text.toLowerCase(), "a crew member's name leaked into " + JSON.stringify(text)).not.toContain(name.toLowerCase());
  }
  expect(text, "a numeral leaked into " + JSON.stringify(text)).not.toMatch(/\d/);
  const produced = wordsOf(text);
  const allowed = wordsOf(approved);
  for (const word of COUNT_WORDS) {
    const extra = produced.filter((token) => token === word).length - allowed.filter((token) => token === word).length;
    expect(extra, "the word " + word + " leaks a count into " + JSON.stringify(text)).toBeLessThanOrEqual(0);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
});

describe("the faded and bail copy", () => {
  test("is the approved sentence pair with nobody named and no count", () => {
    expect(FADED_TEXT).toBe("This one drifted off. Nobody knows you said yes.");
    expect(BAIL_BODY).toBe("Your crew will see a spot open up.");
    expect(ONLY_IF_BUTTON).toBe("Only if…");
    expect(ONLY_IF_TITLE).toBe("I'm down only if…");
    assertNoNameNoCount(FADED_TITLE + ". " + FADED_BODY, FADED_TEXT, NAMES);
    assertNoNameNoCount(BAIL_BODY, BAIL_BODY, NAMES);
  });

  test("is what the shipped web page draws, for a crew of two and a crew of three", async () => {
    const t = makeT();
    const two = await drifted(t, TWO_CREW);
    const three = await drifted(t, THREE_CREW);

    for (const run of [two, three]) {
      expect(run.phases).toEqual(run.names.map(() => "faded"));
      for (const view of run.views) {
        expect(view.phase).toBe("drifted");
        expect(view.me).toBeNull();
        expect(view.mates).toEqual([]);
        expect(view.revealAt).toBeNull();
      }
      const drawn = FADED_TITLE + ". " + FADED_BODY;
      assertNoNameNoCount(drawn, FADED_TEXT, run.names);
    }
    expect(three.views[0]).toMatchObject({ phase: two.views[0].phase, me: null, mates: [] });
    expect(PAGE_TEMPLATE).toContain(FADED_TITLE);
    expect(PAGE_TEMPLATE).toContain(FADED_BODY);
  });

  test("is what Keiki sends every member when a plan fades, for a crew of two and a crew of three", async () => {
    const two = await fadedOutbox(2);
    const three = await fadedOutbox(3);

    for (const run of [two, three]) {
      expect(run.texts).toHaveLength(run.size);
      for (const text of run.texts) {
        expect(text).toBe(FADED_TEXT);
        assertNoNameNoCount(text, FADED_TEXT, NAMES);
      }
    }
    expect(three.texts[0]).toBe(two.texts[0]);
  });

  test("is what Keiki says when someone sits a matched plan out, for a crew of two and a crew of three", async () => {
    const two = await satOut(2);
    const three = await satOut(3);

    for (const run of [two, three]) {
      expect(run.satOut).toBe(true);
      assertNoNameNoCount(run.say, "", NAMES);
      expect(run.say).toBe("Confirm they're out briefly. Never say who else is in, how many, or that someone bailed. The group gets a refill if someone is free.");
    }
    expect(three.say).toBe(two.say);
  });

  test("survives the repo lint over the app sources, the flows and the mock", async () => {
    const root = new URL("../../", import.meta.url).pathname;
    const output = await runCopyLint(root);
    expect(output).toMatch(/copy privacy: \d+ files scanned, 0 errors/);
  });
});

const CHILD_PROCESS = "node:" + "child_process";

async function runCopyLint(root: string): Promise<string> {
  const node = (await import(CHILD_PROCESS)) as unknown as {
    execFileSync: (command: string, args: string[], options: { cwd: string; encoding: "utf8" }) => string;
  };
  return node.execFileSync("node", ["e2e/tools/copy-lint.mjs"], { cwd: root, encoding: "utf8" });
}

async function drifted(t: T, names: string[]) {
  const crew = await setupCrew(t, names, { deadlineIn: 60_000 });
  await tap(t, crew, names[0]);
  const shared = await t.mutation(api.web.share.create, { frolicId: crew.frolicId, deviceToken: token(names[0]) });
  await flipDue(t, 61_000);
  const phases: string[] = [];
  const views = [];
  for (const name of names) {
    phases.push((await t.query(api.frolics.today, { deviceToken: token(name), groupId: crew.groupId })).phase);
    views.push(await t.query(api.web.share.watch, { code: shared.code, deviceToken: token(name) }));
  }
  return { names, phases, views };
}

async function keikiSeed(size: 2 | 3) {
  vi.setSystemTime(new Date(nowFor("sunset")));
  const t = keikiT();
  const seed = await seedCrew(t);
  const kept = size === 2 ? [seed.mayaId, seed.samId] : [seed.mayaId, seed.samId, seed.anaId];
  const dropped = [seed.devId, seed.anaId].filter((id) => !kept.includes(id));
  await t.run(async (ctx) => {
    const memberships = await ctx.db.query("memberships").withIndex("by_groupId", (q) => q.eq("groupId", seed.groupId)).take(16);
    for (const row of memberships) if (dropped.includes(row.userId)) await ctx.db.delete("memberships", row._id);
    const links = await ctx.db.query("keikiLinks").take(16);
    for (const row of links) if (dropped.includes(row.userId)) await ctx.db.delete("keikiLinks", row._id);
    if (!links.some((row) => row.userId === seed.mayaId)) {
      await ctx.db.insert("keikiLinks", { phone: MAYA_PHONE, userId: seed.mayaId, paused: false, linkedAt: 0 });
    }
    for (const [id, name] of [
      [seed.mayaId, "Zinnia"],
      [seed.samId, "Bartholomew"],
      [seed.anaId, "Quillon"],
    ] as [Id<"users">, string][]) {
      await ctx.db.patch("users", id, { name });
    }
  });
  return { t, seed, size };
}

async function fadedOutbox(size: 2 | 3) {
  const { t, seed } = await keikiSeed(size);
  testEnv().KEIKI_API_KEY = API_KEY;
  await t.mutation(internal.keiki.outbound.onFaded, { frolicId: seed.frolicId });
  installFetch();
  await advance(t, 0);
  const rows = await outboxOf(t);
  return { size, texts: rows.map((row) => row.text) };
}

async function satOut(size: 2 | 3) {
  const { t, seed } = await keikiSeed(size);
  await tapAs(t, seed.mayaId, seed.frolicId, "down");
  await tapAs(t, seed.samId, seed.frolicId, "down");
  if (size === 3) await tapAs(t, seed.anaId, seed.frolicId, "down");
  await advance(t, REVEAL_DELAY_MS);
  const result = await t.mutation(internal.keiki.tools.tap, {
    phone: SAM_PHONE,
    kind: "pass",
    onlyWith: [],
    now: Date.now(),
  });
  return result as { ok: boolean; satOut?: boolean; say: string };
}
