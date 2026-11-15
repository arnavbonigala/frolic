import { describe, expect, test } from "vitest";
import { EVENT_KINDS, planWrites, groupNamespace, personalNamespace, type EventInput } from "../../convex/memory/mapping";

const base = { groupId: "g1", userId: "u1", payload: { title: "Indian Rock", tags: ["sunset"], day: "2026-11-15", name: "Maya", memberIds: ["u1", "u2"], memberNames: ["Maya", "Dev"], caption: "golden" } };

describe("privacy separation", () => {
  test.each(["tap", "only_if", "skip", "limit"] as const)("%s never writes to the group namespace", (kind) => {
    const { writes } = planWrites("k", { ...base, kind } as EventInput);
    expect(writes.length).toBe(1);
    expect(writes.every((w) => w.scope === "personal" && w.namespace === personalNamespace("u1"))).toBe(true);
  });

  test("limit text stays out of group writes", () => {
    const { writes } = planWrites("k", { ...base, kind: "limit", payload: { text: "No car. Vegetarian. Under 10 dollars." } });
    expect(writes.some((w) => w.namespace === groupNamespace("g1"))).toBe(false);
  });

  test("tap does not leak the title or the person into any group write", () => {
    const { writes } = planWrites("k", { ...base, kind: "tap" } as EventInput);
    expect(writes.filter((w) => w.namespace.startsWith("frolic_g_"))).toEqual([]);
  });

  test("reveal, checkin and snap hold until revealAt", () => {
    for (const kind of ["reveal", "checkin", "snap"] as const) {
      const { notBefore } = planWrites("k", { ...base, kind, revealAt: 5000 } as EventInput);
      expect(notBefore).toBe(5000);
    }
  });

  test("reveal writes the night to the group and to each member's own namespace only", () => {
    const { writes } = planWrites("k", { ...base, kind: "reveal", revealAt: 1 } as EventInput);
    const namespaces = writes.map((w) => w.namespace).sort();
    expect(namespaces).toEqual([groupNamespace("g1"), personalNamespace("u1"), personalNamespace("u2")].sort());
    expect(writes.find((w) => w.scope === "group")!.content).toContain("Two friends went to Indian Rock");
  });

  test("document ids are stable and URL safe", () => {
    const a = planWrites("tap:abc/1", { ...base, kind: "tap" } as EventInput).writes[0].id;
    const b = planWrites("tap:abc/1", { ...base, kind: "tap" } as EventInput).writes[0].id;
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test("every memory line is a full sentence with a capital", () => {
    for (const kind of EVENT_KINDS) {
      const { writes } = planWrites("k", { ...base, kind, revealAt: 1, payload: { ...base.payload, count: 2, tag: "bowling", question: "Sunset or stars?", option: "Stars", text: "budget up to 20" } } as EventInput);
      for (const write of writes) {
        expect(write.content.charAt(0)).toMatch(/[A-Z0-9]/);
        expect(write.content).toMatch(/[.!?]$/);
      }
    }
  });

  test("only if counts the people waiting, not a list joined by and", () => {
    const one = planWrites("k", { ...base, kind: "only_if", payload: { title: "Boba", onlyIfNames: ["Jordan"] } }).writes[0].content;
    const two = planWrites("k", { ...base, kind: "only_if", payload: { title: "Boba", onlyIfNames: ["Dev", "Jordan"] } }).writes[0].content;
    const four = planWrites("k", { ...base, kind: "only_if", payload: { title: "Boba", onlyIfNames: ["Dev", "Jordan", "Priya", "Ari"] } }).writes[0].content;
    expect(one).toBe("Said down for Boba only if Jordan comes.");
    expect(two).toBe("Said down for Boba only if Dev and Jordan come.");
    expect(four).toBe("Said down for Boba only if all 4 come.");
  });

  test("a picked option stays lowercase inside the sentence", () => {
    const { writes } = planWrites("k", { ...base, kind: "daily_pick", payload: { question: "Sunset or stars?", option: "Sunset" } });
    expect(writes[0].content).toBe('Picked sunset for "Sunset or stars?".');
  });

  test("personal event without a user is refused", () => {
    expect(() => planWrites("k", { kind: "tap", groupId: "g1", payload: {} })).toThrow();
  });
});
