declare const process: { env: Record<string, string | undefined> };
import { describe, expect, test } from "vitest";
import { createClient } from "./client";
import { buildContext, ensureNamespace, findWhyThis } from "./context";
import { groupNamespace, personalNamespace, planWrites } from "./mapping";

const live = process.env.SUPERMEMORY_LIVE === "1" && !!process.env.SUPERMEMORY_API_KEY;

describe.skipIf(!live)("live Supermemory proof", () => {
  test("two skips suppress a tag, the why line cites a real memory, personal facts stay out of the group, cleanup", async () => {
    const client = createClient(process.env.SUPERMEMORY_API_KEY!);
    const run = "proof" + Date.now();
    const groupId = run + "g";
    const maya = run + "m";
    const dev = run + "d";
    const gNs = groupNamespace(groupId);
    const mNs = personalNamespace(maya);
    const dNs = personalNamespace(dev);
    const send = async (key: string, e: Parameters<typeof planWrites>[1]) => {
      for (const w of planWrites(key, e).writes) {
        await ensureNamespace(client, w.namespace, w.scope);
        await client.add(w.namespace, { content: w.content, id: w.id, metadata: w.metadata, date: w.date });
      }
    };
    try {
      await send("limit1", { kind: "limit", groupId, userId: maya, payload: { text: "Maya is vegetarian, has no car and keeps nights under 10 dollars." } });
      await send("tap1", { kind: "tap", groupId, userId: dev, payload: { title: "Marina Sunset Walk", tags: ["sunset"], day: "2026-10-12" } });
      await send("rev1", {
        kind: "reveal", groupId, revealAt: 0,
        payload: { title: "Marina Sunset Walk", placeName: "Cesar Chavez Park", tags: ["sunset"], memberIds: [maya, dev], memberNames: ["Maya", "Dev"], day: "2026-10-12" },
      });
      await send("gs1", { kind: "group_skip", groupId, payload: { tag: "boba", count: 1, day: "2026-11-10" } });
      await send("gs2", { kind: "group_skip", groupId, payload: { tag: "boba", count: 2, day: "2026-11-12" } });

      let nights: Awaited<ReturnType<typeof buildContext>>["pastNights"] = [];
      let ctx = await buildContext(client, gNs, [{ tag: "sunset", liked: 1, skipped: 0 }, { tag: "boba", liked: 0, skipped: 2 }]);
      for (let i = 0; i < 30 && ctx.pastNights.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        ctx = await buildContext(client, gNs, [{ tag: "sunset", liked: 1, skipped: 0 }, { tag: "boba", liked: 0, skipped: 2 }]);
      }
      nights = ctx.pastNights;
      expect(ctx.suppressed).toEqual(["boba"]);
      expect(ctx.likedTags).toEqual(["sunset"]);
      expect(nights.some((n) => n.text.includes("Cesar Chavez Park"))).toBe(true);

      const why = await findWhyThis(client, gNs, ["sunset"]);
      expect(why?.text).toContain("Maya, Dev went to Cesar Chavez Park");

      const groupTexts = (await client.search(gNs, { query: "vegetarian no car budget", limit: 20, threshold: 0, searchMode: "hybrid" })).map((r) => r.memory ?? r.chunk ?? "").join(" ");
      expect(groupTexts.toLowerCase()).not.toContain("vegetarian");
      expect(groupTexts.toLowerCase()).not.toContain("no car");

      const personal = (await client.search(mNs, { query: "vegetarian", limit: 5, threshold: 0, searchMode: "hybrid" })).map((r) => r.memory ?? r.chunk ?? "").join(" ");
      expect(personal.toLowerCase()).toContain("vegetarian");

      const del = await client.deleteNamespace(mNs);
      expect(del.deletedDocumentsCount).toBeGreaterThan(0);
      const after = await client.search(mNs, { query: "vegetarian", threshold: 0, searchMode: "hybrid" }).catch(() => []);
      expect(after).toEqual([]);
      console.log("LIVE PROOF why:", why?.text, "| suppressed:", ctx.suppressed);
    } finally {
      for (const ns of [gNs, mNs, dNs]) await client.deleteNamespace(ns).catch(() => null);
    }
  }, 180_000);
});
