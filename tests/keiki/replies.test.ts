/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prompt from "../../docs/keiki-system-prompt.md?raw";
import { ANA_PHONE, INVITE_CODE, SAM_PHONE, nowFor, seedCrew } from "../../keiki/test/seed";
import type { Seed, SeedOptions, T } from "../../keiki/test/seed";
import {
  API_KEY,
  REVEAL_DELAY_MS,
  advance,
  installFetch,
  makeT,
  patchFrolic,
  tapAs,
  tapsOf,
  testEnv,
  toolResult,
} from "../../keiki/test/harness";

const STRANGER_PHONE = "+15105550199";
const SECRET_LINE = "Nobody sees you're down unless they are too. That goes for you as well.";
const AMBIGUOUS = ["maybe", "idk", "lol", "??", "\u{1F642}", "\u{1F44D}\u{1F3FD}"];

beforeEach(() => {
  vi.useFakeTimers();
  testEnv().KEIKI_API_KEY = API_KEY;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
});

async function seeded(options: SeedOptions = {}): Promise<{ t: T; seed: Seed }> {
  vi.setSystemTime(new Date(nowFor(options.variant)));
  const t = makeT();
  const seed = await seedCrew(t, options);
  installFetch();
  return { t, seed };
}

async function onNow(options: SeedOptions = {}) {
  const context = await seeded(options);
  await tapAs(context.t, context.seed.samId, context.seed.frolicId, "down", "imessage");
  await tapAs(context.t, context.seed.anaId, context.seed.frolicId, "down", "app");
  await advance(context.t, REVEAL_DELAY_MS);
  return context;
}

function says(...bodies: { say?: string }[]): string[] {
  return bodies.map((body) => body.say ?? "");
}

describe("a reply that is not an answer", () => {
  it("leaves the answer open for every way of not answering", async () => {
    const { t, seed } = await seeded();
    for (const text of AMBIGUOUS) {
      const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
      expect(today.body.yourAnswer, text).toBeNull();
      expect(today.body.onlyWith, text).toEqual([]);
    }
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("tells the agent to save nothing and offer two ways to answer", () => {
    expect(prompt).toContain("Only call a tap tool when they clearly answered.");
    expect(prompt).toContain('"No rush. Down, or pass?"');
    for (const text of ['"maybe"', '"idk"', '"lol"', '"??"', "emoji"]) expect(prompt).toContain(text);
  });

  it("reads a plain no as a pass and a plain yes as a down", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    expect((await tapsOf(t, seed.frolicId))[0].kind).toBe("notToday");
    await toolResult(t, "tap_down", { phone: ANA_PHONE });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps.find((tap) => tap.userId === seed.anaId)?.kind).toBe("down");
    expect(prompt).toContain('"Can\'t", "not tonight", "next time", "I\'m out" are a pass.');
    expect(prompt).toContain('"Down", "in", "I\'m in", "yes" are a down.');
  });
});

describe("who else", () => {
  it("answers a who else question before the reveal without a name or a count", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "tap_down", { phone: SAM_PHONE });
    await tapAs(t, seed.anaId, seed.frolicId, "down", "app");
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("not_yet");
    expect(reveal.body.say).toBe(SECRET_LINE);
    for (const body of [today.body, reveal.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain("Ana");
      expect(text).not.toContain("Maya");
      expect(text).not.toContain("going");
    }
    expect(today.body.yourAnswer).toBe("down");
  });

  it("names only the people who matched after the reveal", async () => {
    const { t } = await onNow();
    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("on");
    expect(reveal.body.going).toEqual(["Ana"]);
    expect(JSON.stringify(reveal.body)).not.toContain("Dev");
  });
});

describe("im broke", () => {
  it("hands the agent the real cost so the answer is true", async () => {
    const { t } = await seeded();
    const free = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(free.body.plan.cost).toBe("Free");
    const paid = await seeded({ variant: "kayaks" });
    const costs = await toolResult(paid.t, "get_today", { phone: SAM_PHONE });
    expect(costs.body.plan.cost).toBe("$25");
  });

  it("tells the agent never to talk someone into paying", () => {
    expect(prompt).toContain('if they say "I\'m broke", give the real cost from `get_today`.');
    expect(prompt).toContain("If it costs money, do not talk them into it.");
    expect(prompt).toContain('"I\'m broke"');
  });
});

describe("only if maya", () => {
  it("saves the friend with the down", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Maya"] } });
    expect(result.body).toMatchObject({ ok: true, answer: "only_if", onlyWith: ["Maya"] });
    expect((await tapsOf(t, seed.frolicId))[0].onlyIf).toEqual([seed.mayaId]);
  });

  it("asks which friend and saves nothing when the name is not in the crew", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Zoe"] } });
    expect(result.body).toMatchObject({ ok: false, error: "names_unclear", unknown: ["Zoe"] });
    expect(result.body.crew).toContain("Maya");
    expect(result.body.say).toBe("Ask which friend they mean. Nothing was saved.");
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });
});

describe("a reply three days late", () => {
  async function threeDaysAgo(t: T, seed: Seed) {
    const old = seed.now - 3 * 86_400_000;
    await patchFrolic(t, seed.frolicId, {
      day: "2026-11-12",
      status: "on",
      window: { start: old - 3_600_000, end: old + 3_600_000 },
      startsAt: old,
      revealAt: old - 7_200_000,
      bloomAt: old - 7_200_000,
      deadline: old - 5_400_000,
    });
  }

  it("does not serve an old plan as today's", async () => {
    const { t, seed } = await seeded();
    await threeDaysAgo(t, seed);
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.ok).toBe(true);
    expect(today.body.plan).toBeNull();
    expect(JSON.stringify(today.body)).not.toContain("Indian Rock");
    expect(today.body.say).toBe("Today's plan has not dropped yet. Say it comes in the morning, in one line.");
  });

  it("does not tell them an old plan is on", async () => {
    const { t, seed } = await seeded();
    await threeDaysAgo(t, seed);
    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("no_plan");
    expect(reveal.body.say).toBe("Today's plan has not dropped yet. Say the plan comes in the morning, in one line.");
    expect(JSON.stringify(reveal.body)).not.toContain("on_without_you");
    expect(JSON.stringify(reveal.body)).not.toContain("Indian Rock");
  });

  it("writes no tap for an old plan and says nothing was saved", async () => {
    const { t, seed } = await seeded();
    await threeDaysAgo(t, seed);
    const result = await toolResult(t, "tap_down", { phone: SAM_PHONE });
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe("no_plan");
    expect(result.body.say).toContain("nothing was saved");
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("still shows today's plan when today's plan is the one that closed", async () => {
    const { t, seed } = await seeded();
    const old = seed.now - 3 * 86_400_000;
    await t.run(async (ctx) => {
      await ctx.db.insert("frolics", {
        groupId: seed.groupId,
        day: "2026-11-12",
        kind: "daily",
        planId: seed.planId,
        status: "on",
        window: { start: old - 3_600_000, end: old + 3_600_000 },
        durationMinutes: 60,
        deadline: old - 5_400_000,
        startsAt: old,
        revealAt: old - 7_200_000,
      });
    });
    await patchFrolic(t, seed.frolicId, { status: "faded" });
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.phase).toBe("faded");
    expect(today.body.plan.title).toBe("Sunset at Indian Rock");
    expect(today.body.say).toContain("no names and no count");
  });

  it("keeps a plan that is still running past midnight", async () => {
    const { t, seed } = await seeded();
    const late = seed.now - 10 * 3_600_000;
    await patchFrolic(t, seed.frolicId, {
      day: "2026-11-14",
      status: "on",
      window: { start: late - 3_600_000, end: seed.now + 3_600_000 },
      startsAt: late,
      revealAt: late - 7_200_000,
      deadline: late - 5_400_000,
    });
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.phase).toBe("on");
    expect(today.body.plan.title).toBe("Sunset at Indian Rock");
  });
});

describe("two texts in a row", () => {
  it("keeps the last answer when down is followed by pass", async () => {
    const { t, seed } = await seeded();
    const first = await toolResult(t, "tap_down", { phone: SAM_PHONE });
    const second = await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    expect(first.body.ok).toBe(true);
    expect(second.body).toMatchObject({ ok: true, answer: "pass" });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps).toHaveLength(1);
    expect(taps[0].kind).toBe("notToday");
    expect((await toolResult(t, "get_today", { phone: SAM_PHONE })).body.yourAnswer).toBe("pass");
  });

  it("keeps the last answer when pass is followed by down", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    const second = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Maya"] } });
    expect(second.body).toMatchObject({ ok: true, answer: "only_if", onlyWith: ["Maya"] });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps).toHaveLength(1);
    expect(taps[0].kind).toBe("down");
    expect(taps[0].onlyIf).toEqual([seed.mayaId]);
  });

  it("answers a repeated answer the same way instead of puzzling the person", async () => {
    const { t } = await seeded();
    const first = await toolResult(t, "tap_down", { phone: SAM_PHONE });
    const again = await toolResult(t, "tap_down", { phone: SAM_PHONE });
    expect(again.body).toEqual(first.body);
  });
});

describe("a message about a different plan", () => {
  it("answers about today and never about a later day", async () => {
    const { t, seed } = await seeded();
    await t.run(async (ctx) => {
      await ctx.db.insert("frolics", {
        groupId: seed.groupId,
        day: "2026-11-21",
        kind: "daily",
        planId: seed.planId,
        status: "open",
        window: { start: seed.now + 5 * 86_400_000, end: seed.now + 5 * 86_400_000 + 3_600_000 },
        durationMinutes: 60,
        deadline: seed.now + 5 * 86_400_000 + 1_800_000,
      });
    });
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.plan.title).toBe("Sunset at Indian Rock");
    expect(prompt).toContain("One plan a day.");
  });
});

describe("a text from someone not in the crew", () => {
  it("says they are new instead of showing a plan", async () => {
    const { t } = await seeded();
    const member = await toolResult(t, "get_member", { phone: STRANGER_PHONE });
    expect(member.body).toMatchObject({ ok: true, member: false });
    const today = await toolResult(t, "get_today", { phone: STRANGER_PHONE });
    expect(today.body).toMatchObject({ ok: false, error: "not_in_a_crew" });
    expect(today.body.say).toContain("invite code");
    expect(today.body.say).toContain("a friend in the crew sends the link");
  });

  it("stops asking for a code they do not have", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: STRANGER_PHONE, input: { invite_code: "NOPE123", first_name: "Zoe" } });
    expect(result.body).toMatchObject({ ok: false, error: "bad_invite" });
    expect(result.body.say).toContain("a friend in the crew sends the link");
    expect(result.body.say).toContain("Ask once");
    expect(prompt).toContain("If they have no invite code, say a friend in the crew sends the link, in one line.");
  });

  it("takes a real code from the first message", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: STRANGER_PHONE, input: { invite_code: INVITE_CODE, first_name: "Zoe" } });
    expect(result.body).toMatchObject({ ok: true, crew: "Sunset Crew", name: "Zoe" });
    const today = await toolResult(t, "get_today", { phone: STRANGER_PHONE });
    expect(today.body.plan.title).toBe("Sunset at Indian Rock");
  });
});

describe("the voice", () => {
  it("keeps every reply instruction short, warm and free of banned punctuation", async () => {
    const { t, seed } = await seeded();
    const bodies = [
      (await toolResult(t, "get_member", { phone: SAM_PHONE })).body,
      (await toolResult(t, "get_member", { phone: STRANGER_PHONE })).body,
      (await toolResult(t, "get_today", { phone: SAM_PHONE })).body,
      (await toolResult(t, "get_today", { phone: STRANGER_PHONE })).body,
      (await toolResult(t, "tap_down", { phone: SAM_PHONE })).body,
      (await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Zoe"] } })).body,
      (await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { after: "9pm" } })).body,
      (await toolResult(t, "tap_pass", { phone: SAM_PHONE })).body,
      (await toolResult(t, "get_reveal", { phone: SAM_PHONE })).body,
      (await toolResult(t, "join_crew", { phone: STRANGER_PHONE, input: { invite_code: "NOPE123", first_name: "Zoe" } })).body,
    ];
    await patchFrolic(t, seed.frolicId, { status: "faded" });
    bodies.push((await toolResult(t, "get_today", { phone: SAM_PHONE })).body);
    for (const say of says(...bodies)) {
      expect(say).not.toContain("\u2014");
      expect(say).not.toContain("!");
      expect(say).not.toContain(" but ");
    }
    expect(prompt).not.toContain("\u2014");
    expect(prompt).not.toContain("!");
  });
});
