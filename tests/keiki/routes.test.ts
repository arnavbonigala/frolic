/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { frolicsRefusingImFree, frolicsWithImFree } from "../../keiki/test/fakes";
import { personalNamespace, planWrites } from "../../convex/memory/mapping";
import { tapErrorAnswer } from "../../convex/keiki/tools";
import type { Id } from "../../convex/_generated/dataModel";
import { ANA_PHONE, INVITE_CODE, SAM_PHONE, linkChat, linkPhone, nowFor, seedCrew } from "../../keiki/test/seed";
import type { Seed, SeedOptions, T } from "../../keiki/test/seed";
import {
  API_KEY,
  INDIAN_ROCK_MAP_LINK,
  REVEAL_DELAY_MS,
  SIGNING_SECRET,
  advance,
  attendeesOf,
  checkinsOf,
  etasOf,
  frolicOf,
  installFetch,
  linksOf,
  makeT,
  membershipsOf,
  outboxOf,
  patchFrolic,
  postTool,
  requestsOf,
  revealsOf,
  signedHeaders,
  snapsOf,
  tapAs,
  tapsOf,
  toolBody,
  testEnv,
  toolResult,
} from "../../keiki/test/harness";

const CHAT = "imsg:chat:abc";
const MAYA_TEXT_PHONE = "+15105550107";
const SECRET_LINE = "Nobody sees you're down unless they are too. That goes for you as well.";
const SNAP = { url: "https://files.frolic.test/snap-1.jpg", mime_type: "image/jpeg", size: 300 };
const VCARD = { url: "https://files.frolic.test/location-1.vcf", mime_type: "text/vcard", size: 120 };

beforeEach(() => {
  vi.useFakeTimers();
  testEnv().KEIKI_API_KEY = API_KEY;
  delete testEnv().KEIKI_TOOL_SIGNING_SECRET;
  delete testEnv().KEIKI_AGENT_ID;
  delete testEnv().KEIKI_DEDICATED_LINE;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
  delete testEnv().KEIKI_TOOL_SIGNING_SECRET;
  delete testEnv().KEIKI_AGENT_ID;
  delete testEnv().KEIKI_DEDICATED_LINE;
});

async function seeded(options: SeedOptions = {}): Promise<{ t: T; seed: Seed }> {
  vi.setSystemTime(new Date(nowFor(options.variant)));
  const t = makeT();
  const seed = await seedCrew(t, options);
  return { t, seed };
}

async function matched(options: SeedOptions = {}) {
  const { t, seed } = await seeded(options);
  const fetchMock = installFetch();
  await tapAs(t, seed.samId, seed.frolicId, "down", "imessage");
  await tapAs(t, seed.mayaId, seed.frolicId, "down", "app");
  return { t, seed, fetchMock };
}

async function onNow(options: SeedOptions = {}) {
  const context = await matched(options);
  await advance(context.t, REVEAL_DELAY_MS);
  return context;
}

describe("auth", () => {
  it("rejects a request with no api key header", async () => {
    const { t } = await seeded();
    const res = await t.fetch("/keiki/tools/get_member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: toolBody("get_member", {}, { phone: SAM_PHONE }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects the wrong api key", async () => {
    const { t } = await seeded();
    const res = await t.fetch("/keiki/tools/get_member", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": "nope" },
      body: toolBody("get_member", {}, { phone: SAM_PHONE }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 when nothing is configured", async () => {
    const { t } = await seeded();
    delete testEnv().KEIKI_API_KEY;
    const res = await t.fetch("/keiki/tools/get_member", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": API_KEY },
      body: toolBody("get_member", {}, { phone: SAM_PHONE }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "not_configured" });
  });

  it("accepts a valid hmac signature", async () => {
    const { t, seed } = await seeded();
    testEnv().KEIKI_TOOL_SIGNING_SECRET = SIGNING_SECRET;
    const body = toolBody("get_today", {}, { phone: SAM_PHONE });
    const res = await t.fetch("/keiki/tools/get_today", { method: "POST", headers: await signedHeaders(body), body });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { ok: boolean; plan: { title: string } };
    expect(result.ok).toBe(true);
    expect(result.plan.title).toBe(seed.title);
  });

  it("rejects a stale timestamp", async () => {
    const { t } = await seeded();
    testEnv().KEIKI_TOOL_SIGNING_SECRET = SIGNING_SECRET;
    const body = toolBody("get_today", {}, { phone: SAM_PHONE });
    const headers = await signedHeaders(body, { timestamp: Date.now() - 10 * 60 * 1000 });
    const res = await t.fetch("/keiki/tools/get_today", { method: "POST", headers, body });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "stale" });
  });

  it("rejects a bad signature", async () => {
    const { t } = await seeded();
    testEnv().KEIKI_TOOL_SIGNING_SECRET = SIGNING_SECRET;
    const body = toolBody("get_today", {}, { phone: SAM_PHONE });
    const headers = await signedHeaders(body, { secret: "not-the-secret" });
    const res = await t.fetch("/keiki/tools/get_today", { method: "POST", headers, body });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects bad json", async () => {
    const { t } = await seeded();
    const res = await t.fetch("/keiki/tools/get_member", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": API_KEY },
      body: "{nope",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_json" });
  });

  it("rejects an unknown sender", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "get_member", { phone: "not-a-phone" });
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "unknown_sender" });
  });

  it("rejects bad input", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: SAM_PHONE, input: { first_name: "Kai" } });
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe("invalid_input");
    expect(result.body.detail).toBe("invite_code is required");
  });
});

describe("replay", () => {
  it("returns the same body for a repeated tap and keeps one tap row", async () => {
    const { t, seed } = await seeded();
    const first = await toolResult(t, "tap_down", { phone: SAM_PHONE, trace: "tr_replay" });
    const second = await toolResult(t, "tap_down", { phone: SAM_PHONE, trace: "tr_replay" });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true, answer: "down", onlyWith: [], after: null, say: expect.any(String) });
    expect(second.text).toBe(first.text);
    expect(second.replayed).toBe(true);
    expect(first.replayed).toBe(false);
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(1);
    expect(await requestsOf(t)).toHaveLength(1);
  });

  it("keeps one tap row when the trace id changes", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "tap_down", { phone: SAM_PHONE, trace: "tr_first" });
    await toolResult(t, "tap_down", { phone: SAM_PHONE, trace: "tr_second" });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(1);
    expect(await requestsOf(t)).toHaveLength(2);
  });
});

describe("secrecy", () => {
  beforeEach(() => {
    testEnv().KEIKI_DEDICATED_LINE = "1";
  });

  it("sends nothing before revealAt and keeps the match out of every answer", async () => {
    const { t, seed, fetchMock } = await matched();
    await linkPhone(t, seed.devId, "+15105550105");

    const tap = await toolResult(t, "tap_down", { phone: SAM_PHONE, trace: "tr_secret_tap" });
    expect(tap.body.ok).toBe(true);
    expect(Object.keys(tap.body).sort()).toEqual(["after", "answer", "ok", "onlyWith", "say"]);
    expect(tap.text).not.toContain("revealAt");
    expect(tap.text).not.toContain("going");
    expect(tap.text).not.toContain("matched");

    const frolic = await frolicOf(t, seed.frolicId);
    expect(frolic?.status).toBe("open");
    expect(frolic?.revealAt).toBeUndefined();
    const pending = await revealsOf(t, seed.frolicId);
    expect(pending).toHaveLength(1);
    expect(pending[0].revealAt).toBeGreaterThanOrEqual(seed.now + REVEAL_DELAY_MS);
    expect(pending[0].revealAt).toBeLessThan(seed.now + REVEAL_DELAY_MS + 20);
    expect([...pending[0].userIds].sort()).toEqual([seed.mayaId, seed.samId].sort());

    expect(fetchMock.notices).toHaveLength(0);
    expect(await outboxOf(t)).toHaveLength(0);

    const samToday = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(samToday.body.phase).toBe("open");
    expect(samToday.body.yourAnswer).toBe("down");
    expect(samToday.body.onlyWith).toEqual([]);
    expect(samToday.text).not.toContain("Maya");

    const sam = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    const ana = await toolResult(t, "get_reveal", { phone: ANA_PHONE });
    const dev = await toolResult(t, "get_reveal", { phone: "+15105550105" });
    expect(sam.body).toEqual({ ok: true, state: "not_yet", say: SECRET_LINE });
    expect(ana.text).toBe(sam.text);
    expect(dev.text).toBe(sam.text);

    const link = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "SUNSET" } });
    expect(link.body.ok).toBe(true);

    const group = await toolResult(t, "get_today", { phone: CHAT });
    expect(group.body.ok).toBe(true);
    expect(group.body.groupChat).toBe(true);
    expect(group.body).not.toHaveProperty("yourAnswer");
    expect(group.body).not.toHaveProperty("onlyWith");
    for (const name of ["Maya", "Dev", "Sam", "Ana"]) expect(group.text).not.toContain(name);

    const tapsBefore = await tapsOf(t, seed.frolicId);
    const fromGroup = await toolResult(t, "tap_down", { phone: CHAT });
    expect(fromGroup.body).toEqual({
      ok: false,
      error: "dm_only",
      say: "Answers in the group chat aren't secret. Ask them to text you directly.",
    });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(tapsBefore.length);

    const pass = await toolResult(t, "tap_pass", { phone: ANA_PHONE });
    expect(pass.body).toMatchObject({ ok: true, answer: "pass" });

    expect(fetchMock.notices).toHaveLength(0);

    await advance(t, REVEAL_DELAY_MS);

    expect((await frolicOf(t, seed.frolicId))?.status).toBe("on");
    expect(await attendeesOf(t, seed.frolicId)).toHaveLength(2);
    expect(fetchMock.notices).toHaveLength(2);
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, CHAT].sort());

    const personal = fetchMock.notices.find((notice) => notice.phone === SAM_PHONE)!;
    const chat = fetchMock.notices.find((notice) => notice.phone === CHAT)!;
    expect(personal.text).toContain("It's on. You, Maya.");
    expect(personal.text).toContain("Indian Rock");
    expect(chat.text).toContain("Maya");
    expect(chat.text).toContain("Sam");
    for (const notice of fetchMock.notices) {
      expect(notice.text).not.toContain("Ana");
      expect(notice.text).not.toContain("Dev");
      expect(notice.at).toBeGreaterThanOrEqual(seed.now + REVEAL_DELAY_MS);
    }

    const outbox = await outboxOf(t);
    expect(outbox.every((row) => row.status === "sent")).toBe(true);
    expect(outbox.some((row) => row.target === ANA_PHONE)).toBe(false);
  });

  it("sends nothing when onReveal runs early and sends once at revealAt", async () => {
    const { t, seed } = await seeded();
    const fetchMock = installFetch();
    const revealAt = seed.now + 60_000;
    await patchFrolic(t, seed.frolicId, { revealAt });
    await t.mutation(internal.keiki.outbound.onReveal, {
      frolicId: seed.frolicId,
      userIds: [seed.samId],
      bloomAt: revealAt + 800,
    });
    expect(await outboxOf(t)).toHaveLength(0);
    expect(fetchMock.notices).toHaveLength(0);

    await advance(t, 60_000);

    const reveals = (await outboxOf(t)).filter((row) => row.kind === "reveal");
    expect(reveals).toHaveLength(1);
    expect(reveals[0].userId).toBe(seed.samId);
    expect(reveals[0].notBefore).toBe(revealAt);
    expect(fetchMock.notices.filter((notice) => notice.phone === SAM_PHONE)).toHaveLength(1);
  });

  it("flips the app state and sends the notice in the same scheduled run", async () => {
    const { t, seed, fetchMock } = await matched();
    expect(fetchMock.notices).toHaveLength(0);
    await advance(t, REVEAL_DELAY_MS);
    const frolic = await frolicOf(t, seed.frolicId);
    expect(frolic?.status).toBe("on");
    expect(frolic!.revealAt!).toBeGreaterThanOrEqual(seed.now + REVEAL_DELAY_MS);
    expect(frolic!.revealAt!).toBeLessThan(seed.now + REVEAL_DELAY_MS + 20);
    expect(await revealsOf(t, seed.frolicId)).toHaveLength(0);
    expect(fetchMock.notices.some((notice) => notice.phone === SAM_PHONE)).toBe(true);
  });
});

describe("get_member", () => {
  it("returns the crew for a linked member", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "get_member", { phone: SAM_PHONE });
    expect(result.body).toEqual({
      ok: true,
      member: true,
      name: "Sam",
      crew: "Sunset Crew",
      friends: ["Maya", "Dev", "Ana"],
      paused: false,
      crewTaste: { loves: [], keepsPassingOn: [] },
    });
  });

  it("tells the agent to ask for a name and code for a stranger", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "get_member", { phone: "+15105550199" });
    expect(result.body.ok).toBe(true);
    expect(result.body.member).toBe(false);
    expect(result.body.say).toContain("join_crew");
  });
});

describe("join_crew", () => {
  it("adds a new person to the crew", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: "+15105550198", input: { invite_code: "SUNSET", first_name: "Kai" } });
    expect(result.body).toEqual({
      ok: true,
      crew: "Sunset Crew",
      name: "Kai",
      friends: ["Maya", "Dev", "Sam", "Ana"],
      say: "Welcome them in one line, then call get_today.",
    });
    expect(await membershipsOf(t, seed.groupId)).toHaveLength(5);
    expect((await linksOf(t)).some((link) => link.phone === "+15105550198")).toBe(true);
    const today = await toolResult(t, "get_today", { phone: "+15105550198" });
    expect(today.body.ok).toBe(true);
    expect(today.body.plan.title).toBe("Sunset at Indian Rock");
  });

  it("refuses a bad invite", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: "+15105550198", input: { invite_code: "SUNRISE", first_name: "Kai" } });
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe("bad_invite");
    expect(await membershipsOf(t, seed.groupId)).toHaveLength(4);
  });

  it("is idempotent across two traces", async () => {
    const { t, seed } = await seeded();
    const first = await toolResult(t, "join_crew", {
      phone: "+15105550198",
      input: { invite_code: "SUNSET", first_name: "Kai" },
      trace: "tr_join_1",
    });
    const second = await toolResult(t, "join_crew", {
      phone: "+15105550198",
      input: { invite_code: "SUNSET", first_name: "Kai" },
      trace: "tr_join_2",
    });
    expect(second.body).toEqual(first.body);
    expect(await membershipsOf(t, seed.groupId)).toHaveLength(5);
    expect((await linksOf(t)).filter((link) => link.phone === "+15105550198")).toHaveLength(1);
  });
});

describe("get_today", () => {
  it("shows the plan and no answer before the person replies", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(result.body.phase).toBe("open");
    expect(result.body.yourAnswer).toBeNull();
    expect(result.body.onlyWith).toEqual([]);
    expect(result.body.plan).toMatchObject({
      title: "Sunset at Indian Rock",
      line: "Golden hour on the rock, tacos after.",
      place: "Indian Rock",
      neighborhood: "Northbrae",
      startsAt: "5:45",
      leaveAt: "5:35",
      walkMinutes: 10,
      cost: "Free",
      why: "The rock clears out after five.",
    });
  });

  it("shows the answer after a tap", async () => {
    const { t } = await seeded();
    await toolResult(t, "tap_down", { phone: SAM_PHONE });
    const down = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(down.body.yourAnswer).toBe("down");
    expect(down.body.onlyWith).toEqual([]);
  });
});

describe("tap_only_if", () => {
  it("resolves a friend by first name", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Maya"] } });
    expect(result.body).toEqual({
      ok: true,
      answer: "only_if",
      onlyWith: ["Maya"],
      after: null,
      say: "Confirm in one line: Got it. Secret's safe. Then stay quiet until something changes.",
    });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps).toHaveLength(1);
    expect(taps[0].onlyIf).toEqual([seed.mayaId]);
    expect(taps[0].source).toBe("imessage");
  });

  it("refuses an unknown name and writes nothing", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Zoe"] } });
    expect(result.body).toMatchObject({
      ok: false,
      error: "names_unclear",
      unknown: ["Zoe"],
      ambiguous: [],
      crew: ["Maya", "Dev", "Ana"],
    });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("turns a time into a window", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { after: "7:30" } });
    expect(result.body.answer).toBe("only_if");
    expect(result.body.after).toBe("7:30");
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps[0].window).toEqual({
      start: Date.parse("2026-11-16T03:30:00.000Z"),
      end: Date.parse("2026-11-16T04:00:00.000Z"),
    });
    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.yourAnswer).toBe("only_if");
  });

  it("reads a bare morning hour as morning on a morning plan", async () => {
    const { t, seed } = await seeded({ variant: "kayaks" });
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { after: "10" } });
    expect(result.body.answer).toBe("only_if");
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps[0].window).toEqual({
      start: Date.parse("2026-11-16T18:00:00.000Z"),
      end: Date.parse("2026-11-16T20:00:00.000Z"),
    });
  });

  it("refuses a time after the plan wraps up", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { after: "9pm" } });
    expect(result.body).toMatchObject({ ok: false, error: "too_late" });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });
});

describe("an answer that cannot land", () => {
  it("says the plan closed when the tap arrives after the start", async () => {
    const { t, seed } = await onNow({ variant: "kayaks" });
    await advance(t, 5 * 60_000);
    const result = await toolResult(t, "tap_down", { phone: SAM_PHONE });
    expect(result.body).toEqual({ ok: false, error: "closed", say: "Today's plan has closed. Tomorrow's drop is the next chance." });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(2);
  });

  it("asks them to slow down when the rate limiter trips", async () => {
    const { t } = await seeded();
    installFetch();
    const answers: { ok: boolean; error?: string }[] = [];
    for (let i = 0; i < 9; i += 1) answers.push((await toolResult(t, "tap_down", { phone: SAM_PHONE })).body);
    expect(answers.filter((answer) => answer.ok)).toHaveLength(6);
    expect(answers.slice(6).every((answer) => answer.ok === false && answer.error === "slow_down")).toBe(true);
  });
});

describe("tap_pass", () => {
  it("lets a member pass after the reveal so a text-only friend can back out (blocked by convex/keiki/tools.ts:136 already_on)", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    expect(result.body).toMatchObject({ ok: true, answer: "pass" });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps[0].kind).toBe("notToday");
  });

  it("records a pass", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    expect(result.body).toEqual({ ok: true, answer: "pass", say: "Confirm in one line. Never ask why." });
    const taps = await tapsOf(t, seed.frolicId);
    expect(taps[0].kind).toBe("notToday");
  });
});

describe("get_reveal", () => {
  it("stops saying it's on once the plan is done (blocked by convex/keiki/tools.ts:236 has no done branch)", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { status: "done" });
    const result = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(result.body.state).not.toBe("on");
  });

  it("opens the plan for someone who is going", async () => {
    const { t } = await onNow();
    const result = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(result.body.state).toBe("on");
    expect(result.body.going).toEqual(["Maya"]);
    expect(result.body.headline).toBe("It's on. You, Maya.");
    expect(result.body.plan.title).toBe("Sunset at Indian Rock");
    expect(result.body.deposit).toBeNull();
  });

  it("names who is going to someone who is not", async () => {
    const { t } = await onNow();
    const result = await toolResult(t, "get_reveal", { phone: ANA_PHONE });
    expect(result.body.state).toBe("on_without_you");
    expect([...result.body.going].sort()).toEqual(["Maya", "Sam"]);
    expect(result.body.plan.title).toBe("Sunset at Indian Rock");
  });

  it("says a plan faded", async () => {
    const { t, seed } = await seeded();
    await patchFrolic(t, seed.frolicId, { status: "faded", deadline: seed.now - 1000 });
    const result = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(result.body).toEqual({ ok: true, state: "faded", say: "Say it drifted off, gently, with no names and no count. Mention tomorrow. No guilt." });
  });
});

describe("on_my_way", () => {
  it("records an eta once the plan is on", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "on_my_way", { phone: SAM_PHONE, input: { minutes: 12 } });
    expect(result.body).toEqual({ ok: true, minutes: 12, say: "Tell them the group can see they're 12 min away." });
    const etas = await etasOf(t, seed.frolicId);
    expect(etas).toHaveLength(1);
    expect(etas[0]).toMatchObject({ userId: seed.samId, minutes: 12, onTheWay: true });
  });

  it("stops taking an eta once the plan is done", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { status: "done" });
    const result = await toolResult(t, "on_my_way", { phone: SAM_PHONE, input: { minutes: 5 } });
    expect(result.body).toMatchObject({ ok: false, error: "not_on" });
    expect(await etasOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("refuses before the reveal", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "on_my_way", { phone: SAM_PHONE, input: { minutes: 5 } });
    expect(result.body).toMatchObject({ ok: false, error: "not_on" });
    expect(await etasOf(t, seed.frolicId)).toHaveLength(0);
  });
});

describe("check_in", () => {
  it("checks in from coordinates at the meetup", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "check_in", { phone: SAM_PHONE, input: { lat: 37.8925, lng: -122.2717 } });
    expect(result.body).toEqual({ ok: true, checkedIn: true, viaLocation: true });
    const rows = await checkinsOf(t, seed.frolicId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: seed.samId, method: "imessage" });
  });

  it("refuses coordinates too far away", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "check_in", { phone: SAM_PHONE, input: { lat: 37.79, lng: -122.4 } });
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe("too_far");
    expect(result.body.meters).toBeGreaterThan(400);
    expect(result.body.place).toBe("Indian Rock");
    expect(await checkinsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("reads a shared location from a vcard attachment", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "check_in", {
      phone: SAM_PHONE,
      input: { attachment_id: "loc1" },
      context: { attachments: { loc1: VCARD } },
    });
    expect(result.body).toEqual({ ok: true, checkedIn: true, viaLocation: true });
    expect(await checkinsOf(t, seed.frolicId)).toHaveLength(1);
  });

  it("refuses an unreadable attachment", async () => {
    const { t, seed } = await onNow();
    const result = await toolResult(t, "check_in", {
      phone: SAM_PHONE,
      input: { attachment_id: "loc1" },
      context: { attachments: { loc1: { url: "https://files.frolic.test/notes.txt", mime_type: "text/plain", size: 40 } } },
    });
    expect(result.body).toMatchObject({ ok: false, error: "location_unreadable" });
    expect(await checkinsOf(t, seed.frolicId)).toHaveLength(0);
  });
});

describe("submit_snap", () => {
  it("refuses before the snap window opens", async () => {
    const { t } = await onNow();
    const result = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "p1" },
      context: { attachments: { p1: SNAP } },
    });
    expect(result.body).toMatchObject({ ok: false, error: "snap_not_open" });
  });

  it("refuses once the snap window has closed", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now - 3 * 60_000 });
    await toolResult(t, "check_in", { phone: SAM_PHONE, input: { lat: 37.8925, lng: -122.2717 } });
    const result = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "p1" },
      context: { attachments: { p1: SNAP } },
    });
    expect(result.body).toMatchObject({ ok: false, error: "snap_not_open" });
    expect(await snapsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("refuses before a check in", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now - 60_000 });
    const result = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "p1" },
      context: { attachments: { p1: SNAP } },
    });
    expect(result.body).toMatchObject({ ok: false, error: "not_checked_in" });
  });

  it("stores the photo and returns no collage yet", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now - 60_000 });
    await toolResult(t, "check_in", { phone: SAM_PHONE, input: { lat: 37.8925, lng: -122.2717 } });
    const result = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "p1" },
      context: { attachments: { p1: SNAP } },
    });
    expect(result.body).toEqual({
      ok: true,
      added: true,
      collageUrl: null,
      say: "Tell them the collage comes as soon as the others add theirs.",
    });
    const snaps = await snapsOf(t, seed.frolicId);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ userId: seed.samId, groupId: seed.groupId, snapAt: seed.now - 60_000 });
  });

  it("refuses a file that is not a photo", async () => {
    const { t, seed } = await onNow();
    await patchFrolic(t, seed.frolicId, { snapAt: seed.now - 60_000 });
    await toolResult(t, "check_in", { phone: SAM_PHONE, input: { lat: 37.8925, lng: -122.2717 } });
    const result = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "p1" },
      context: { attachments: { p1: VCARD } },
    });
    expect(result.body).toMatchObject({ ok: false, error: "not_a_photo" });
    expect(await snapsOf(t, seed.frolicId)).toHaveLength(0);
  });
});

async function shareOf(t: T, frolicId: Id<"frolics">, userId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("shares")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
        .unique(),
  );
}

describe("pay_deposit", () => {
  beforeEach(() => {
    testEnv().KEIKI_DEDICATED_LINE = "1";
  });

  it("states the amount before asking for approval", async () => {
    const { t } = await onNow({ variant: "kayaks" });
    const preflight = await toolResult(t, "pay_deposit", { phone: SAM_PHONE, context: { preflight: true } });
    expect(preflight.body).toEqual({ ok: true, preflight: true, amount: "$25", what: "their share of the plan" });
    expect(preflight.text).not.toContain("/pay/");
  });

  it("returns the pay link on the approved call", async () => {
    const { t, seed } = await onNow({ variant: "kayaks" });
    const link = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(link.body).toMatchObject({
      ok: true,
      amount: "$25",
      what: "their share of the plan",
      approvedWithFaceId: false,
      say: "Send the link once. Say plainly what it is.",
    });
    const share = await shareOf(t, seed.frolicId, seed.samId);
    expect(share).toMatchObject({ kind: "chipIn", status: "due", amountCents: 2500 });
    expect(link.body.url.endsWith("/pay/" + share!.token)).toBe(true);
  });

  it("asks for the $3 hold on a free plan", async () => {
    const { t, seed } = await matched();
    await t.run(async (ctx) => await ctx.db.patch("groups", seed.groupId, { holdEnabled: true }));
    await advance(t, REVEAL_DELAY_MS);
    const result = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(result.body).toMatchObject({ ok: true, amount: "$3", what: "a hold that comes back when they arrive" });
    const share = await shareOf(t, seed.frolicId, seed.samId);
    expect(share).toMatchObject({ kind: "deposit", status: "due", amountCents: 300 });
    expect(result.body.url.endsWith("/pay/" + share!.token)).toBe(true);
  });

  it("shows the deposit to a member who is going", async () => {
    const { t } = await onNow({ variant: "kayaks" });
    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("on");
    expect(reveal.body.deposit).toEqual({ amount: "$5" });
  });

  it("says there is nothing to pay when the fund covers the plan", async () => {
    const { t, seed } = await seeded({ variant: "kayaks" });
    await t.run(async (ctx) => {
      await ctx.db.insert("fundLedger", { groupId: seed.groupId, entry: "forfeit", amountCents: 10_000, at: seed.now });
    });
    installFetch();
    await tapAs(t, seed.samId, seed.frolicId, "down", "imessage");
    await tapAs(t, seed.mayaId, seed.frolicId, "down", "app");
    await advance(t, REVEAL_DELAY_MS);

    const result = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(result.body).toEqual({ ok: false, error: "no_deposit", say: "This plan has nothing to pay." });
    expect(await shareOf(t, seed.frolicId, seed.samId)).toMatchObject({ status: "waived", amountCents: 0 });
  });

  it("says the deposit is already in once the share is held, back or paid", async () => {
    const { t, seed } = await onNow({ variant: "kayaks" });
    for (const status of ["held", "released", "paid"] as const) {
      await t.run(async (ctx) => {
        const share = await ctx.db
          .query("shares")
          .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", seed.frolicId).eq("userId", seed.samId))
          .unique();
        await ctx.db.patch("shares", share!._id, { status });
      });
      const result = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
      expect(result.body).toMatchObject({ ok: false, error: "already_paid" });
    }
  });
});

describe("remember", () => {
  it("stores the note", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "remember", { phone: SAM_PHONE, input: { text: "  Maya hates hikes.  " } });
    expect(result.body).toEqual({ ok: true, remembered: "Maya hates hikes." });
  });

  it("writes the note to the same personal memory the app uses", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "remember", { phone: SAM_PHONE, input: { text: "Sam is vegetarian." } });
    const events = await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "limit", userId: seed.samId, source: "imessage", payload: { text: "Sam is vegetarian." } });
    const writes = planWrites(events[0].eventKey, { kind: events[0].kind, groupId: events[0].groupId, userId: events[0].userId, payload: events[0].payload });
    expect(writes.writes.map((w) => w.namespace)).toEqual([personalNamespace(seed.samId)]);
  });

  it("records an iMessage pass as a personal skip in the same namespace", async () => {
    const { t, seed } = await seeded();
    await toolResult(t, "tap_pass", { phone: SAM_PHONE });
    const events = await t.run(async (ctx) => await ctx.db.query("memoryEvents").collect());
    const skip = events.find((e) => e.kind === "skip");
    expect(skip).toMatchObject({ userId: seed.samId, source: "imessage" });
    const writes = planWrites(skip!.eventKey, { kind: skip!.kind, groupId: skip!.groupId, userId: skip!.userId, payload: skip!.payload });
    expect(writes.writes.map((w) => w.namespace)).toEqual([personalNamespace(seed.samId)]);
  });

  it("refuses an empty note", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "remember", { phone: SAM_PHONE, input: { text: "   " } });
    expect(result.body).toMatchObject({ ok: false, error: "empty" });
  });
});

describe("pause", () => {
  it("marks the link paused and outbound skips it", async () => {
    const { t, seed } = await seeded();
    installFetch();
    const result = await toolResult(t, "pause", { phone: SAM_PHONE });
    expect(result.body).toEqual({ ok: true, paused: true });
    const member = await toolResult(t, "get_member", { phone: SAM_PHONE });
    expect(member.body.paused).toBe(true);

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: seed.frolicId });
    const outbox = await outboxOf(t);
    expect(outbox.find((row) => row.userId === seed.samId)?.status).toBe("skipped");
    expect(outbox.find((row) => row.userId === seed.anaId)?.status).toBe("queued");

    await advance(t, 0);
    const settled = await outboxOf(t);
    expect(settled.find((row) => row.userId === seed.samId)?.status).toBe("skipped");
    expect(settled.find((row) => row.userId === seed.anaId)?.status).toBe("sent");
  });
});

describe("steered turns", () => {
  it("refuses a write from a steered turn", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_down", { phone: SAM_PHONE, context: { internal: true } });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: false, error: "steered_turn", say: "A steered turn can't act for this person." });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
  });

  it("still answers a read from a steered turn", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "get_today", { phone: SAM_PHONE, context: { internal: true } });
    expect(result.body.ok).toBe(true);
    expect(result.body.plan.title).toBe(seed.title);
  });
});

describe("link_group_chat", () => {
  beforeEach(() => {
    testEnv().KEIKI_DEDICATED_LINE = "1";
  });

  it("links a chat and refuses a bad invite", async () => {
    const { t, seed } = await seeded();
    const bad = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "SUNRISE" } });
    expect(bad.body.error).toBe("bad_invite");
    const good = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "SUNSET" } });
    expect(good.body).toEqual({
      ok: true,
      crew: "Sunset Crew",
      say: "Say the daily plan will drop here, and that everyone answers in a DM so it stays secret.",
    });
    const again = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "sunset" } });
    expect(again.body.ok).toBe(true);
    const chats = await t.run(async (ctx) => await ctx.db.query("keikiGroupChats").take(8));
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ chatId: CHAT, groupId: seed.groupId });
  });

  it("refuses a direct message sender", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "link_group_chat", { phone: SAM_PHONE, input: { invite_code: "SUNSET" } });
    expect(result.body).toEqual({ ok: false, error: "group_only", say: "Add Frolic to the crew's group chat and ask there." });
  });

  it("refuses a chat that belongs to another crew", async () => {
    const { t, seed } = await seeded();
    const other = await t.run(
      async (ctx) => await ctx.db.insert("groups", { name: "Other Crew", createdBy: seed.mayaId, timezone: "America/Los_Angeles" }),
    );
    await linkChat(t, other, CHAT);
    const result = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "SUNSET" } });
    expect(result.body).toEqual({ ok: false, error: "already_linked", say: "This chat is already connected to another crew." });
    const chats = await t.run(async (ctx) => await ctx.db.query("keikiGroupChats").withIndex("by_chatId", (q) => q.eq("chatId", CHAT)).take(4));
    expect(chats).toHaveLength(1);
    expect(chats[0].groupId).toBe(other);
  });
});

describe("shared line", () => {
  it("refuses to link a group chat and says to text directly", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "link_group_chat", { phone: CHAT, input: { invite_code: "SUNSET" } });
    expect(result.body).toEqual({
      ok: false,
      error: "needs_dedicated_line",
      say: "Group chats need a dedicated line. Text me directly instead.",
    });
    expect(await t.run(async (ctx) => await ctx.db.query("keikiGroupChats").take(4))).toHaveLength(0);
  });
});

describe("signed access", () => {
  it("serves the routes with only a signature secret configured", async () => {
    const { t } = await seeded();
    testEnv().KEIKI_TOOL_SIGNING_SECRET = SIGNING_SECRET;
    delete testEnv().KEIKI_API_KEY;
    const body = toolBody("get_member", {}, { phone: SAM_PHONE });
    const res = await postTool(t, "get_member", { phone: SAM_PHONE, headers: await signedHeaders(body) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { member: boolean }).member).toBe(true);
  });

  it("keeps the map link fixture the check-in test reads", () => {
    expect(INDIAN_ROCK_MAP_LINK).toContain("37.8925,-122.2717");
  });
});

describe("which frolic a texter sees", () => {
  it("keeps today's open plan when a later day is seeded closed", async () => {
    const { t, seed } = await seeded();
    const laterId = await t.run(async (ctx) =>
      ctx.db.insert("frolics", {
        groupId: seed.groupId,
        day: "2026-11-17",
        kind: "daily",
        planId: seed.planId,
        status: "faded",
        window: { start: seed.now + 86_400_000, end: seed.now + 90_000_000 },
        durationMinutes: 60,
        deadline: seed.now + 88_000_000,
      }),
    );
    const before = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(before.body.plan.title).toBe("Sunset at Indian Rock");

    await patchFrolic(t, laterId, { status: "open" });
    const after = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(after.status).toBe(200);
    expect(after.body.ok).toBe(true);
  });

  it("prefers a revealed plan over an older open one", async () => {
    const { t, seed } = await seeded();
    await patchFrolic(t, seed.frolicId, { status: "on", revealAt: seed.now - 1000, bloomAt: seed.now - 1000 });
    const result = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(result.body.phase).toBe("on");
  });
});

describe("tap refusals", () => {
  it("answers a which-friend question for a name outside the crew and a bad window", () => {
    expect(tapErrorAnswer({ code: "BAD_ONLY_IF" })).toEqual({ ok: false, error: "names_unclear", say: "Ask which friend they mean. Nothing was saved." });
    expect(tapErrorAnswer({ code: "BAD_WINDOW" })).toEqual({ ok: false, error: "time_unclear", say: "Ask for a time like 7 or 7:30. Nothing was saved." });
    expect(tapErrorAnswer({ code: "CLOSED" })?.error).toBe("closed");
    expect(tapErrorAnswer({ kind: "RateLimited" })?.error).toBe("slow_down");
    expect(tapErrorAnswer({ code: "SOMETHING_ELSE" })).toBeNull();
  });
});

describe("joining by text", () => {
  it("does not hand an app account to a stranger who has the invite code", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: MAYA_TEXT_PHONE, input: { invite_code: INVITE_CODE, first_name: "Maya" } });
    expect(result.body.ok).toBe(true);
    const maya = await t.run(async (ctx) => await ctx.db.get("users", seed.mayaId));
    expect(maya?.phone ?? null).toBeNull();
    const link = await t.run(async (ctx) => await ctx.db.query("keikiLinks").withIndex("by_phone", (q) => q.eq("phone", MAYA_TEXT_PHONE)).unique());
    expect(link?.userId).not.toBe(seed.mayaId);
  });

  it("keeps one entry per name in the friends list", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "join_crew", { phone: MAYA_TEXT_PHONE, input: { invite_code: INVITE_CODE, first_name: "Maya" } });
    expect(result.body.friends).toEqual(["Maya", "Dev", "Sam", "Ana"]);
    expect(seed.mayaId).toBeDefined();
  });
});

describe("im_free", () => {
  it("stays inert until the plan starter is on the deployment", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "im_free", { phone: SAM_PHONE });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toBe("not_ready");
    const direct = await t.mutation(internal.keiki.tools.imFree, { phone: SAM_PHONE, forMinutes: 90 });
    expect(direct).toMatchObject({ ok: false, error: "not_ready" });
    expect(await t.mutation(internal.keiki.tools.imFree, { phone: "not-a-phone", forMinutes: 90 })).toMatchObject({ ok: false, error: "not_in_a_crew" });
  });

  it("never says who started it and tells the agent not to", async () => {
    testEnv().KEIKI_IM_FREE = "1";
    vi.setSystemTime(new Date(nowFor()));
    const t = makeT(frolicsWithImFree);
    await seedCrew(t);
    const result = await toolResult(t, "im_free", { phone: SAM_PHONE, input: { for_minutes: 90 } });
    expect(result.body).toEqual({
      ok: true,
      started: true,
      say: "Say a plan is being made now and goes to the crew in a minute. Never name who started it. Tell them they are counted as down and will get the plan by text.",
    });
    expect(JSON.stringify(result.body)).not.toContain("Sam");
    delete testEnv().KEIKI_IM_FREE;
  });

  it("starts a real plan and tells the starter it is on its way", async () => {
    testEnv().KEIKI_IM_FREE = "1";
    vi.setSystemTime(new Date(nowFor()));
    const t = makeT();
    await seedCrew(t);
    const result = await toolResult(t, "im_free", { phone: SAM_PHONE, input: { for_minutes: 90 } });
    expect(result.body).toMatchObject({ ok: true, started: true });
    expect(JSON.stringify(result.body)).not.toContain("Sam");
    const again = await toolResult(t, "im_free", { phone: ANA_PHONE, input: { for_minutes: 90 } });
    expect(again.body).toMatchObject({ ok: true, started: false });
    delete testEnv().KEIKI_IM_FREE;
  });

  it("says the plan is already open without naming anyone", async () => {
    testEnv().KEIKI_IM_FREE = "1";
    vi.setSystemTime(new Date(nowFor()));
    const t = makeT(frolicsRefusingImFree);
    await seedCrew(t);
    const result = await toolResult(t, "im_free", { phone: SAM_PHONE });
    expect(result.body).toMatchObject({ ok: true, started: false });
    expect(result.body.say).toContain("today's plan is already open");
    expect(JSON.stringify(result.body)).not.toContain("Sam");
    delete testEnv().KEIKI_IM_FREE;
  });

  it("asks how long they are free for when the window is outside an hour to four", async () => {
    testEnv().KEIKI_IM_FREE = "1";
    const { t } = await seeded();
    const result = await toolResult(t, "im_free", { phone: SAM_PHONE, input: { for_minutes: 30 } });
    expect(result.body).toMatchObject({ ok: false, error: "bad_minutes" });
    delete testEnv().KEIKI_IM_FREE;
  });
});
describe("which day a texter is on", () => {
  it("takes today's open plan over a later open one", async () => {
    const { t, seed } = await seeded();
    const today = seed.day;
    const later = "2026-11-17";
    await t.run(async (ctx) => {
      await ctx.db.insert("frolics", {
        groupId: seed.groupId,
        day: later,
        kind: "daily",
        planId: seed.planId,
        status: "open",
        window: { start: seed.now + 86_400_000, end: seed.now + 90_000_000 },
        durationMinutes: 60,
        deadline: seed.now + 88_000_000,
      });
    });
    const result = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(result.body.plan.title).toBe("Sunset at Indian Rock");
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(seed.now));
    expect(today === local || today !== later).toBe(true);
  });
});