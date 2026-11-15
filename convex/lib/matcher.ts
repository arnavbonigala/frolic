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
};

export type Match = { userIds: string[]; startsAt: number };

export const START_STEP_MS = 5 * 60 * 1000;

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
