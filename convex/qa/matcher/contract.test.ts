import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectMatch } from "./assert";
import { findFunction, makeTest, readTaps, seed, settle, tapById } from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);

function fresh(at: number = NOW) {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  return makeTest();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("contract: the internal tap the web and iMessage paths call", () => {
  for (const source of ["web", "imessage", "app", "notification"] as const) {
    it(`a ${source} yes goes through taps.tapAs and matches like an app yes`, async () => {
      const t = fresh();
      const f = await seed(t);
      const { ref } = await findFunction("tapAs");
      await t.mutation(ref, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [],
        source,
      });
      await tapById(t, f, "Dev", { source: "app" });
      await settle(t);
      await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
      const sources = (await readTaps(t, f.frolicId)).map((x: any) => x.source);
      expect(sources).toContain(source);
    });
  }

  it("tapAs returns nothing, so no caller may depend on a result from it", async () => {
    const t = fresh();
    const f = await seed(t);
    const { ref } = await findFunction("tapAs");
    const result = await t.mutation(ref, {
      frolicId: f.frolicId,
      userId: f.users.Maya,
      kind: "down",
      onlyIf: [],
      source: "web",
    });
    expect(
      result,
      "tapAs returns null by design, so the web page must not read status or revealAt from it",
    ).toBeNull();
  });

  it("tapAs refuses an onlyIf naming someone outside the crew", async () => {
    const t = fresh();
    const f = await seed(t);
    const outsider = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Outsider", source: "app" }),
    );
    const { ref } = await findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        onlyIf: [outsider],
        source: "web",
      }),
    ).rejects.toThrow();
  });
});
