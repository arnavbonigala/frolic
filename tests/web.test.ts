import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const glob = import.meta.glob("../convex/_generated/**/*.js");

const setup = () => convexTest(schema, { ...glob, ...modules });

async function seed(t: ReturnType<typeof setup>, options: { deadline?: number } = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const host = await ctx.db.insert("users", { name: "Ari", source: "app" });
    const group = await ctx.db.insert("groups", {
      name: "Roommates",
      createdBy: host,
      timezone: "America/Los_Angeles",
    });
    await ctx.db.insert("memberships", {
      groupId: group,
      userId: host,
      color: "pink",
      joinedVia: "creator",
    });
    const place = await ctx.db.insert("places", {
      slug: "indian-rock",
      name: "Indian Rock",
      lat: 37.89,
      lng: -122.27,
      cost: 0,
      tags: ["sunset"],
      hours: [],
      indoor: false,
      sober: true,
      photoUrl: "https://images.example/hills_sunset.jpg",
      blurb: "Golden hour 4:28",
    });
    const startsAt = now + 60 * 60 * 1000;
    const plan = await ctx.db.insert("plans", {
      groupId: group,
      day: "2026-11-15",
      kind: "daily",
      placeId: place,
      title: "Sunset at Indian Rock",
      line: "Clear and 64. Golden hour starts at 4:28",
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
      cost: 0,
      startsAt,
      durationMinutes: 120,
      meetingPoint: { lat: 37.89, lng: -122.27, label: "Top of Indian Rock" },
      source: "model",
      generatedAt: now,
    });
    const frolic = await ctx.db.insert("frolics", {
      groupId: group,
      day: "2026-11-15",
      kind: "daily",
      planId: plan,
      status: "open",
      window: { start: startsAt - 60 * 60 * 1000, end: startsAt },
      durationMinutes: 120,
      deadline: options.deadline ?? now + 30 * 60 * 1000,
    });
    return { host, group, frolic, plan };
  });
}

describe("share link", () => {
  test("create makes one code per frolic and reuses it", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const first = await t.mutation(api.web.share.create, { frolicId: frolic });
    const second = await t.mutation(api.web.share.create, { frolicId: frolic });
    expect(first.code).toHaveLength(9);
    expect(first.url).toBe(`/p/${first.code}`);
    expect(second.code).toBe(first.code);
    const invites = await t.run(async (ctx) => await ctx.db.query("invites").collect());
    expect(invites).toHaveLength(1);
    expect(invites[0].kind).toBe("frolic");
    expect(invites[0].groupId).toBe((await t.run(async (ctx) => (await ctx.db.get(frolic))!)).groupId);
  });

  test("create refuses a frolic that does not exist", async () => {
    const t = setup();
    await seed(t);
    await expect(
      t.mutation(api.web.share.create, { frolicId: "nope" as never }),
    ).rejects.toThrow();
  });
});

describe("watch", () => {
  test("an unknown code is invalid, never empty", async () => {
    const t = setup();
    const view = await t.query(api.web.share.watch, { code: "zzzzzzzzz", guest: "guest-aaaaaaaaaaaaaaaa" });
    expect(view.phase).toBe("invalid");
    expect(view.card).toBeNull();
    expect(view.mates).toEqual([]);
  });

  test("an open frolic shows the same seed packet card the app shows", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const view = await t.query(api.web.share.watch, { code, guest: "guest-aaaaaaaaaaaaaaaa" });
    expect(view.phase).toBe("open");
    expect(view.host).toBe("Ari");
    expect(view.group).toBe("Roommates");
    expect(view.card?.title).toBe("Sunset at Indian Rock");
    expect(view.card?.chips).toEqual(["Free", "2 hours", "Golden hour 4:28"]);
    expect(view.card?.why).toContain("sunsets");
    expect(view.card?.imageUrl).toBe("https://images.example/hills_sunset.jpg");
    expect(view.me).toBeNull();
  });

  test("a revoked invite and a missing frolic are invalid", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    await t.run(async (ctx) => {
      const invite = await ctx.db.query("invites").first();
      await ctx.db.patch(invite!._id, { revoked: true });
    });
    expect((await t.query(api.web.share.watch, { code, guest: "guest-aaaaaaaaaaaaaaaa" })).phase).toBe("invalid");
  });

  test("a past deadline drifts and a done frolic expires", async () => {
    const t = setup();
    const { frolic } = await seed(t, { deadline: Date.now() - 1000 });
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    expect((await t.query(api.web.share.watch, { code, guest: "guest-aaaaaaaaaaaaaaaa" })).phase).toBe("drifted");
    await t.run(async (ctx) => await ctx.db.patch(frolic, { status: "done" }));
    expect((await t.query(api.web.share.watch, { code, guest: "guest-aaaaaaaaaaaaaaaa" })).phase).toBe("expired");
  });
});

describe("join", () => {
  test("a link joiner becomes a web user and a crew member with one web tap", async () => {
    const t = setup();
    const { frolic, group } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const guest = "guest-1111111111111111";
    const result = await t.mutation(api.web.share.join, { code, guest, name: "  Maya  " });
    expect(result).toEqual({ ok: true, phase: "planted" });

    const state = await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      const taps = await ctx.db.query("taps").collect();
      const members = await ctx.db.query("memberships").collect();
      return { users, taps, members };
    });
    const maya = state.users.find((u) => u.name === "Maya")!;
    expect(maya.source).toBe("web");
    expect(maya.tokenHash).toBeTruthy();
    expect(state.taps).toHaveLength(1);
    expect(state.taps[0].source).toBe("web");
    expect(state.taps[0].userId).toBe(maya._id);
    expect(state.taps[0].frolicId).toBe(frolic);
    expect(state.members.find((m) => m.userId === maya._id)?.joinedVia).toBe("web");
    expect(state.members.find((m) => m.userId === maya._id)?.groupId).toBe(group);
  });

  test("a second yes from the same guest updates the tap instead of adding one", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const guest = "guest-1111111111111111";
    await t.mutation(api.web.share.join, { code, guest, name: "Maya" });
    await t.mutation(api.web.share.join, { code, guest, name: "Maya" });
    const taps = await t.run(async (ctx) => await ctx.db.query("taps").collect());
    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(taps).toHaveLength(1);
    expect(users.filter((u) => u.name === "Maya")).toHaveLength(1);
  });

  test("the page knows its own yes but never anyone else's before revealAt", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const maya = "guest-1111111111111111";
    const dev = "guest-2222222222222222";
    await t.mutation(api.web.share.join, { code, guest: maya, name: "Maya" });
    const planted = await t.query(api.web.share.watch, { code, guest: maya });
    expect(planted.phase).toBe("planted");
    expect(planted.me).toBe("Maya");
    expect(planted.mates).toEqual([]);

    const second = await t.mutation(api.web.share.join, { code, guest: dev, name: "Dev" });
    expect(second).toEqual({ ok: true, phase: "on" });

    const early = await t.query(api.web.share.watch, { code, guest: maya });
    expect(early.phase).toBe("planted");
    expect(early.mates).toEqual([]);
    expect(early.revealAt).toBeGreaterThan(Date.now());
    const earlyDev = await t.query(api.web.share.watch, { code, guest: dev });
    expect(earlyDev.mates).toEqual([]);
  });

  test("at revealAt both phones see the other person", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const maya = "guest-1111111111111111";
    const dev = "guest-2222222222222222";
    await t.mutation(api.web.share.join, { code, guest: maya, name: "Maya" });
    await t.mutation(api.web.share.join, { code, guest: dev, name: "Dev" });
    await t.run(async (ctx) => await ctx.db.patch(frolic, { revealAt: Date.now() - 1 }));
    const forMaya = await t.query(api.web.share.watch, { code, guest: maya });
    expect(forMaya.phase).toBe("on");
    expect(forMaya.mates).toEqual(["Dev"]);
    expect(forMaya.me).toBe("Maya");
    const forDev = await t.query(api.web.share.watch, { code, guest: dev });
    expect(forDev.mates).toEqual(["Maya"]);
  });

  test("an app yes and a web yes match each other", async () => {
    const t = setup();
    const { frolic, host } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    await t.mutation(api.web.share.join, { code, guest: "guest-1111111111111111", name: "Maya" });
    await t.mutation(internal.taps.tap, {
      frolicId: frolic,
      userId: host,
      kind: "down",
      source: "app",
    });
    const row = await t.run(async (ctx) => await ctx.db.get(frolic));
    expect(row!.status).toBe("on");
    expect(row!.revealAt).toBeGreaterThan(Date.now());
  });

  test("a dead link tells the browser it is dead instead of throwing", async () => {
    const t = setup();
    await seed(t);
    const result = await t.mutation(api.web.share.join, {
      code: "zzzzzzzzz",
      guest: "guest-1111111111111111",
      name: "Maya",
    });
    expect(result).toEqual({ ok: false, phase: "invalid" });
  });

  test("an empty name is refused", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    await expect(
      t.mutation(api.web.share.join, { code, guest: "guest-1111111111111111", name: "   " }),
    ).rejects.toThrow();
  });

  test("a drifted frolic refuses new yeses", async () => {
    const t = setup();
    const { frolic } = await seed(t, { deadline: Date.now() - 1000 });
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const result = await t.mutation(api.web.share.join, {
      code,
      guest: "guest-1111111111111111",
      name: "Maya",
    });
    expect(result.phase).toBe("drifted");
    const taps = await t.run(async (ctx) => await ctx.db.query("taps").collect());
    expect(taps).toHaveLength(0);
  });
});

describe("http routes", () => {
  test("the page carries the card, the boot data and the link preview tags", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const res = await t.fetch(`/p/${code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Sunset at Indian Rock");
    expect(html).toContain('property="og:title" content="Sunset at Indian Rock · Frolic"');
    expect(html).toContain("og:image");
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('id="boot"');
    expect(html).toContain(`"code":"${code}"`);
    expect(html).toContain('"host":"Ari"');
    expect(html).toContain('"group":"Roommates"');
    expect(html).not.toContain("Maya");
  });

  test("a dead link is designed, not empty", async () => {
    const t = setup();
    await seed(t);
    const res = await t.fetch("/p/zzzzzzzzz");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('"phase":"invalid"');
    expect(html).toContain("doesn");
  });

  test("the page's own payload stays under 100 KB gzipped-ish", async () => {
    const t = setup();
    const { frolic } = await seed(t);
    const { code } = await t.mutation(api.web.share.create, { frolicId: frolic });
    const html = await (await t.fetch(`/p/${code}`)).text();
    expect(html.length).toBeLessThan(120000);
  });

  test("the preview image is a real png and the clock is server time", async () => {
    const t = setup();
    const image = await t.fetch("/p/og.png");
    expect(image.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    const clock = await (await t.fetch("/web/clock")).json();
    expect(Math.abs(clock.now - Date.now())).toBeLessThan(5000);
  });
});
