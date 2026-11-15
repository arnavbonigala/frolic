import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { NOON, flipDue, makeT, setupCrew, tap, token, type Crew } from "./backend/setup.helpers";
import { heroKey } from "../convex/web/hero";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => {
  vi.useRealTimers();
});

async function planned(t: ReturnType<typeof makeT>, crew: Crew, tags: string[] = ["sunset"]): Promise<Crew> {
  const now = Date.now();
  const planId = await t.run(async (ctx) => {
    const placeId = await ctx.db.insert("places", {
      slug: `indian-rock-${now}`,
      name: "Indian Rock",
      neighborhood: "Berkeley",
      lat: 37.8925,
      lng: -122.2727,
      cost: 0,
      tags,
      hours: [],
      indoor: false,
      sober: true,
      photoUrl: "https://images.example/hills_sunset.jpg",
      blurb: "Golden hour 4:28",
      title: "Sunset at Indian Rock",
      address: "Indian Rock Path, Berkeley",
      costPerPersonCents: 0,
      costLabel: "Free",
      payUpFront: false,
      priceVerified: true,
      energy: "chill" as const,
      needsDaylight: true,
      durationMinutes: 120,
      meetSpot: "Top of Indian Rock",
      source: "seed",
    });
    return await ctx.db.insert("plans", {
      groupId: crew.groupId,
      day: "2026-11-15",
      kind: "daily" as const,
      placeId,
      title: "Sunset at Indian Rock",
      line: "Clear and 64. Golden hour starts at 4:28",
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
      cost: 0,
      startsAt: now + 3600 * 1000,
      durationMinutes: 120,
      meetingPoint: { lat: 37.8925, lng: -122.2727, label: "Top of Indian Rock" },
      source: "model" as const,
      generatedAt: now,
      costLabel: "Free",
      payUpFront: false,
      chips: ["Free", "2 hours", "Golden hour 4:28"],
      whySource: "template" as const,
      whyInputs: { placeName: "Indian Rock", topTags: ["sunset"], rainSwap: false },
      weatherSwap: false,
    });
  });
  const frolicId = await t.mutation(internal.frolics.open, {
    groupId: crew.groupId,
    day: "2026-11-15",
    kind: "daily",
    planId,
    window: { start: now + 3600 * 1000, end: now + 6 * 3600 * 1000 },
    durationMinutes: 120,
    deadline: crew.frolicId ? now + 4 * 3600 * 1000 : now + 4 * 3600 * 1000,
  });
  return { ...crew, frolicId };
}

async function shareLink(t: ReturnType<typeof makeT>, crew: Crew) {
  return await t.mutation(api.web.share.create, {
    frolicId: crew.frolicId,
    deviceToken: token("Maya"),
  });
}

describe("the share link the app sends to the group chat", () => {
  test("make one link per frolic, and it comes back as a full url", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev"]));
    const link = await t.mutation(api.web.share.create, {
      frolicId: crew.frolicId,
      deviceToken: token("Maya"),
    });
    expect(link.code.length).toBeGreaterThan(6);
    expect(link.url.endsWith(`/p/${link.code}`)).toBe(true);
  });

  test("a stranger cannot mint a link for a crew they are not in", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    await expect(
      t.mutation(api.web.share.create, {
        frolicId: crew.frolicId,
        deviceToken: token("Stranger"),
      }),
    ).rejects.toThrow();
  });
});

describe("what the page can see", () => {
  test("an unknown code is invalid, never an empty plan", async () => {
    const t = makeT();
    const view = await t.query(api.web.share.watch, { code: "nosuchcod", deviceToken: token("Nobody") });
    expect(view.phase).toBe("invalid");
    expect(view.card).toBeNull();
    expect(view.mates).toEqual([]);
  });

  test("before joining, the page shows the same seed packet the app shows", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev"]));
    const link = await shareLink(t, crew);
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Guest") });
    expect(view.phase).toBe("open");
    expect(view.host).toBe("Maya");
    expect(view.group).toBe("Sunset Crew");
    expect(view.card?.title).toBe("Sunset at Indian Rock");
    expect(view.me).toBeNull();
  });

  test("the card image comes from the plan's taste tag, and falls back to the place photo", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev"]));
    const link = await shareLink(t, crew);
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Guest") });
    expect(view.card?.imageUrl).toBe("/p/hero/plan-sunsets.jpg");
    expect(heroKey(["Sunsets"])).toBe("plan-sunsets");
    expect(heroKey(["Late-night food"])).toBe("plan-late-night-food");
    expect(heroKey(["Games"])).toBe("plan-games");
    expect(heroKey(["Free stuff"])).toBe("plan-free-stuff");
    expect(heroKey(["nothing in particular"])).toBeNull();
  });

  test("a revoked invite is invalid", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const link = await shareLink(t, crew);
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invites")
        .withIndex("by_code", (q) => q.eq("code", link.code))
        .unique();
      await ctx.db.patch(invite!._id, { revoked: true });
    });
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Guest") });
    expect(view.phase).toBe("invalid");
  });
});

describe("a link joiner", () => {
  test("lands in the crew with no account and one web yes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const link = await shareLink(t, crew);
    const guest = token("Priya");
    const result = await t.mutation(api.web.share.join, { code: link.code, deviceToken: guest, name: "  Priya  " });
    expect(result).toEqual({ ok: true, phase: "planted" });

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      taps: await ctx.db.query("taps").collect(),
      memberships: await ctx.db.query("memberships").collect(),
    }));
    const priya = state.users.find((u) => u.name === "Priya")!;
    expect(priya.source).toBe("web");
    expect(priya.tokenHash).toBeTruthy();
    const mine = state.taps.filter((row) => row.frolicId === crew.frolicId);
    expect(mine).toHaveLength(1);
    expect(mine[0].source).toBe("web");
    expect(mine[0].kind).toBe("down");
    expect(mine[0].userId).toBe(priya._id);
    const membership = state.memberships.find((m) => m.userId === priya._id && m.groupId === crew.groupId);
    expect(membership?.joinedVia).toBe("web");
  });

  test("a second yes from the same phone updates the tap instead of adding one", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const link = await shareLink(t, crew);
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    const state = await t.run(async (ctx) => ({
      taps: await ctx.db.query("taps").collect(),
      users: await ctx.db.query("users").collect(),
    }));
    expect(state.taps.filter((row) => row.frolicId === crew.frolicId)).toHaveLength(1);
    expect(state.users.filter((u) => u.name === "Priya")).toHaveLength(1);
  });

  test("an empty first name is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const link = await shareLink(t, crew);
    await expect(
      t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "   " }),
    ).rejects.toThrow();
  });

  test("a dead link says it is dead instead of throwing at the page", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya"]);
    const result = await t.mutation(api.web.share.join, {
      code: "nosuchcod",
      deviceToken: token("Priya"),
      name: "Priya",
    });
    expect(result).toEqual({ ok: false, phase: "invalid" });
  });
});

describe("secrecy until revealAt", () => {
  test("a web yes and an app yes match, and neither phone learns names before revealAt", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev", "Jordan"]));
    const link = await shareLink(t, crew);
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });

    const planted = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(planted.phase).toBe("planted");
    expect(planted.me).toBe("Priya");
    expect(planted.mates).toEqual([]);

    const jordanBefore = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Jordan") });
    expect(jordanBefore.phase).toBe("open");

    await tap(t, crew, "Dev");

    const primed = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(primed.phase).toBe("planted");
    expect(primed.mates).toEqual([]);
    expect(primed.revealAt).toBeNull();
    const jordanMid = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Jordan") });
    expect(jordanMid.phase).toBe("open");
    expect(jordanMid.mates).toEqual([]);

    await flipDue(t);

    const revealed = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(revealed.phase).toBe("on");
    expect(revealed.mates).toEqual([{ name: "Dev", avatarUrl: null }]);
    expect(revealed.me).toBe("Priya");
    expect(revealed.meet).toBe("Top of Indian Rock");
    expect(revealed.revealAt).toBeGreaterThanOrEqual(NOON + 1500);
    expect(revealed.revealAt).toBeLessThanOrEqual(NOON + 1600);
  });

  test("a mate's flower carries their absolute portrait url when they have one", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev", "Jordan"]));
    const link = await shareLink(t, crew);
    await t.run(async (ctx) => await ctx.db.patch(crew.ids.Dev, { avatarUrl: "/p/avatar/dev.jpg" }));
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    await t.run(async (ctx) => {
      const priya = (await ctx.db.query("users").collect()).find((u) => u.name === "Priya")!;
      await ctx.db.patch(priya._id, { avatarUrl: "/p/avatar/priya.jpg" });
    });
    await tap(t, crew, "Dev");
    await flipDue(t);
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(view.mates).toHaveLength(1);
    expect(view.mates[0].name).toBe("Dev");
    expect(view.mates[0].avatarUrl?.endsWith("/p/avatar/dev.jpg")).toBe(true);
    expect(view.avatar?.endsWith("/p/avatar/priya.jpg")).toBe(true);
  });

  test("nothing in the page's own facts exposes another guest's yes", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const link = await shareLink(t, crew);
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Priya"), name: "Priya" });
    await t.mutation(api.web.share.join, { code: link.code, deviceToken: token("Sam"), name: "Sam" });
    const before = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(JSON.stringify(before)).not.toContain("Sam");
    await flipDue(t);
    const after = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(after.mates).toEqual([{ name: "Sam", avatarUrl: null }]);
  });
});

describe("dead ends", () => {
  test("a frolic past its deadline drifts and refuses new yeses", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"], { deadlineIn: -1000 });
    const link = await shareLink(t, crew);
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(view.phase).toBe("drifted");
    const result = await t.mutation(api.web.share.join, {
      code: link.code,
      deviceToken: token("Priya"),
      name: "Priya",
    });
    expect(result.phase).toBe("drifted");
  });

  test("a frolic that already happened expires", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const link = await shareLink(t, crew);
    await t.run(async (ctx) => await ctx.db.patch(crew.frolicId, { status: "done" as const }));
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Priya") });
    expect(view.phase).toBe("expired");
  });
});

describe("http routes", () => {
  test("the page carries the card, the boot data and the iMessage preview tags", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya", "Dev"]));
    const link = await shareLink(t, crew);
    const res = await t.fetch(`/p/${link.code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Sunset at Indian Rock");
    expect(html).toContain('property="og:title" content="Sunset at Indian Rock · Frolic"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('id="boot"');
    expect(html).toContain(`"code":"${link.code}"`);
    expect(html).toContain('"host":"Maya"');
    expect(html).toContain('"group":"Sunset Crew"');
    expect(html).toContain("Nobody sees you");
    expect(html).not.toContain("Dev");
  });

  test("a dead link renders a designed page, not a blank one", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya"]);
    const html = await (await t.fetch("/p/nosuchcod")).text();
    expect(html).toContain('"phase":"invalid"');
    expect(html).toContain("Frolic");
  });

  test("the whole page fits in a small payload", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya"]);
    const link = await shareLink(t, crew);
    const html = await (await t.fetch(`/p/${link.code}`)).text();
    expect(html.length).toBeLessThan(120000);
  });

  test("a painted plan hero is served with a year of cache and never leaks a path", async () => {
    const t = makeT();
    const hero = await t.fetch("/p/hero/plan-sunsets.jpg");
    expect(hero.status).toBe(200);
    expect(hero.headers.get("content-type")).toBe("image/jpeg");
    expect(hero.headers.get("cache-control")).toContain("immutable");
    const bytes = new Uint8Array(await hero.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes.length).toBeGreaterThan(20000);
    expect((await t.fetch("/p/hero/nosuchhero.jpg")).status).toBe(404);
    expect((await t.fetch("/p/hero/../../etc/passwd")).status).toBe(404);
  });

  test("a place no painted hero covers falls back to its own photo", async () => {
    const t = makeT();
    const crew = await planned(t, await setupCrew(t, ["Maya"]), ["darts"]);
    const link = await shareLink(t, crew);
    const view = await t.query(api.web.share.watch, { code: link.code, deviceToken: token("Guest") });
    expect(view.card?.imageUrl).toBe("https://images.example/hills_sunset.jpg");
  });

  test("the preview image is a real png", async () => {
    const t = makeT();
    const image = await t.fetch("/p/og.png");
    expect(image.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes.length).toBeGreaterThan(20000);
  });
});
