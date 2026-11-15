import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT, setupCrew, token } from "./setup.helpers";

const DAY = "2026-11-15";

describe("the app's arguments survive the validator", () => {
  test("a free window in milliseconds lands when it is a number", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const start = Date.now();
    const end = start + 2 * 60 * 60 * 1000;
    await t.mutation(api.crew.setFree, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      day: DAY,
      state: "window",
      window: { start, end },
    });
    const view = await t.query(api.crew.crew, { deviceToken: token("Dev"), groupId: crew.groupId, day: DAY });
    const maya = view.members.find((member) => member.name === "Maya");
    expect(maya?.free?.state).toBe("window");
    expect(maya?.free?.window).toEqual({ start, end });
  });

  test("a window sent as an int64 is refused, so the app sends a number", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const start = BigInt(Date.now());
    await expect(
      t.mutation(api.crew.setFree, {
        deviceToken: token("Maya"),
        groupId: crew.groupId,
        day: DAY,
        state: "window",
        window: { start: start as unknown as number, end: (start + 3600000n) as unknown as number },
      }),
    ).rejects.toThrow(/Expected `number`/);
  });

  test("free for takes whole minutes as a number", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const started = await t.mutation(api.frolics.imFree, {
      deviceToken: token("Maya"),
      groupId: crew.groupId,
      forMinutes: 120,
    });
    expect(started.frolicId).toBeDefined();
    await expect(
      t.mutation(api.frolics.imFree, {
        deviceToken: token("Maya"),
        groupId: crew.groupId,
        forMinutes: 90n as unknown as number,
      }),
    ).rejects.toThrow(/Expected `number`/);
  });
});
