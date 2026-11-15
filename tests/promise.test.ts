/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PAGE_TEMPLATE } from "../convex/web/pageTemplate";
import { PROMISE } from "../convex/lib/copy";
import { SAM_PHONE, nowFor, seedCrew } from "../keiki/test/seed";
import { API_KEY, makeT, testEnv, toolResult } from "../keiki/test/harness";

const sources = import.meta.glob("../web/src/client.js", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(nowFor("sunset")));
  testEnv().KEIKI_API_KEY = API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
  delete testEnv().KEIKI_API_KEY;
});

const digits = (text: string) => text.match(/\d/g) ?? [];

describe("the promise line", () => {
  test("is one short sentence with no count or stat in it", () => {
    expect(PROMISE).toBe("Be the friend who says yes.");
    expect(digits(PROMISE)).toEqual([]);
    expect(PROMISE.split(" ").length).toBeLessThanOrEqual(8);
  });

  test("opens the web page, above the plan card, and never on the faded page", () => {
    expect(PAGE_TEMPLATE).toContain(PROMISE);

    const client = Object.values(sources)[0];
    expect(client).toContain("import {FADED_TITLE, FADED_BODY, PROMISE}");
    expect(client).toContain('<p class="from" style="padding-top:16px">' + "' + esc(PROMISE) + \"</p>\"");

    const paint = client.slice(client.indexOf("app.innerHTML = banner()"));
    const order = paint.slice(0, paint.indexOf(";"));
    expect(order.indexOf("promise(v)")).toBeGreaterThan(order.indexOf("head("));
    expect(order.indexOf("promise(v)")).toBeLessThan(order.indexOf("packet("));

    const gate = client.slice(client.indexOf("function promise(v)"));
    const body = gate.slice(0, gate.indexOf("}"));
    for (const phase of ['"drifted"', '"invalid"', '"expired"']) expect(body).toContain(phase);
  });

  test("opens Keiki's first text to a new person", async () => {
    const t = makeT();
    await seedCrew(t);
    const joined = await toolResult(t, "join_crew", {
      phone: "+15105550198",
      input: { invite_code: "SUNSET", first_name: "Kai" },
    });
    expect(joined.body.ok).toBe(true);
    expect(joined.body.welcome).toBe(PROMISE);
    expect(joined.body.say).toContain(PROMISE);
    expect(digits(JSON.stringify(joined.body))).toEqual([]);
    const today = await toolResult(t, "get_today", { phone: "+15105550198" });
    expect(today.body.ok).toBe(true);
  });

  test("is not something Keiki or the page can invent a count for", async () => {
    const t = makeT();
    await seedCrew(t);
    await toolResult(t, "join_crew", { phone: SAM_PHONE, input: { invite_code: "SUNSET", first_name: "Kai" } });
    expect(PROMISE).not.toMatch(/%|\$|\b(most|everyone|thousands|million)\b/i);
  });
});
