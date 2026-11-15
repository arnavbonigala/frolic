/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { ANA_PHONE, SAM_PHONE, linkPhone, nowFor, seedCrew } from "../../keiki/test/seed";
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
const SECRET_LINE = "Nobody sees you're down unless they are too. That goes for you as well.";
const SNAP = { url: "https://files.frolic.test/snap-1.jpg", mime_type: "image/jpeg", size: 300 };
const VCARD = { url: "https://files.frolic.test/location-1.vcf", mime_type: "text/vcard", size: 120 };

beforeEach(() => {
  vi.useFakeTimers();
  testEnv().KEIKI_API_KEY = API_KEY;
  delete testEnv().KEIKI_TOOL_SIGNING_SECRET;
  delete testEnv().KEIKI_AGENT_ID;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete testEnv().KEIKI_API_KEY;
  delete testEnv().KEIKI_TOOL_SIGNING_SECRET;
  delete testEnv().KEIKI_AGENT_ID;
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

  it("refuses a time after the plan wraps up", async () => {
    const { t, seed } = await seeded();
    const result = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { after: "9pm" } });
    expect(result.body).toMatchObject({ ok: false, error: "too_late" });
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(0);
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
    expect(result.body).toEqual({ ok: true, state: "faded", say: "Say it faded, gently, and mention tomorrow. No guilt." });
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

describe("pay_deposit", () => {
  it("pay_deposit preflight states the amount before asking for approval (blocked by convex/keiki/routes.ts:173 dropping the amount)", async () => {
    const { t } = await onNow({ variant: "kayaks" });
    const preflight = await toolResult(t, "pay_deposit", { phone: SAM_PHONE, context: { preflight: true } });
    expect(preflight.body).toEqual({ ok: true, amount: "$5", preflight: true });
    expect(preflight.text).not.toContain("whop.com");
  });

  it("returns the link on the approved call", async () => {
    const { t, seed } = await onNow({ variant: "kayaks" });
    const link = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(link.body).toMatchObject({
      ok: true,
      amount: "$5",
      approvedWithFaceId: false,
      say: "Send the link once. It comes back when they arrive.",
    });
    expect(link.body.url).toBe("https://whop.com/checkout/test_" + seed.frolicId + "_" + seed.samId);
  });

  it("shows the deposit to a member who is going", async () => {
    const { t } = await onNow({ variant: "kayaks" });
    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("on");
    expect(reveal.body.deposit).toEqual({ amount: "$5" });
  });

  it("says there is no deposit on a free plan", async () => {
    const { t } = await onNow();
    const result = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(result.body).toMatchObject({ ok: false, error: "no_deposit" });
  });
});

describe("remember", () => {
  it("stores the note", async () => {
    const { t } = await seeded();
    const result = await toolResult(t, "remember", { phone: SAM_PHONE, input: { text: "  Maya hates hikes.  " } });
    expect(result.body).toEqual({ ok: true, remembered: "Maya hates hikes." });
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
