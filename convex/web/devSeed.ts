import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const seed = internalMutation({
  args: { mode: v.optional(v.union(v.literal("open"), v.literal("drifted"), v.literal("done"))) },
  returns: v.object({ frolicId: v.string(), inviteCode: v.string() }),
  handler: async (ctx, args): Promise<{ frolicId: string; inviteCode: string }> => {
    const now = Date.now();
    const host = await ctx.db.insert("users", {
      name: "Ari",
      source: "app",
      tokenHash: "seeded-ari",
    });
    const groupId = await ctx.db.insert("groups", {
      name: "Roommates",
      createdBy: host,
      timezone: "America/Los_Angeles",
    });
    await ctx.db.insert("memberships", {
      groupId,
      userId: host,
      color: "pink",
      joinedVia: "creator",
    });
    const place = await ctx.db.insert("places", {
      slug: `indian-rock-${now}`,
      name: "Indian Rock",
      neighborhood: "Berkeley",
      lat: 37.8925,
      lng: -122.2727,
      cost: 0,
      tags: ["sunset", "rock"],
      hours: [],
      indoor: false,
      sober: true,
      photoUrl: "https://raw.githubusercontent.com/arnavbonigala/frolic/main/design/mock/img/hills_sunset.jpg",
      blurb: "Golden hour 4:28",
      title: "Sunset at Indian Rock",
      address: "Indian Rock Path, Berkeley",
      costPerPersonCents: 0,
      costLabel: "Free",
      payUpFront: false,
      priceVerified: true,
      energy: "chill",
      needsDaylight: true,
      durationMinutes: 120,
      meetSpot: "Top of Indian Rock",
      source: "seed",
    });
    const startsAt = now + 3 * 60 * 60 * 1000;
    const plan = await ctx.db.insert("plans", {
      groupId,
      day: "2026-11-15",
      kind: "daily",
      placeId: place,
      title: "Sunset at Indian Rock",
      line: "Clear and 64. Golden hour starts at 4:28",
      why: "you're into sunsets, it's free, and the sky's clear until dark.",
      cost: 0,
      startsAt,
      durationMinutes: 120,
      meetingPoint: { lat: 37.8925, lng: -122.2727, label: "Top of Indian Rock" },
      source: "model",
      generatedAt: now,
      costLabel: "Free",
      payUpFront: false,
      chips: ["Free", "2 hours", "Golden hour 4:28"],
      whySource: "template",
      whyInputs: { placeName: "Indian Rock", topTags: ["sunset"], rainSwap: false },
      weatherSwap: false,
    });
    const mode: "open" | "drifted" | "done" = args.mode ?? "open";
    const frolic = await ctx.db.insert("frolics", {
      groupId,
      day: "2026-11-15",
      kind: "solo",
      planId: plan,
      status: mode === "done" ? ("done" as const) : ("open" as const),
      window: { start: now, end: now + 6 * 60 * 60 * 1000 },
      durationMinutes: 120,
      deadline: mode === "drifted" ? now - 60 * 1000 : now + 6 * 3600 * 1000,
    });
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    await ctx.db.insert("invites", {
      code,
      groupId,
      createdBy: host,
      kind: "frolic",
      frolicId: frolic,
      revoked: false,
    });
    return { frolicId: frolic as string, inviteCode: code };
  },
});

export const frolicInvite = internalMutation({
  args: { frolicId: v.id("frolics") },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const frolic = await ctx.db.get(args.frolicId);
    if (!frolic) throw new Error("no frolic");
    const code = Math.random().toString(36).slice(2, 11).toUpperCase();
    const creator = await ctx.db
      .query("memberships")
      .withIndex("by_groupId", (q) => q.eq("groupId", frolic.groupId))
      .first();
    await ctx.db.insert("invites", {
      code,
      groupId: frolic.groupId,
      createdBy: creator!.userId,
      kind: "frolic",
      frolicId: args.frolicId,
      revoked: false,
    });
    return code;
  },
});

export const who = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const frolics = await ctx.db.query("frolics").collect();
    const reveals = await ctx.db.query("reveals").collect();
    const attendees = await ctx.db.query("attendees").collect();
    return {
      frolics: frolics.map((f) => ({ id: f._id, status: f.status, revealAt: f.revealAt ?? null })),
      reveals: reveals.length,
      attendees: attendees.length,
    };
  },
});

export const users = internalQuery({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("users").collect();
    return rows.map((u) => ({ name: u.name, source: u.source }));
  },
});
