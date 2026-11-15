/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { makeT, token } from "./setup.helpers";

test("picked tags merge into the crew taste profile and read back for members only", async () => {
  const t = makeT();
  const made = await t.mutation(api.users.createGroup, { deviceToken: token("Arnav"), firstName: "Arnav", groupName: "Peace" });
  await t.mutation(api.taste.addMine, { deviceToken: token("Arnav"), groupId: made.groupId, tags: ["sunsets", "games"] });
  await t.mutation(api.taste.addMine, { deviceToken: token("Arnav"), groupId: made.groupId, tags: ["games", "free"] });
  expect(await t.query(api.taste.crew, { deviceToken: token("Arnav"), groupId: made.groupId })).toEqual(["sunsets", "games", "free"]);
  await t.mutation(api.users.createGroup, { deviceToken: token("Stranger"), firstName: "Stranger", groupName: "Other" });
  await expect(t.query(api.taste.crew, { deviceToken: token("Stranger"), groupId: made.groupId })).rejects.toThrow();
  await expect(
    t.mutation(api.taste.addMine, { deviceToken: token("Arnav"), groupId: made.groupId, tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }),
  ).rejects.toThrow();
});
