import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectMatch, expectNoMatch } from "./assert";
import {
  findFunction,
  makeTest,
  readTaps,
  seed,
  settle,
  tapById,
  tapByToken,
  tokenFor,
} from "./surface";

const NOW = Date.UTC(2026, 10, 15, 19, 0, 0);
const MIN = 60_000;

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

describe("sources: a web yes and an app yes match each other", () => {
  for (const pairing of [
    ["web", "app"],
    ["imessage", "app"],
    ["notification", "app"],
    ["web", "imessage"],
  ] as const) {
    it(`${pairing[0]} and ${pairing[1]} tap into the same match`, async () => {
      const t = fresh();
      const f = await seed(t);
      await tapById(t, f, "Maya", { source: pairing[0] });
      await tapById(t, f, "Dev", { source: pairing[1] });
      await settle(t);
      await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
      const taps = await readTaps(t, f.frolicId);
      expect(
        taps.map((x: any) => x.source).sort(),
        "the source is stored so a link yes is distinguishable from an app yes",
      ).toEqual([...pairing].sort());
    });
  }

  it("a web tap with an onlyIf is bound by it exactly like an app tap", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Sam"], source: "web" });
    await tapById(t, f, "Dev", { source: "app" });
    await settle(t);
    await expectNoMatch(t, f.frolicId);
  });

  it("a web tap past the deadline cannot match", async () => {
    const t = fresh();
    const f = await seed(t, { deadlineOffset: 30 * MIN });
    await tapById(t, f, "Maya");
    vi.setSystemTime(NOW + 31 * MIN);
    await tapById(t, f, "Dev", { source: "web" }).catch(() => undefined);
    await t.finishInProgressScheduledFunctions();
    await expectNoMatch(t, f.frolicId);
  });
});

describe("sources: the public tap path", () => {
  it("an app tap from the phone matches a link tap", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapByToken(t, f, "Maya", { source: "app" });
    await tapById(t, f, "Dev", { source: "web" });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a notification tap from the lock screen works like an app tap", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapByToken(t, f, "Maya", { source: "notification" });
    await tapByToken(t, f, "Dev", { source: "app" });
    await settle(t);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("the public tap rejects a source outside its own union", async () => {
    const t = fresh();
    const f = await seed(t);
    await expect(tapByToken(t, f, "Maya", { source: "web" as any })).rejects.toThrow();
  });

  it("the public tap refuses an unknown device token", async () => {
    const t = fresh();
    const f = await seed(t);
    await expect(
      tapByToken(t, f, "Maya", {}, "not-a-real-device-token-0123456789abcdef"),
    ).rejects.toThrow();
  });
});

describe("identity: a rotated device token cannot buy a second yes", () => {
  it("rotating the token still leaves one tap row for one person", async () => {
    const t = fresh();
    const f = await seed(t);
    await tapById(t, f, "Maya", { onlyIf: ["Dev"] });
    const rotated = `${tokenFor("Maya")}-rotated`;
    const digest = await t.run(async (ctx: any) => {
      const bytes = new TextEncoder().encode(rotated);
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    });
    await t.run(async (ctx: any) => {
      await ctx.db.patch("users", f.users.Maya, { tokenHash: digest });
    });
    await tapByToken(t, f, "Maya", { onlyIf: [] }, rotated);
    await tapById(t, f, "Dev");
    await settle(t);
    const taps = await readTaps(t, f.frolicId);
    expect(
      taps.filter((x: any) => x.userId === f.users.Maya),
      "a rotated token must not create a second tap row for the same person",
    ).toHaveLength(1);
    await expectMatch(t, f.frolicId, [f.users.Maya, f.users.Dev], NOW);
  });

  it("a second account for the same person cannot close a match alone", async () => {
    const t = fresh();
    const f = await seed(t);
    const twin = await t.run(async (ctx: any) =>
      await ctx.db.insert("users", { name: "Maya", source: "app" }),
    );
    const { ref } = await findFunction("tapAs");
    await expect(
      t.mutation(ref, {
        frolicId: f.frolicId,
        userId: twin,
        kind: "down",
        onlyIf: [],
        source: "app",
      }),
    ).rejects.toThrow();
  });
});
