/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { CREW_LINE_MAX, FADED_TEXT, crewFirst } from "../../convex/lib/copy";
import { NOON, makeT, setupCrew } from "./setup.helpers";

const CREW = "Sunset Crew";
const LONG = "Maya, Dev, Jordan and Priya are all free this evening and the sun sets at 7:12 over the water and the tide comes in just before the light goes. Just saying.";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("crewFirst", () => {
  test("opens with the crew name and a colon, and keeps the line's first letter as it was", () => {
    expect(crewFirst(CREW, "Kayaks at the Marina.")).toBe("Sunset Crew: Kayaks at the Marina.");
    expect(crewFirst(CREW, "it's on. You, Maya.")).toBe("Sunset Crew: it's on. You, Maya.");
  });

  test("signs the first line of a longer text and leaves the rest alone", () => {
    expect(crewFirst(CREW, "Kayaks at the Marina, 4:30.\nBring a jacket.")).toBe(
      "Sunset Crew: Kayaks at the Marina, 4:30.\nBring a jacket.",
    );
  });

  test("never says the crew name twice", () => {
    expect(crewFirst(CREW, "Sunset Crew is on tonight.")).toBe("Sunset Crew is on tonight.");
    expect(crewFirst(CREW, "sunset crew is on tonight.")).toBe("sunset crew is on tonight.");
  });

  test("keeps the crew name whole and the line inside one lock screen", () => {
    const signed = crewFirst(CREW, LONG);
    expect(signed.startsWith(CREW + ": ")).toBe(true);
    expect(signed.length).toBeLessThanOrEqual(CREW_LINE_MAX);
    expect(signed.endsWith("…")).toBe(true);
    expect(crewFirst(CREW, LONG).split("\n")[0]).not.toMatch(/[—!]/);
  });

  test("a long name is never cut to make room", () => {
    const name = "The Very Long Sunset Crew Of The Oakland Hills";
    const signed = crewFirst(name, LONG);
    expect(signed.startsWith(name + ": ")).toBe(true);
    expect(signed.length).toBeLessThanOrEqual(CREW_LINE_MAX);
  });

  test("an empty crew name leaves the line as it was", () => {
    expect(crewFirst("", "Kayaks at the Marina.")).toBe("Kayaks at the Marina.");
    expect(crewFirst("   ", "Kayaks at the Marina.")).toBe("Kayaks at the Marina.");
  });
});

describe("every notice opened with the crew name", () => {
  test("the drop, the free plan, the faded notice and the money text all start with it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.run(async (ctx) => {
      await ctx.db.insert("keikiLinks", { phone: "+15105550101", userId: crew.ids.Maya, paused: false, linkedAt: NOON });
      await ctx.db.insert("keikiLinks", { phone: "+15105550102", userId: crew.ids.Dev, paused: false, linkedAt: NOON });
    });

    await t.mutation(internal.keiki.outbound.onDrop, { frolicId: crew.frolicId });
    await t.mutation(internal.keiki.outbound.onFree, { frolicId: crew.frolicId });
    await t.mutation(internal.keiki.outbound.onFaded, { frolicId: crew.frolicId, userIds: [crew.ids.Maya] });
    await t.mutation(internal.keiki.outbound.onMoney, {
      frolicId: crew.frolicId,
      userId: crew.ids.Maya,
      event: "released",
      amountCents: 300,
    });

    const rows = await t.run(async (ctx) => await ctx.db.query("keikiOutbox").collect());
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      expect(row.text.startsWith(CREW + ": ")).toBe(true);
      expect(row.text.length).toBeGreaterThan(CREW.length + 2);
    }
    expect(rows.find((row) => row.kind === "faded")!.text).toBe(CREW + ": " + FADED_TEXT);
  });
});
