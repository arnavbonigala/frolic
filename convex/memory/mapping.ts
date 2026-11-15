import { comePhrase, midSentence } from "../lib/names";

export const EVENT_KINDS = ["tap", "only_if", "skip", "limit", "plan_shown", "reveal", "checkin", "snap", "group_skip", "daily_pick"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type EventInput = {
  kind: EventKind;
  groupId: string;
  userId?: string;
  frolicId?: string;
  payload: Record<string, unknown>;
  revealAt?: number;
};

export type MemoryWrite = {
  scope: "personal" | "group";
  namespace: string;
  userId?: string;
  id: string;
  content: string;
  metadata: Record<string, string | number | boolean | string[]>;
  date?: string;
};

export const personalNamespace = (userId: string) => "frolic_p_" + userId;
export const groupNamespace = (groupId: string) => "frolic_g_" + groupId;

const safeId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
const WORDS = ["Nobody", "One friend", "Two friends", "Three friends", "Four friends", "Five friends", "Six friends", "Seven friends", "Eight friends", "Nine friends"];
const crew = (size: number) => WORDS[size] ?? size + " friends";
const sentence = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return flat;
  const capped = flat.charAt(0).toUpperCase() + flat.slice(1);
  return /[.!?]$/.test(capped) ? capped : capped + ".";
};
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const day = (e: EventInput) => str(e.payload.day) || undefined;

export function planWrites(eventKey: string, e: EventInput): { writes: MemoryWrite[]; notBefore: number } {
  const title = str(e.payload.title, "the plan");
  const tags = strs(e.payload.tags);
  const where = str(e.payload.placeName) || title;
  const base = { tags, ...(e.payload.placeId ? { placeId: str(e.payload.placeId) } : {}), ...(day(e) ? { day: day(e)! } : {}) };
  const personal = (kind: string, content: string, extra: Record<string, string | number | boolean | string[]> = {}): MemoryWrite => {
    if (!e.userId) throw new Error("personal event needs userId");
    return {
      scope: "personal",
      namespace: personalNamespace(e.userId),
      userId: e.userId,
      id: safeId(eventKey) + "_p",
      content: sentence(content),
      metadata: { kind, groupId: e.groupId, ...base, ...extra },
      date: day(e),
    };
  };
  const group = (kind: string, content: string, id = safeId(eventKey) + "_g"): MemoryWrite => ({
    scope: "group",
    namespace: groupNamespace(e.groupId),
    id,
    content: sentence(content),
    metadata: { kind, ...base },
    date: day(e),
  });
  if ((e.kind === "reveal" || e.kind === "checkin" || e.kind === "snap") && e.revealAt === undefined) throw new Error(e.kind + " needs revealAt");

  switch (e.kind) {
    case "group_skip": {
      const tag = str(e.payload.tag);
      const count = typeof e.payload.count === "number" ? e.payload.count : 1;
      return {
        writes: [{ ...group("avoid", "The crew passed on " + tag + " " + count + (count === 1 ? " time." : " times."), safeId(eventKey) + "_g"), metadata: { kind: "avoid", tags: [tag], ...(day(e) ? { day: day(e)! } : {}) } }],
        notBefore: 0,
      };
    }
    case "tap":
      return { writes: [personal("tap", "Tapped I'm down on " + title + (tags.length ? " (" + tags.join(", ") + ")" : "") + ".")], notBefore: 0 };
    case "only_if": {
      const names = strs(e.payload.onlyIfNames);
      return { writes: [personal("only_if", "Said down for " + title + " only if " + (comePhrase(names) || "friends come") + ".")], notBefore: 0 };
    }
    case "skip":
      return { writes: [personal("skip", "Passed on " + title + (tags.length ? " (" + tags.join(", ") + ")" : "") + " today.")], notBefore: 0 };
    case "limit":
      return { writes: [personal("limit", str(e.payload.text))], notBefore: 0 };
    case "plan_shown":
      return { writes: [group("plan_shown", "Frolic suggested " + title + (tags.length ? " (" + tags.join(", ") + ")" : "") + (str(e.payload.why) ? ". " + str(e.payload.why) : "") + ".")], notBefore: 0 };
    case "reveal": {
      const memberIds = strs(e.payload.memberIds);
      const size = memberIds.length > 0 ? memberIds.length : 1;
      const text = crew(size) + " went to " + where + (tags.length ? " (" + tags.join(", ") + ")" : "") + ".";
      return {
        writes: [
          { ...group("night", text), metadata: { kind: "night", ...base, size } },
          ...memberIds.map((id): MemoryWrite => ({
            scope: "personal",
            namespace: personalNamespace(id),
            userId: id,
            id: safeId(eventKey) + "_p_" + safeId(id),
            content: sentence("Went to " + where + " with the crew."),
            metadata: { kind: "night", groupId: e.groupId, ...base },
            date: day(e),
          })),
        ],
        notBefore: e.revealAt!,
      };
    }
    case "checkin":
      return {
        writes: [
          personal("checkin", "Checked in at " + where + "."),
          group("checkin", "Someone checked in at " + where + "."),
        ],
        notBefore: e.revealAt!,
      };
    case "daily_pick": {
      const question = str(e.payload.question);
      const option = str(e.payload.option);
      return {
        writes: [
          personal("daily_pick", "Picked " + midSentence(option) + " for \"" + question + "\"" + (tags.length ? " (" + tags.join(", ") + ")" : "") + "."),
          group("daily_pick", "Someone in the crew picked " + midSentence(option) + " for \"" + question + "\"."),
        ],
        notBefore: 0,
      };
    }
    case "snap": {
      const caption = str(e.payload.caption);
      return {
        writes: [
          personal("snap", "Snap at " + where + (caption ? ": " + caption : "") + "."),
          group("snap", "The crew took a snap at " + where + (caption ? ": " + caption : "") + "."),
        ],
        notBefore: e.revealAt!,
      };
    }
  }
}
