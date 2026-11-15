import { describe, expect, test } from "vitest";
import { planWrites, groupNamespace, personalNamespace, type EventInput } from "../../convex/memory/mapping";

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

  test("personal event without a user is refused", () => {
    expect(() => planWrites("k", { kind: "tap", groupId: "g1", payload: {} })).toThrow();
  });
});
