export type TimeWindow = { start: number; end: number };

export type MatchTap = {
  userId: string;
  onlyIf: string[];
  window: TimeWindow | null;
};

export type MatchInput = {
  taps: MatchTap[];
  defaultWindow: TimeWindow;
  durationMs: number;
  preferredStart: number | null;
  now: number;
  capacity?: number;
};

export type Match = { userIds: string[]; startsAt: number };

export const START_STEP_MS = 5 * 60 * 1000;

function closedSubset(set: MatchTap[], size: number): MatchTap[] | null {
  const pick: number[] = [];
  const search = (from: number): MatchTap[] | null => {
    if (pick.length === size) {
      const chosen = pick.map((i) => set[i]);
      const ids = new Set(chosen.map((tap) => tap.userId));
      return chosen.every((tap) => tap.onlyIf.every((id) => ids.has(id))) ? chosen : null;
    }
    for (let i = from; i <= set.length - (size - pick.length); i++) {
      pick.push(i);
      const found = search(i + 1);
      pick.pop();
      if (found) return found;
    }
    return null;
  };
  return search(0);
}

function bestUnderCapacity(set: MatchTap[], capacity: number): MatchTap[] {
  for (let size = Math.min(capacity, set.length); size >= 2; size--) {
    const found = closedSubset(set, size);
    if (found) return found;
  }
  return [];
}

export function findMatch(input: MatchInput): Match | null {
  const byUser = new Map<string, MatchTap>();
  for (const tap of input.taps) byUser.set(tap.userId, tap);
  input = { ...input, taps: [...byUser.values()] };
  const earliest = Math.max(
    Math.ceil(input.now / START_STEP_MS) * START_STEP_MS,
    input.defaultWindow.start,
  );
  const latestEnd = input.defaultWindow.end;
  const clamp = (t: number) => Math.max(t, earliest);
  const preferred =
    input.preferredStart === null ? null : clamp(input.preferredStart);
  const windowOf = (tap: MatchTap) => tap.window ?? input.defaultWindow;

  const starts = new Set<number>([clamp(input.defaultWindow.start)]);
  if (preferred !== null) starts.add(preferred);
  for (const tap of input.taps) starts.add(clamp(windowOf(tap).start));

  let best: Match | null = null;
  for (const t of [...starts].sort((a, b) => a - b)) {
    let set = input.taps.filter((tap) => {
      const w = windowOf(tap);
      return w.start <= t && t + input.durationMs <= Math.min(w.end, latestEnd);
    });
    for (;;) {
      const ids = new Set(set.map((tap) => tap.userId));
      const next = set.filter((tap) => tap.onlyIf.every((id) => ids.has(id)));
      if (next.length === set.length) break;
      set = next;
    }
    if (input.capacity !== undefined && set.length > input.capacity) {
      set = bestUnderCapacity(set, input.capacity);
    }
    if (set.length < 2) continue;
    const bigger = best === null || set.length > best.userIds.length;
    const preferredTie =
      best !== null &&
      set.length === best.userIds.length &&
      t === preferred &&
      best.startsAt !== preferred;
    if (bigger || preferredTie) {
      best = { userIds: set.map((tap) => tap.userId).sort(), startsAt: t };
    }
  }
  return best;
}
