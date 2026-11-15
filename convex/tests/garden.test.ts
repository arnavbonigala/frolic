/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { flipDue, makeT, NOON, setupCrew, tap, token } from "./setup.helpers";

describe("garden", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a member sees finished frolics and a stranger is refused", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const view = await t.query(api.garden.overview, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.count).toBe(1);
    expect(view.memories[0].youWent).toBe(true);
    expect(view.memories[0].going.map((p) => p.name)).toEqual(["Dev"]);
    expect(view.sinceLine).toBe("1 with you");
    const stranger = await t.mutation(api.users.createGroup, { deviceToken: token("Zed"), firstName: "Zed", groupName: "Other" });
    await expect(t.query(api.garden.overview, { deviceToken: token("Zed"), groupId: crew.groupId })).rejects.toThrow();
    expect(stranger.groupId).not.toBe(crew.groupId);
  });

  test("a frolic nobody went to never appears and the taste line has a template", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const view = await t.query(api.garden.overview, { deviceToken: token("Maya"), groupId: crew.groupId });
    expect(view.count).toBe(0);
    expect(view.memories).toEqual([]);
    expect(view.sinceLine).toBe("all before you joined");
    expect(view.taste.headline.length).toBeGreaterThan(0);
  });

  test("memory returns the going flowers and no photos when nobody snapped", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Dev");
    await flipDue(t);
    const memory = await t.query(api.garden.memory, { deviceToken: token("Dev"), frolicId: crew.frolicId });
    expect(memory.going.map((p) => p.name).sort()).toEqual(["Maya", "You"]);
    expect(memory.photos).toEqual([]);
    expect(memory.fundLine).toBeNull();
    await expect(t.query(api.garden.memory, { deviceToken: token("Zed"), frolicId: crew.frolicId })).rejects.toThrow();
  });
});
