/// <reference types="vite/client" />
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { hashToken } from "../../convex/lib/identity";
import { addDays } from "../../convex/plans/time";
import type { T } from "./setup.helpers";
import { token } from "./setup.helpers";

export const TODAY = "2026-11-15";
export const DAY_MS = 24 * 60 * 60 * 1000;

const FIRST = [
  "Maya", "Dev", "Jordan", "Priya", "Sam", "Noor", "Theo", "Iris",
  "Kai", "Lena", "Owen", "Rosa", "Milo", "Ada", "Finn", "Zoe",
  "Hugo", "Nina", "Ezra", "Cleo", "Ravi", "Tess", "Jonah", "Wren",
  "Otto", "Sara", "Leo", "June", "Abel", "Mina", "Cyrus", "Nora",
];
const LAST = ["R", "K", "P", "S", "T", "V", "A", "B"];

export const PERF_NAMES = FIRST.flatMap((first, i) => (i < 8 ? LAST.map((last) => `${first} ${last}`) : [`${first}`]));

const COLORS = ["pink", "cobalt", "moss", "marigold", "tomato", "lilac"] as const;
const TAGS = ["sunsets", "outdoors", "late_night_food", "games", "free", "views"];
const SLUGS = ["big-c", "indian-rock", "cheese-board", "strawberry-canyon", "the-marina", "bart-to-sf"];

function place(index: number) {
  const slug = SLUGS[index % SLUGS.length];
  return {
    slug,
    name: slug.replace(/-/g, " "),
    neighborhood: "Berkeley",
    lat: 37.87,
    lng: -122.27,
    cost: index % 3 === 0 ? 0 : 12,
    tags: [TAGS[index % TAGS.length], TAGS[(index + 2) % TAGS.length]],
    hours: [{ day: 0, open: 480, close: 1320 }],
    bestTime: "goldenHour" as const,
    indoor: index % 2 === 0,
    sober: true,
    title: slug,
    address: "Berkeley, CA",
    costPerPersonCents: index % 3 === 0 ? 0 : 1200,
    costLabel: index % 3 === 0 ? "Free" : "$12",
    payUpFront: false,
    priceVerified: true,
    energy: "chill" as const,
    needsDaylight: false,
    durationMinutes: 90,
    meetSpot: "the entrance",
    source: "seed",
  };
}

export type PerfCrew = {
  groupId: Id<"groups">;
  userIds: Id<"users">[];
  names: string[];
  todayFrolicId: Id<"frolics">;
  onFrolicId: Id<"frolics">;
  doneFrolicId: Id<"frolics">;
  snapAt: number;
};

export async function seedPerf(
  t: T,
  opts: { members?: number; days?: number; frolicsPerDay?: number; taps?: number; decoySnaps?: number } = {},
): Promise<PerfCrew> {
  const memberCount = opts.members ?? 40;
  const days = opts.days ?? 60;
  const frolicsPerDay = opts.frolicsPerDay ?? 5;
  const tapCount = opts.taps ?? 900;
  const names = PERF_NAMES.slice(0, memberCount);
  const created = await t.mutation(api.users.createGroup, {
    deviceToken: token(names[0]),
    firstName: names[0],
    groupName: "Sunset Crew",
  });
  const hashes = await Promise.all(names.map((name) => hashToken(token(name))));
  const now = Date.UTC(2026, 10, 15, 20, 0, 0);

  return await t.run(async (ctx) => {
    const userIds: Id<"users">[] = [created.userId];
    for (let i = 1; i < names.length; i++) {
      userIds.push(
        await ctx.db.insert("users", { name: names[i], source: "app", tokenHash: hashes[i] }),
      );
    }
    for (let i = 1; i < names.length; i++) {
      await ctx.db.insert("memberships", {
        groupId: created.groupId,
        userId: userIds[i],
        color: COLORS[i % COLORS.length],
        joinedVia: "invite",
      });
    }
    const placeIds: Id<"places">[] = [];
    for (let i = 0; i < SLUGS.length; i++) placeIds.push(await ctx.db.insert("places", place(i)));

    const blob = await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
    const decoyBlob = await ctx.storage.store(new Blob([new Uint8Array([4, 5, 6])], { type: "image/jpeg" }));

    let planCursor = 0;
    let todayFrolicId: Id<"frolics"> | null = null;
    let onFrolicId: Id<"frolics"> | null = null;
    let doneFrolicId: Id<"frolics"> | null = null;
    const frolicIds: Id<"frolics">[] = [];
    const snapAt = now - 60 * 60 * 1000;

    for (let d = days - 1; d >= 0; d--) {
      const day = addDays(TODAY, -d);
      const dayStart = now - d * DAY_MS;
      for (let slot = 0; slot < frolicsPerDay; slot++) {
        const placeId = placeIds[planCursor % placeIds.length];
        const planId = await ctx.db.insert("plans", {
          groupId: created.groupId,
          day,
          kind: "daily",
          placeId,
          title: `Sunset at ${SLUGS[planCursor % SLUGS.length]}`,
          line: "Clear and 64. Golden hour starts at 4:28.",
          cost: planCursor % 3 === 0 ? 0 : 12,
          startsAt: dayStart - 4 * 60 * 60 * 1000,
          durationMinutes: 90,
          source: "scorer",
          generatedAt: dayStart - 8 * 60 * 60 * 1000,
          costLabel: planCursor % 3 === 0 ? "Free" : "$12",
          payUpFront: false,
          chips: ["sunsets", "free"],
          whySource: "template",
          whyInputs: { placeName: SLUGS[planCursor % SLUGS.length], topTags: ["sunsets"], rainSwap: false },
          weatherSwap: false,
        });
        planCursor++;
        const isToday = d === 0;
        const status = isToday ? (slot === 0 ? "open" : slot === 1 ? "on" : "faded") : slot === 4 ? "faded" : "done";
        const startsAt = isToday ? now + 2 * 60 * 60 * 1000 : dayStart - 4 * 60 * 60 * 1000;
        const frolicId = await ctx.db.insert("frolics", {
          groupId: created.groupId,
          day,
          kind: "daily",
          planId,
          status,
          window: { start: startsAt - 60 * 60 * 1000, end: startsAt + 4 * 60 * 60 * 1000 },
          durationMinutes: 90,
          deadline: startsAt - 60 * 60 * 1000,
          matchedAt: status === "open" ? undefined : startsAt - 2 * 60 * 60 * 1000,
          revealAt: status === "open" ? undefined : startsAt - 2 * 60 * 60 * 1000,
          bloomAt: status === "open" ? undefined : startsAt - 2 * 60 * 60 * 1000 + 800,
          startsAt: status === "open" ? undefined : startsAt,
          endsAt: status === "open" ? undefined : startsAt + 90 * 60 * 1000,
          snapAt: status === "done" ? snapAt : undefined,
          origin: "daily",
        });
        frolicIds.push(frolicId);
        if (isToday && slot === 1) {
          for (let m = 4; m < userIds.length; m++) {
            await ctx.db.insert("attendees", {
              frolicId,
              groupId: created.groupId,
              userId: userIds[m],
              role: "hopIn",
              status: "sittingOut",
              revealAt: startsAt - 2 * 60 * 60 * 1000,
              bloomAt: startsAt - 2 * 60 * 60 * 1000 + 800,
            });
          }
        }
        if (isToday && slot === 0) todayFrolicId = frolicId;
        if (isToday && slot === 1) onFrolicId = frolicId;
        if (!isToday && slot === 0 && d === 2) doneFrolicId = frolicId;
        if (status !== "open") {
          for (let m = 0; m < 4; m++) {
            await ctx.db.insert("attendees", {
              frolicId,
              groupId: created.groupId,
              userId: userIds[(slot + m * 7 + d) % userIds.length],
              role: m === 0 ? "matched" : "hopIn",
              status: m === 3 ? "sittingOut" : "going",
              revealAt: startsAt - 2 * 60 * 60 * 1000,
              bloomAt: startsAt - 2 * 60 * 60 * 1000 + 800,
            });
          }
          if (d <= 20 || (isToday && slot === 1)) {
            for (let s = 0; s < 3; s++) {
              await ctx.db.insert("snaps", {
                frolicId,
                groupId: created.groupId,
                userId: userIds[(slot + s * 5) % userIds.length],
                storageId: blob,
                snapAt,
                takenAt: snapAt + s * 1000,
              });
            }
            await ctx.db.insert("collages", {
              frolicId,
              groupId: created.groupId,
              storageId: blob,
              createdAt: snapAt + 60_000,
            });
          }
        }
      }
      await ctx.db.insert("dailyPicks", {
        groupId: created.groupId,
        day,
        questionId: await ctx.db.insert("dailyPickQuestions", {
          key: `q-${d % 12}`,
          category: "food",
          text: "What sounds good tonight?",
          options: [
            { label: "Tacos", tags: ["late_night_food"] },
            { label: "Sunset", tags: ["sunsets"] },
            { label: "Board games", tags: ["games"] },
          ],
        }),
        questionKey: `q-${d % 12}`,
        category: "food",
        answers: d % 2 === 0 ? 4 : 0,
      });
    }

    for (let m = 0; m < userIds.length; m++) {
      await ctx.db.insert("availability", {
        groupId: created.groupId,
        userId: userIds[m],
        day: TODAY,
        state: m % 5 === 0 ? "busy" : "window",
        window: m % 5 === 0 ? undefined : { start: now, end: now + 4 * 60 * 60 * 1000 },
        minutesAway: 12,
        updatedAt: now,
      });
      await ctx.db.insert("dailyPickAnswers", {
        groupId: created.groupId,
        day: TODAY,
        userId: userIds[m],
        option: m % 2 === 0 ? "Tacos" : "Sunset",
        answeredAt: now,
      });
      if (m < 10) {
        await ctx.db.insert("etas", {
          frolicId: onFrolicId!,
          userId: userIds[m],
          minutes: 6 + m,
          onTheWay: m % 2 === 0,
          updatedAt: now,
        });
      }
    }

    for (let i = 0; i < tapCount; i++) {
      const frolicId = i < 40 ? todayFrolicId! : frolicIds[(i * 7) % frolicIds.length];
      const userId = userIds[i % userIds.length];
      const existing = await ctx.db
        .query("taps")
        .withIndex("by_frolicId_and_userId", (q) => q.eq("frolicId", frolicId).eq("userId", userId))
        .unique();
      const doc = {
        frolicId,
        groupId: created.groupId,
        userId,
        kind: i % 11 === 0 ? ("notToday" as const) : ("down" as const),
        onlyIf: [] as Id<"users">[],
        source: "app" as const,
        updatedAt: now - i * 1000,
      };
      if (existing) await ctx.db.replace("taps", existing._id, doc);
      else await ctx.db.insert("taps", doc);
    }

    for (const entry of ["deposit", "payout", "deposit"] as const) {
      await ctx.db.insert("fundLedger", {
        groupId: created.groupId,
        frolicId: doneFrolicId ?? undefined,
        entry,
        amountCents: entry === "payout" ? -800 : 1000,
        at: now - DAY_MS,
      });
    }
    await ctx.db.insert("tasteProfiles", {
      groupId: created.groupId,
      tags: ["sunsets", "free"],
      updatedAt: now,
    });
    for (const tag of TAGS) {
      await ctx.db.insert("memoryTagStats", {
        groupId: created.groupId,
        tag,
        liked: 4,
        skipped: 1,
        updatedAt: now,
      });
    }

    const decoys = opts.decoySnaps ?? 0;
    for (let i = 0; i < decoys; i++) {
      await ctx.db.insert("snaps", {
        frolicId: doneFrolicId!,
        groupId: created.groupId,
        userId: userIds[((i + 1) % (userIds.length - 1)) + 1],
        storageId: decoyBlob,
        snapAt: snapAt - (i + 1) * 60_000,
        takenAt: now,
      });
    }

    return {
      groupId: created.groupId,
      userIds,
      names,
      todayFrolicId: todayFrolicId!,
      onFrolicId: onFrolicId!,
      doneFrolicId: doneFrolicId!,
      snapAt,
    };
  });
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
