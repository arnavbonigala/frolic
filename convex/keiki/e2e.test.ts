import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANA_PHONE, SAM_PHONE, nowFor, seedCrew } from "../../keiki/test/seed";
import type { Seed, T } from "../../keiki/test/seed";
import {
  API_KEY,
  REVEAL_DELAY_MS,
  advance,
  attendeesOf,
  checkinsOf,
  etasOf,
  frolicOf,
  installFetch,
  linksOf,
  makeT,
  membershipsOf,
  patchFrolic,
  revealsOf,
  snapsOf,
  tapAs,
  tapsOf,
  testEnv,
  toolResult,
} from "../../keiki/test/harness";

const KAYAK_MAP_LINK = "https://maps.apple.com/?ll=37.866,-122.313";
const PHOTO = { url: "https://files.frolic.test/kayak-1.jpg", mime_type: "image/jpeg", size: 400 };
const CARD = { url: "https://files.frolic.test/kayak-location.vcf", mime_type: "text/vcard", size: 140 };

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

async function kayakDay(): Promise<{ t: T; seed: Seed }> {
  vi.setSystemTime(new Date(nowFor("kayaks")));
  const t = makeT();
  const seed = await seedCrew(t, { variant: "kayaks", samJoins: true });
  return { t, seed };
}

describe("the demo beat, start to finish", () => {
  it("runs the whole day over text and the app", async () => {
    const { t, seed } = await kayakDay();
    const fetchMock = installFetch({ mapLink: KAYAK_MAP_LINK });

    const joined = await toolResult(t, "join_crew", {
      phone: SAM_PHONE,
      input: { invite_code: "sunset", first_name: "Sam" },
    });
    expect(joined.body).toMatchObject({ ok: true, crew: "Sunset Crew", name: "Sam" });
    expect(await membershipsOf(t, seed.groupId)).toHaveLength(4);
    expect((await linksOf(t)).filter((link) => link.phone === SAM_PHONE)).toHaveLength(1);

    const today = await toolResult(t, "get_today", { phone: SAM_PHONE });
    expect(today.body.phase).toBe("open");
    expect(today.body.yourAnswer).toBeNull();
    expect(today.body.plan).toMatchObject({
      title: "Kayaks at the Berkeley Marina",
      startsAt: "9:30",
      cost: "$25",
    });

    const onlyIf = await toolResult(t, "tap_only_if", { phone: SAM_PHONE, input: { names: ["Maya"] } });
    expect(onlyIf.body).toMatchObject({ ok: true, answer: "only_if", onlyWith: ["Maya"] });

    await tapAs(t, seed.mayaId, seed.frolicId, "down", "app");
    expect((await frolicOf(t, seed.frolicId))?.status).toBe("open");
    await tapAs(t, seed.devId, seed.frolicId, "down", "notification");

    const pending = await revealsOf(t, seed.frolicId);
    expect(pending).toHaveLength(1);
    expect(pending[0].userIds).toHaveLength(3);
    const revealAt = pending[0].revealAt;
    expect((await frolicOf(t, seed.frolicId))?.status).toBe("open");
    expect(fetchMock.notices).toHaveLength(0);
    expect(await attendeesOf(t, seed.frolicId)).toHaveLength(0);

    await advance(t, REVEAL_DELAY_MS);

    const flipped = await frolicOf(t, seed.frolicId);
    expect(flipped?.status).toBe("on");
    expect(flipped?.revealAt).toBe(revealAt);
    expect(await attendeesOf(t, seed.frolicId)).toHaveLength(3);

    const samNotice = fetchMock.notices.find((notice) => notice.phone === SAM_PHONE);
    expect(samNotice).toBeDefined();
    expect(samNotice!.at).toBeGreaterThanOrEqual(revealAt);
    expect(samNotice!.text).toContain("It's on. You,");
    expect(samNotice!.text).toContain("Maya");
    expect(samNotice!.text).toContain("Dev");
    expect(samNotice!.text).toContain("Hold $5 to lock it in.");
    expect(fetchMock.notices.map((notice) => notice.phone).sort()).toEqual([SAM_PHONE, ANA_PHONE].sort());

    const reveal = await toolResult(t, "get_reveal", { phone: SAM_PHONE });
    expect(reveal.body.state).toBe("on");
    expect([...reveal.body.going].sort()).toEqual(["Dev", "Maya"]);

    const deposit = await toolResult(t, "pay_deposit", { phone: SAM_PHONE });
    expect(deposit.body).toMatchObject({ ok: true, amount: "$5", approvedWithFaceId: false });
    expect(deposit.body.url).toContain("https://whop.com/checkout/");

    const way = await toolResult(t, "on_my_way", { phone: SAM_PHONE, input: { minutes: 12 } });
    expect(way.body).toMatchObject({ ok: true, minutes: 12 });
    expect(await etasOf(t, seed.frolicId)).toHaveLength(1);

    const arrived = await toolResult(t, "check_in", {
      phone: SAM_PHONE,
      input: { attachment_id: "card" },
      context: { attachments: { card: CARD } },
    });
    expect(arrived.body).toEqual({ ok: true, checkedIn: true, viaLocation: true });
    expect(await checkinsOf(t, seed.frolicId)).toHaveLength(1);

    await patchFrolic(t, seed.frolicId, { snapAt: seed.now - 60_000 });
    const snap = await toolResult(t, "submit_snap", {
      phone: SAM_PHONE,
      input: { attachment_id: "photo" },
      context: { attachments: { photo: PHOTO } },
    });
    expect(snap.body).toMatchObject({ ok: true, added: true, collageUrl: null });
    expect(await snapsOf(t, seed.frolicId)).toHaveLength(1);
    expect(await tapsOf(t, seed.frolicId)).toHaveLength(3);
    expect(reveal.body.plan.title).toBe("Kayaks at the Berkeley Marina");
  });
});
