import type { MemoryClient, SearchResult } from "./client";

export const SUPPRESS_AFTER = 2;

export type TagStat = { tag: string; liked: number; skipped: number };

export type MemoryContext = {
  likedTags: string[];
  skipped: { tag: string; count: number }[];
  suppressed: string[];
  pastNights: { id: string; text: string; placeId?: string; date?: string }[];
};

export type WhyThis = { memoryId: string; text: string; because: string[] };

export const GROUP_CONTEXT =
  "A friend group that meets in person for one plan a day. Remember nights they went on, places, vibes, price feel, time of day, what they loved and what they keep passing on. Ignore chatter.";
export const PERSONAL_CONTEXT =
  "One person's private limits and preferences for daily plans: budget, transport, diet, energy, only-if choices. Never shared with anyone.";

export const GROUP_BUCKETS: Record<string, string> = {
  likes: "Activities, places and vibes the group loved or chose again.",
  avoids: "Things the group keeps passing on.",
  vibe: "How the group likes a night to feel, such as golden hour or late night.",
  budget: "Price feel the group is comfortable with.",
  rhythm: "When the group tends to answer and go.",
};

export const PERSONAL_BUCKETS: Record<string, string> = {
  limits: "Budget, transport, diet and energy limits this person stated.",
  only_if: "Who this person wants to go with.",
};

export const suppressedTags = (stats: TagStat[]) =>
  stats.filter((s) => s.skipped >= SUPPRESS_AFTER && s.skipped > s.liked).map((s) => s.tag);

const nightFilter = {
  operator: "or" as const,
  operands: [
    { field: "kind", operator: "eq" as const, value: "night" },
    { field: "kind", operator: "eq" as const, value: "checkin" },
    { field: "kind", operator: "eq" as const, value: "snap" },
  ],
};

const text = (r: SearchResult) => r.memory ?? r.chunk ?? "";

export async function buildContext(client: MemoryClient, namespace: string, stats: TagStat[]): Promise<MemoryContext> {
  const suppressed = suppressedTags(stats);
  const results = await client
    .search(namespace, { query: "best night the group had together", filter: nightFilter, limit: 5, searchMode: "hybrid" })
    .catch(() => [] as SearchResult[]);
  return {
    likedTags: stats.filter((s) => s.liked > 0 && !suppressed.includes(s.tag)).sort((a, b) => b.liked - a.liked).map((s) => s.tag),
    skipped: stats.filter((s) => s.skipped > 0).sort((a, b) => b.skipped - a.skipped).map((s) => ({ tag: s.tag, count: s.skipped })),
    suppressed,
    pastNights: results
      .filter((r) => text(r))
      .map((r) => ({
        id: r.id,
        text: text(r),
        placeId: typeof r.metadata?.placeId === "string" ? r.metadata.placeId : undefined,
        date: typeof r.metadata?.day === "string" ? r.metadata.day : undefined,
      })),
  };
}

export const buildContextFailure = (stats: TagStat[]): MemoryContext => ({
  likedTags: stats.filter((s) => s.liked > 0 && !suppressedTags(stats).includes(s.tag)).sort((a, b) => b.liked - a.liked).map((s) => s.tag),
  skipped: stats.filter((s) => s.skipped > 0).sort((a, b) => b.skipped - a.skipped).map((s) => ({ tag: s.tag, count: s.skipped })),
  suppressed: suppressedTags(stats),
  pastNights: [],
});

export async function findWhyThis(client: MemoryClient, namespace: string, tags: string[]): Promise<WhyThis | null> {
  if (tags.length === 0) return null;
  const results = await client.search(namespace, {
    query: tags.join(" ") + " night the group loved",
    filter: nightFilter,
    limit: 5,
    includeRelated: true,
    searchMode: "hybrid",
  });
  const lower = tags.map((t) => t.toLowerCase());
  const dayOf = (r: SearchResult) => (typeof r.metadata?.day === "string" ? r.metadata.day : "");
  const hit =
    results
      .filter((r) => lower.some((t) => text(r).toLowerCase().includes(t)))
      .sort((a, b) => dayOf(b).localeCompare(dayOf(a)))[0] ?? null;
  if (!hit) return null;
  const related = [...(hit.included?.related?.parents ?? []), ...(hit.included?.related?.siblings ?? [])].map((m) => m.memory ?? "").filter(Boolean);
  return { memoryId: hit.id, text: text(hit), because: related.slice(0, 2) };
}

export async function ensureNamespace(client: MemoryClient, namespace: string, kind: "group" | "personal") {
  const context = kind === "group" ? GROUP_CONTEXT : PERSONAL_CONTEXT;
  await client.add(namespace, { content: context, id: "frolic_init", metadata: { kind: "init" }, taskType: "superrag" });
  await client.setContext(namespace, context);
  await client.setBuckets(namespace, kind === "group" ? GROUP_BUCKETS : PERSONAL_BUCKETS);
}

export type TasteProfile = {
  headline: string;
  likes: string[];
  avoids: string[];
  vibe: string[];
  budget: string[];
  topTags: string[];
};

export async function buildTaste(client: MemoryClient, namespace: string, stats: TagStat[]): Promise<TasteProfile> {
  const profile = await client.profile(namespace);
  const bucket = (name: string) => (profile.buckets[name] ?? []).map((m) => m.memory);
  const topTags = stats.filter((s) => s.liked > 0).sort((a, b) => b.liked - a.liked).slice(0, 3).map((s) => s.tag);
  const budget = bucket("budget");
  return {
    headline: [...topTags, ...budget.slice(0, 1)].join(", "),
    likes: bucket("likes"),
    avoids: bucket("avoids"),
    vibe: bucket("vibe"),
    budget,
    topTags,
  };
}
