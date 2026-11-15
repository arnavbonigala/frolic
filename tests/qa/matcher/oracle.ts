import type { Id } from "../../../convex/_generated/dataModel";

export type OracleTap = {
  userId: Id<"users">;
  onlyIf: Id<"users">[];
  window?: { start: number; end: number };
  kind: "down" | "notToday";
};

export type Window = { start: number; end: number };

export function overlap(a: Window, b: Window): number {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start);
}

export function validSet(
  members: OracleTap[],
  frolicWindow: Window,
  durationMs: number,
): Window | null {
  if (members.length < 2) return null;
  const ids = new Set(members.map((m) => m.userId));
  for (const member of members) {
    for (const need of member.onlyIf) if (!ids.has(need)) return null;
  }
  let start = frolicWindow.start;
  let end = frolicWindow.end;
  for (const member of members) {
    const w = member.window ?? frolicWindow;
    start = Math.max(start, w.start);
    end = Math.min(end, w.end);
  }
  if (end - start < durationMs) return null;
  return { start, end };
}

export function bestSet(
  taps: OracleTap[],
  frolicWindow: Window,
  durationMs: number,
): { members: Id<"users">[]; start: number } | null {
  const candidates = taps.filter((t) => t.kind === "down");
  let best: { members: Id<"users">[]; start: number } | null = null;
  const total = 1 << candidates.length;
  for (let mask = 0; mask < total; mask++) {
    const members = candidates.filter((_, i) => (mask & (1 << i)) !== 0);
    if (members.length < 2) continue;
    const slot = validSet(members, frolicWindow, durationMs);
    if (slot === null) continue;
    const ids = members.map((m) => m.userId).sort();
    if (
      best === null ||
      ids.length > best.members.length ||
      (ids.length === best.members.length && slot.start < best.start)
    ) {
      best = { members: ids, start: slot.start };
    }
  }
  return best;
}

export function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
