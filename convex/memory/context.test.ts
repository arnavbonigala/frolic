import { describe, expect, test, vi } from "vitest";
import { buildContext, buildTaste, findWhyThis, suppressedTags } from "./context";
import type { MemoryClient } from "./client";

const fake = (over: Partial<MemoryClient> = {}): MemoryClient => ({
  add: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  profile: vi.fn().mockResolvedValue({ static: [], dynamic: [], buckets: {} }),
  setBuckets: vi.fn(),
  setContext: vi.fn(),
  deleteNamespace: vi.fn(),
  ...over,
});

describe("context", () => {
  test("a tag skipped twice is suppressed, once is not", () => {
    expect(suppressedTags([{ tag: "boba", liked: 0, skipped: 2 }, { tag: "hike", liked: 0, skipped: 1 }])).toEqual(["boba"]);
  });

  test("a tag liked more than skipped stays eligible", () => {
    expect(suppressedTags([{ tag: "boba", liked: 3, skipped: 2 }])).toEqual([]);
  });

  test("buildContext lists liked tags without suppressed ones and cites past nights", async () => {
    const client = fake({ search: vi.fn().mockResolvedValue([{ id: "m1", memory: "Two friends went to Indian Rock (sunset).", metadata: { placeId: "p1", day: "2026-10-12" } }]) });
    const ctx = await buildContext(client, "frolic_g_1", [
      { tag: "sunset", liked: 3, skipped: 0 },
      { tag: "boba", liked: 0, skipped: 2 },
    ]);
    expect(ctx.likedTags).toEqual(["sunset"]);
    expect(ctx.suppressed).toEqual(["boba"]);
    expect(ctx.skipped).toEqual([{ tag: "boba", count: 2 }]);
    expect(ctx.pastNights).toEqual([{ id: "m1", text: "Two friends went to Indian Rock (sunset).", placeId: "p1", date: "2026-10-12" }]);
  });

  test("buildContext lets a Supermemory failure through so the caller can fall back", async () => {
    const client = fake({ search: vi.fn().mockRejectedValue(new Error("down")) });
    await expect(buildContext(client, "n", [{ tag: "sunset", liked: 1, skipped: 0 }])).rejects.toThrow("down");
  });

  test("findWhyThis quotes a real memory that mentions the tag", async () => {
    const client = fake({
      search: vi.fn().mockResolvedValue([
        { id: "a", memory: "Went to the arcade." },
        { id: "b", memory: "Two friends went to Marina (sunset).", included: { related: { parents: [{ id: "c", memory: "Sunset is the crew's favorite." }] } } },
      ]),
    });
    const why = await findWhyThis(client, "n", ["sunset"]);
    expect(why).toEqual({ memoryId: "b", text: "Two friends went to Marina (sunset).", because: ["Sunset is the crew's favorite."] });
  });

  test("findWhyThis prefers the most recent matching night", async () => {
    const client = fake({
      search: vi.fn().mockResolvedValue([
        { id: "old", memory: "Two friends went to Marina (sunset).", metadata: { day: "2026-10-01" } },
        { id: "new", memory: "Two friends went to Indian Rock (sunset).", metadata: { day: "2026-11-08" } },
      ]),
    });
    expect((await findWhyThis(client, "n", ["sunset"]))?.memoryId).toBe("new");
  });

  test("findWhyThis returns null when nothing matches", async () => {
    expect(await findWhyThis(fake(), "n", ["sunset"])).toBeNull();
    expect(await findWhyThis(fake(), "n", [])).toBeNull();
  });

  test("buildTaste reads buckets and top tags", async () => {
    const client = fake({
      profile: vi.fn().mockResolvedValue({ static: [], dynamic: [], buckets: { vibe: [{ id: "1", memory: "golden-hour chasers" }], budget: [{ id: "2", memory: "under 10 dollars" }] } }),
    });
    const t = await buildTaste(client, "n", [{ tag: "sunset", liked: 4, skipped: 0 }]);
    expect(t.vibe).toEqual(["golden-hour chasers"]);
    expect(t.headline).toBe("sunset, under 10 dollars");
  });
});
