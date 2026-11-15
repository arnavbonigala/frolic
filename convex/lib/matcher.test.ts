import { describe, expect, test } from "vitest";
import { findMatch, type MatchTap } from "./matcher";

const H = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 15, 20, 0, 0);
const W = { start: NOW + H, end: NOW + 6 * H };
const run = (taps: MatchTap[], extra: Partial<Parameters<typeof findMatch>[0]> = {}) =>
  findMatch({ taps, defaultWindow: W, durationMs: H, preferredStart: null, now: NOW, ...extra });
const any = (userId: string): MatchTap => ({ userId, onlyIf: [], window: null });
const onlyIf = (userId: string, ...ids: string[]): MatchTap => ({ userId, onlyIf: ids, window: null });
const win = (userId: string, start: number, end: number): MatchTap => ({ userId, onlyIf: [], window: { start, end } });

describe("matcher", () => {
  test("nobody tapped means no match", () => {
    expect(run([])).toBeNull();
  });

  test("one person alone never matches", () => {
    expect(run([any("maya")])).toBeNull();
  });

  test("two people down with anyone match", () => {
    expect(run([any("maya"), any("dev")])).toEqual({ userIds: ["dev", "maya"], startsAt: W.start });
  });

  test("only if holds when the named person is down", () => {
    expect(run([onlyIf("maya", "dev"), any("dev")])?.userIds).toEqual(["dev", "maya"]);
  });

  test("only if fails when the named person has not tapped", () => {
    expect(run([onlyIf("maya", "dev"), any("jordan")])).toBeNull();
  });

  test("only if with several people needs all of them", () => {
    expect(run([onlyIf("maya", "dev", "jordan"), any("dev")])).toBeNull();
    expect(run([onlyIf("maya", "dev", "jordan"), any("dev"), any("jordan")])?.userIds).toEqual(["dev", "jordan", "maya"]);
  });

  test("an unmet only if drops that person but the rest still match", () => {
    expect(run([onlyIf("maya", "priya"), any("dev"), any("jordan")])?.userIds).toEqual(["dev", "jordan"]);
  });

  test("only if chains resolve", () => {
    expect(run([onlyIf("a", "b"), onlyIf("b", "c"), any("c")])?.userIds).toEqual(["a", "b", "c"]);
  });

  test("a broken chain collapses entirely", () => {
    expect(run([onlyIf("a", "b"), onlyIf("b", "c"), onlyIf("c", "z")])).toBeNull();
  });

  test("a two person cycle matches", () => {
    expect(run([onlyIf("maya", "dev"), onlyIf("dev", "maya")])?.userIds).toEqual(["dev", "maya"]);
  });

  test("a three person cycle matches", () => {
    expect(run([onlyIf("a", "b"), onlyIf("b", "c"), onlyIf("c", "a")])?.userIds).toEqual(["a", "b", "c"]);
  });

  test("only if naming yourself is ignored", () => {
    expect(run([onlyIf("maya", "maya"), any("dev")])?.userIds).toEqual(["dev", "maya"]);
  });

  test("the largest valid set wins", () => {
    const m = run([any("a"), any("b"), onlyIf("c", "a", "b"), onlyIf("d", "c"), onlyIf("e", "x")]);
    expect(m?.userIds).toEqual(["a", "b", "c", "d"]);
  });

  test("windows that do not overlap never match", () => {
    expect(run([win("maya", NOW + H, NOW + 2 * H), win("dev", NOW + 3 * H, NOW + 5 * H)])).toBeNull();
  });

  test("windows that overlap less than the duration do not match", () => {
    expect(run([win("maya", NOW + H, NOW + 2.5 * H), win("dev", NOW + 2 * H, NOW + 4 * H)])).toBeNull();
  });

  test("overlapping windows match at the latest start", () => {
    const m = run([win("maya", NOW + H, NOW + 4 * H), win("dev", NOW + 2 * H, NOW + 5 * H)]);
    expect(m).toEqual({ userIds: ["dev", "maya"], startsAt: NOW + 2 * H });
  });

  test("the time that gets the most people out wins over an earlier smaller one", () => {
    const m = run([
      win("a", NOW + H, NOW + 2 * H),
      win("b", NOW + H, NOW + 2 * H),
      win("c", NOW + 3 * H, NOW + 5 * H),
      win("d", NOW + 3 * H, NOW + 5 * H),
      win("e", NOW + 3 * H, NOW + 5 * H),
    ]);
    expect(m).toEqual({ userIds: ["c", "d", "e"], startsAt: NOW + 3 * H });
  });

  test("ties go to the earliest time", () => {
    const m = run([
      win("a", NOW + H, NOW + 2 * H),
      win("b", NOW + H, NOW + 2 * H),
      win("c", NOW + 3 * H, NOW + 5 * H),
      win("d", NOW + 3 * H, NOW + 5 * H),
    ]);
    expect(m).toEqual({ userIds: ["a", "b"], startsAt: NOW + H });
  });

  test("the plan time wins a tie when everyone fits it", () => {
    const m = run([any("maya"), any("dev")], { preferredStart: NOW + 3 * H });
    expect(m?.startsAt).toBe(NOW + 3 * H);
  });

  test("the plan time loses when it fits fewer people", () => {
    const m = run([any("maya"), any("dev"), win("jordan", NOW + H, NOW + 2 * H)], { preferredStart: NOW + 3 * H });
    expect(m).toEqual({ userIds: ["dev", "jordan", "maya"], startsAt: NOW + H });
  });

  test("a start in the past moves to the next five minutes from now", () => {
    const now = NOW + 2 * H + 60 * 1000;
    const m = run([any("maya"), any("dev")], { now });
    expect(m?.startsAt).toBe(NOW + 2 * H + 5 * 60 * 1000);
  });

  test("a window that already closed cannot match", () => {
    expect(run([win("maya", NOW - 3 * H, NOW - H), win("dev", NOW - 3 * H, NOW - H)])).toBeNull();
  });

  test("only if combined with windows: the named person must fit the same time", () => {
    const m = run([
      { userId: "maya", onlyIf: ["dev"], window: { start: NOW + H, end: NOW + 2 * H } },
      win("dev", NOW + 3 * H, NOW + 5 * H),
      win("jordan", NOW + H, NOW + 2 * H),
    ]);
    expect(m).toBeNull();
  });
});
