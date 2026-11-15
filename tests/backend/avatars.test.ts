/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT, setupCrew, token } from "./setup.helpers";

const SITE = "https://frolic.convex.site";

beforeEach(() => {
  vi.stubEnv("CONVEX_SITE_URL", SITE);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("avatars", () => {
  test("a person's portrait is the photo url every view returns", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan", "Priya"]);
    await t.mutation(api.users.updateProfile, { deviceToken: token("Maya"), avatarKey: "maya" });
    const me = await t.query(api.users.me, { deviceToken: token("Maya") });
    expect(me?.photoUrl).toBe(`${SITE}/p/avatar/maya.jpg`);
    const crewView = await t.query(api.crew.crew, {
      deviceToken: token("Dev"),
      groupId: crew.groupId,
      day: "2026-11-15",
    });
    const maya = crewView.members.find((m) => m.name === "Maya");
    expect(maya?.photoUrl).toBe(`${SITE}/p/avatar/maya.jpg`);
    expect(maya?.color).toBe("pink");
  });

  test("an unknown portrait key is refused", async () => {
    const t = makeT();
    await setupCrew(t, ["Maya", "Dev"]);
    await expect(
      t.mutation(api.users.updateProfile, { deviceToken: token("Maya"), avatarKey: "sam" }),
    ).rejects.toThrow(/portrait/);
  });
});
