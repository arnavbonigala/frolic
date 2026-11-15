import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { BERKELEY_PLACES } from "../places/data";
import { makeT, token } from "../tests/setup.helpers";
import { LOVE_LINES, crewLines } from "./lines";
import { validateTasteLine } from "./taste";

describe("crewLines", () => {
  test("every place tag has a warm line that passes the copy rules", () => {
    for (const [tag, line] of Object.entries(LOVE_LINES)) {
      expect(validateTasteLine({ headline: "Crew", why: line }), tag).toBeNull();
      expect(line).not.toMatch(/supermemory/i);
    }
    for (const place of BERKELEY_PLACES) for (const tag of place.tags) expect(LOVE_LINES[tag], tag).toBeDefined();
  });

  test("a loved tag and a suppressed tag become two lines", () => {
    expect(crewLines([{ tag: "late_night_food", liked: 3, skipped: 0 }, { tag: "boba", liked: 0, skipped: 2 }])).toEqual([
      "You always end at the noodle place.",
      "You keep passing on boba, so Frolic stopped suggesting it.",
    ]);
  });

  test("one like or one skip says nothing yet", () => {
    expect(crewLines([{ tag: "sunsets", liked: 1, skipped: 0 }, { tag: "boba", liked: 0, skipped: 1 }])).toEqual([]);
    expect(crewLines([])).toEqual([]);
  });

  test("a suppressed tag is not also loved, and unknown tags are ignored", () => {
    expect(crewLines([{ tag: "boba", liked: 2, skipped: 3 }, { tag: "mystery", liked: 5, skipped: 0 }])).toEqual([
      "You keep passing on boba, so Frolic stopped suggesting it.",
    ]);
  });
});

describe("crewMemoryLines", () => {
  async function setup() {
    const t = makeT();
    const created = await t.mutation(api.users.createGroup, { deviceToken: token("Maya"), firstName: "Maya", groupName: "Sunset Crew" });
    await t.mutation(api.users.joinGroup, { deviceToken: token("Dev"), firstName: "Dev", inviteCode: created.inviteCode });
    await t.run(async (ctx) => {
      await ctx.db.insert("memoryTagStats", { groupId: created.groupId, tag: "sunsets", liked: 3, skipped: 0, updatedAt: 0 });
    });
    return { t, groupId: created.groupId };
  }

  test("a member reads the crew lines", async () => {
    const { t, groupId } = await setup();
    expect(await t.query(api.memory.api.crewMemoryLines, { deviceToken: token("Dev"), groupId })).toEqual({ lines: ["You always end up chasing the sunset."] });
  });

  test("a stranger is refused, and so is an unknown device", async () => {
    const { t, groupId } = await setup();
    await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    await expect(t.query(api.memory.api.crewMemoryLines, { deviceToken: token("Zed"), groupId })).rejects.toThrow("NOT_A_MEMBER");
    await expect(t.query(api.memory.api.crewMemoryLines, { deviceToken: token("Nobody"), groupId })).rejects.toThrow("UNKNOWN_DEVICE");
  });

  test("a crew with no pattern yet gets no lines", async () => {
    const { t } = await setup();
    const other = await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    expect(await t.query(api.memory.api.crewMemoryLines, { deviceToken: token("Zed"), groupId: other.groupId })).toEqual({ lines: [] });
  });
});
