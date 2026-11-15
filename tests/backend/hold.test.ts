import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT, setupCrew, token } from "./setup.helpers";

beforeEach(() => {
  vi.stubEnv("E2E_SECRET", "hold-secret-0123456789");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const view = (deviceToken: string, groupId: Awaited<ReturnType<typeof setupCrew>>["groupId"]) =>
  ({ deviceToken, groupId, day: "2026-11-15" }) as const;

describe("crew hold", () => {
  test("a new crew has the hold off and the amount in cents", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    const crewView = await t.query(api.crew.crew, view(token("Maya"), crew.groupId));
    expect(crewView.holdEnabled).toBeUndefined();
    expect(crewView.holdCents).toBe(300);
  });

  test("the crew view carries the member count and when the crew started", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev", "Jordan"]);
    const crewView = await t.query(api.crew.crew, view(token("Dev"), crew.groupId));
    const group = await t.run(async (ctx) => await ctx.db.get("groups", crew.groupId));
    expect(crewView.memberCount).toBe(3);
    expect(crewView.createdAt).toBe(group!._creationTime);
  });

  test("a member turns it on and everyone sees it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.crew.setHold, { deviceToken: token("Dev"), groupId: crew.groupId, enabled: true });
    expect((await t.query(api.crew.crew, view(token("Maya"), crew.groupId))).holdEnabled).toBe(true);
    await t.mutation(api.crew.setHold, { deviceToken: token("Maya"), groupId: crew.groupId, enabled: false });
    expect((await t.query(api.crew.crew, view(token("Maya"), crew.groupId))).holdEnabled).toBe(false);
  });

  test("someone outside the crew cannot change it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    await t.mutation(api.users.createGroup, { deviceToken: token("Eve"), firstName: "Eve", groupName: "Other" });
    await expect(
      t.mutation(api.crew.setHold, { deviceToken: token("Eve"), groupId: crew.groupId, enabled: true }),
    ).rejects.toThrow(/not in this crew/);
  });

  test("the demo seed turns the hold on and the three-phone seed leaves it off", async () => {
    const t = makeT();
    for (const scenario of ["three-phone", "demo"] as const) {
      const res = await t.fetch("/e2e/seed", {
        method: "POST",
        headers: { "content-type": "application/json", "x-e2e-secret": "hold-secret-0123456789" },
        body: JSON.stringify({ run: `hold-${scenario}`, scenario }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { groupId: string; users: { maya: { deviceToken: string } } };
      const crewView = await t.query(api.crew.crew, {
        deviceToken: body.users.maya.deviceToken,
        groupId: body.groupId as never,
        day: "2026-11-15",
      });
      expect(crewView.holdEnabled).toBe(scenario === "demo" ? true : undefined);
    }
  });
});
