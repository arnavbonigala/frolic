import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const flowerColor = v.union(
  v.literal("pink"),
  v.literal("cobalt"),
  v.literal("moss"),
  v.literal("marigold"),
  v.literal("tomato"),
  v.literal("lilac"),
);

export const energy = v.union(v.literal("chill"), v.literal("anything"));

export const timeWindow = v.object({ start: v.number(), end: v.number() });

export const frolicStatus = v.union(
  v.literal("open"),
  v.literal("on"),
  v.literal("faded"),
  v.literal("done"),
);

export const tapKind = v.union(v.literal("down"), v.literal("notToday"));

export const tapSource = v.union(
  v.literal("app"),
  v.literal("web"),
  v.literal("notification"),
  v.literal("imessage"),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    photoId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    tokenHash: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.union(v.literal("app"), v.literal("web"), v.literal("imessage")),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_phone", ["phone"]),

  groups: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    timezone: v.string(),
    holdEnabled: v.optional(v.boolean()),
    e2eRun: v.optional(v.string()),
  }).index("by_e2eRun", ["e2eRun"]),

  memberships: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    color: flowerColor,
    joinedVia: v.union(
      v.literal("creator"),
      v.literal("invite"),
      v.literal("web"),
      v.literal("imessage"),
    ),
  })
    .index("by_groupId", ["groupId"])
    .index("by_userId", ["userId"])
    .index("by_groupId_and_userId", ["groupId", "userId"]),

  invites: defineTable({
    code: v.string(),
    groupId: v.id("groups"),
    createdBy: v.id("users"),
    kind: v.union(v.literal("group"), v.literal("frolic")),
    frolicId: v.optional(v.id("frolics")),
    expiresAt: v.optional(v.number()),
    revoked: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_groupId_and_kind", ["groupId", "kind"])
    .index("by_frolicId", ["frolicId"]),

  availability: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    day: v.string(),
    state: v.union(v.literal("now"), v.literal("window"), v.literal("busy")),
    window: v.optional(timeWindow),
    minutesAway: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_groupId_and_day", ["groupId", "day"])
    .index("by_groupId_and_userId_and_day", ["groupId", "userId", "day"]),

  limits: defineTable({
    userId: v.id("users"),
    budgetCap: v.optional(v.number()),
    energy: v.optional(energy),
    maxMinutes: v.optional(v.number()),
    homeBy: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  places: defineTable({
    slug: v.string(),
    name: v.string(),
    neighborhood: v.optional(v.string()),
    lat: v.number(),
    lng: v.number(),
    cost: v.number(),
    tags: v.array(v.string()),
    hours: v.array(
      v.object({ day: v.number(), open: v.number(), close: v.number() }),
    ),
    bestTime: v.optional(
      v.union(
        v.literal("goldenHour"),
        v.literal("lateNight"),
        v.literal("daytime"),
        v.literal("anytime"),
      ),
    ),
    indoor: v.boolean(),
    sober: v.boolean(),
    photoUrl: v.optional(v.string()),
    blurb: v.optional(v.string()),
    capacity: v.optional(v.number()),
    title: v.string(),
    address: v.string(),
    costPerPersonCents: v.number(),
    costLabel: v.string(),
    payUpFront: v.boolean(),
    priceVerified: v.boolean(),
    energy: v.union(v.literal("chill"), v.literal("active")),
    needsDaylight: v.boolean(),
    durationMinutes: v.number(),
    meetSpot: v.string(),
    source: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_indoor", ["indoor"]),

  plans: defineTable({
    groupId: v.id("groups"),
    day: v.string(),
    kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo")),
    placeId: v.id("places"),
    backupPlaceId: v.optional(v.id("places")),
    title: v.string(),
    line: v.string(),
    why: v.optional(v.string()),
    cost: v.number(),
    startsAt: v.number(),
    durationMinutes: v.number(),
    meetingPoint: v.optional(
      v.object({ lat: v.number(), lng: v.number(), label: v.string() }),
    ),
    sunsetAt: v.optional(v.number()),
    weather: v.optional(v.string()),
    source: v.union(
      v.literal("model"),
      v.literal("scorer"),
      v.literal("fallback"),
    ),
    generatedAt: v.number(),
    costLabel: v.string(),
    payUpFront: v.boolean(),
    chips: v.array(v.string()),
    whySource: v.union(
      v.literal("template"),
      v.literal("memory"),
      v.literal("device"),
      v.literal("haiku"),
    ),
    whyMemoryId: v.optional(v.string()),
    whyInputs: v.object({
      placeName: v.string(),
      memory: v.optional(v.string()),
      topTags: v.array(v.string()),
      weather: v.optional(v.string()),
      tempF: v.optional(v.number()),
      sunsetAt: v.optional(v.number()),
      rainSwap: v.boolean(),
    }),
    favoredUserId: v.optional(v.id("users")),
    weatherSwap: v.boolean(),
    weatherCheckedAt: v.optional(v.number()),
    dropId: v.optional(v.id("drops")),
  })
    .index("by_groupId_and_day", ["groupId", "day"])
    .index("by_dropId_and_day", ["dropId", "day"]),

  drops: defineTable({
    key: v.string(),
    sellerName: v.string(),
    title: v.string(),
    priceCents: v.number(),
    capacity: v.number(),
    placeSlug: v.string(),
    tags: v.array(v.string()),
    imageKey: v.string(),
    active: v.boolean(),
    validDays: v.array(v.number()),
    startMinute: v.number(),
    endMinute: v.number(),
    durationMinutes: v.number(),
    whopProductId: v.optional(v.string()),
    whopPlanId: v.optional(v.string()),
    purchaseUrl: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_active", ["active"]),

  planRuns: defineTable({
    groupId: v.id("groups"),
    day: v.string(),
    kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo")),
    workflowId: v.string(),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("fallback")),
    candidates: v.array(v.string()),
    error: v.optional(v.string()),
    startedAt: v.number(),
    modelPick: v.optional(
      v.object({ key: v.string(), slug: v.string(), why: v.string() }),
    ),
    finishedAt: v.optional(v.number()),
  }).index("by_groupId_and_day", ["groupId", "day"]),

  frolics: defineTable({
    groupId: v.id("groups"),
    day: v.string(),
    kind: v.union(v.literal("daily"), v.literal("weekend"), v.literal("solo")),
    planId: v.optional(v.id("plans")),
    status: frolicStatus,
    window: timeWindow,
    durationMinutes: v.number(),
    deadline: v.number(),
    capacity: v.optional(v.number()),
    matchedAt: v.optional(v.number()),
    revealAt: v.optional(v.number()),
    bloomAt: v.optional(v.number()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    snapAt: v.optional(v.number()),
    workflowId: v.optional(v.string()),
  })
    .index("by_groupId_and_day", ["groupId", "day"])
    .index("by_status_and_deadline", ["status", "deadline"]),

  reveals: defineTable({
    frolicId: v.id("frolics"),
    scheduledId: v.id("_scheduled_functions"),
    userIds: v.array(v.id("users")),
    revealAt: v.number(),
    bloomAt: v.number(),
    startsAt: v.number(),
    matchedAt: v.number(),
  }).index("by_frolicId", ["frolicId"]),

  revealLog: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    revealAt: v.number(),
    bloomAt: v.number(),
    flippedAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_groupId", ["groupId"]),

  taps: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    kind: tapKind,
    onlyIf: v.array(v.id("users")),
    window: v.optional(timeWindow),
    source: tapSource,
    updatedAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"])
    .index("by_userId", ["userId"]),

  attendees: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    role: v.union(
      v.literal("matched"),
      v.literal("hopIn"),
      v.literal("refill"),
    ),
    status: v.union(v.literal("going"), v.literal("sittingOut")),
    revealAt: v.number(),
    bloomAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"])
    .index("by_userId", ["userId"]),

  hopIns: defineTable({
    frolicId: v.id("frolics"),
    userId: v.id("users"),
    status: v.union(
      v.literal("waiting"),
      v.literal("joined"),
      v.literal("left"),
    ),
    requestedAt: v.number(),
  })
    .index("by_frolicId_and_status", ["frolicId", "status"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"]),

  etas: defineTable({
    frolicId: v.id("frolics"),
    userId: v.id("users"),
    minutes: v.number(),
    onTheWay: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"]),

  checkins: defineTable({
    frolicId: v.id("frolics"),
    userId: v.id("users"),
    method: v.union(
      v.literal("geofence"),
      v.literal("manual"),
      v.literal("imessage"),
    ),
    at: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"]),

  snaps: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    snapAt: v.number(),
    takenAt: v.number(),
    caption: v.optional(v.string()),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_groupId", ["groupId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"]),

  collages: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_groupId", ["groupId"]),

  whopPlans: defineTable({
    frolicId: v.id("frolics"),
    whopProductId: v.string(),
    whopPlanId: v.string(),
    amountCents: v.number(),
    currency: v.string(),
    createdAt: v.number(),
  }).index("by_frolicId", ["frolicId"]),

  shares: defineTable({
    frolicId: v.id("frolics"),
    groupId: v.id("groups"),
    userId: v.id("users"),
    amountCents: v.number(),
    kind: v.union(v.literal("deposit"), v.literal("chipIn")),
    status: v.union(
      v.literal("due"),
      v.literal("pending"),
      v.literal("held"),
      v.literal("releasing"),
      v.literal("released"),
      v.literal("paid"),
      v.literal("refunding"),
      v.literal("refunded"),
      v.literal("forfeited"),
      v.literal("failed"),
      v.literal("waived"),
      v.literal("needsAttention"),
    ),
    token: v.optional(v.string()),
    lastError: v.optional(v.string()),
    whopCheckoutId: v.optional(v.string()),
    whopPaymentId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_frolicId", ["frolicId"])
    .index("by_frolicId_and_userId", ["frolicId", "userId"])
    .index("by_whopPaymentId", ["whopPaymentId"])
    .index("by_whopCheckoutId", ["whopCheckoutId"])
    .index("by_token", ["token"]),

  fundLedger: defineTable({
    groupId: v.id("groups"),
    frolicId: v.optional(v.id("frolics")),
    userId: v.optional(v.id("users")),
    shareId: v.optional(v.id("shares")),
    whopPaymentId: v.optional(v.string()),
    entry: v.union(
      v.literal("deposit"),
      v.literal("refund"),
      v.literal("forfeit"),
      v.literal("payout"),
      v.literal("adjustment"),
    ),
    amountCents: v.number(),
    at: v.number(),
  })
    .index("by_groupId", ["groupId"])
    .index("by_frolicId", ["frolicId"]),

  webhookEvents: defineTable({
    provider: v.union(v.literal("whop"), v.literal("keiki")),
    eventId: v.string(),
    type: v.string(),
    payload: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_provider_and_eventId", ["provider", "eventId"]),

  memoryContainers: defineTable({
    scope: v.union(v.literal("user"), v.literal("group")),
    userId: v.optional(v.id("users")),
    groupId: v.optional(v.id("groups")),
    containerTag: v.string(),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_containerTag", ["containerTag"])
    .index("by_userId", ["userId"])
    .index("by_groupId", ["groupId"]),

  memoryOutbox: defineTable({
    containerTag: v.string(),
    kind: v.union(
      v.literal("taste"),
      v.literal("tap"),
      v.literal("ignore"),
      v.literal("checkin"),
      v.literal("limit"),
      v.literal("recap"),
    ),
    content: v.string(),
    frolicId: v.optional(v.id("frolics")),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    supermemoryId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_containerTag", ["containerTag"]),

  memoryEvents: defineTable({
    eventKey: v.string(),
    kind: v.union(
      v.literal("tap"),
      v.literal("only_if"),
      v.literal("skip"),
      v.literal("limit"),
      v.literal("plan_shown"),
      v.literal("reveal"),
      v.literal("checkin"),
      v.literal("snap"),
      v.literal("group_skip"),
    ),
    groupId: v.id("groups"),
    userId: v.optional(v.id("users")),
    frolicId: v.optional(v.id("frolics")),
    payload: v.any(),
    revealAt: v.optional(v.number()),
    source: v.optional(tapSource),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_eventKey", ["eventKey"])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_userId", ["userId"])
    .index("by_groupId_and_kind", ["groupId", "kind"]),

  memoryTagStats: defineTable({
    groupId: v.id("groups"),
    tag: v.string(),
    liked: v.number(),
    skipped: v.number(),
    lastSkipDay: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_groupId_and_tag", ["groupId", "tag"]),

  memoryContextCache: defineTable({
    groupId: v.id("groups"),
    day: v.string(),
    context: v.any(),
    builtAt: v.number(),
  }).index("by_groupId_and_day", ["groupId", "day"]),

  keikiLinks: defineTable({
    phone: v.string(),
    userId: v.id("users"),
    paused: v.boolean(),
    linkedAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_userId", ["userId"]),

  keikiGroupChats: defineTable({
    chatId: v.string(),
    groupId: v.id("groups"),
    linkedAt: v.number(),
  })
    .index("by_chatId", ["chatId"])
    .index("by_groupId", ["groupId"]),

  keikiOutbox: defineTable({
    key: v.string(),
    kind: v.union(
      v.literal("drop"),
      v.literal("reveal"),
      v.literal("hopIn"),
      v.literal("faded"),
      v.literal("nudge"),
      v.literal("snap"),
      v.literal("collage"),
      v.literal("money"),
    ),
    frolicId: v.id("frolics"),
    userId: v.optional(v.id("users")),
    target: v.string(),
    text: v.string(),
    notBefore: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_frolicId", ["frolicId"])
    .index("by_status_and_notBefore", ["status", "notBefore"]),

  keikiRequests: defineTable({
    requestKey: v.string(),
    tool: v.string(),
    status: v.number(),
    response: v.string(),
    at: v.number(),
  }).index("by_requestKey", ["requestKey"]),

  tasteProfiles: defineTable({
    groupId: v.id("groups"),
    tags: v.array(v.string()),
    card: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_groupId", ["groupId"]),
});
