import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { makeTest, seed, settle, tapById } from "./surface";

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

describe("contract: the web page's tap entry point", () => {
  it("internal.taps.tap takes a userId and returns the frolic status and revealAt", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Dev");
    const webTap = makeFunctionReference<"mutation">("taps:tap");
    let result: unknown;
    try {
      result = await t.mutation(webTap, {
        frolicId: f.frolicId,
        userId: f.users.Maya,
        kind: "down",
        source: "web",
      });
    } catch (err) {
      throw new Error(
        `The web "I'm down" page calls internal.taps.tap with { frolicId, userId, kind, source } and reads { status, revealAt } from the result (handoffs/schema-requests/FROL-7.md). This build does not accept that call: ${
          (err as Error).message
        }`,
      );
    }
    await settle(t);
    expect(result, "the web tap must tell the page what the frolic is doing").toMatchObject({
      status: expect.any(String),
      revealAt: expect.any(Number),
    });
  });
});
