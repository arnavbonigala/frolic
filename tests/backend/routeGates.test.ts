/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { NOON, flipDue, makeT, setupCrew, tap, token } from "./setup.helpers";

const SECRET = "route-gate-secret-0123456789abcdef";
const E2E_WRITES = ["/e2e/reset", "/e2e/seed", "/e2e/advance", "/e2e/skip-boba"];
const CREDENTIAL_HEADERS = ["x-e2e-secret", "authorization", "x-device-token", "x-api-key", "x-orchid-api-key"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  vi.stubEnv("E2E_SECRET", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function post(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return makeT().fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ run: "gate-run" }),
  });
}

describe("the e2e routes are closed", () => {
  test("with no secret set every e2e route answers 404 and names nothing", async () => {
    const t = makeT();
    for (const path of E2E_WRITES) {
      const res = await t.fetch(path, { method: "POST" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    const reveals = await t.fetch("/e2e/reveals?run=gate-run", { method: "GET" });
    expect(reveals.status).toBe(404);
    expect(JSON.stringify(await reveals.json())).not.toContain("e2e");
  });

  test("a secret too short to guess against is refused the same way", async () => {
    vi.stubEnv("E2E_SECRET", "e2e");
    const res = await post("/e2e/reset", { "x-e2e-secret": "e2e" });
    expect(res.status).toBe(404);
  });

  test("a secret borrowed from a provider key is refused", async () => {
    vi.stubEnv("E2E_SECRET", "provider-secret-0123456789");
    vi.stubEnv("OPENAI_API_KEY", "provider-secret-0123456789");
    const res = await post("/e2e/reset", { "x-e2e-secret": "provider-secret-0123456789" });
    expect(res.status).toBe(404);
  });

  test("a wrong secret is refused", async () => {
    vi.stubEnv("E2E_SECRET", SECRET);
    const res = await post("/e2e/reset", { "x-e2e-secret": "route-gate-secret-ffffffffffffffff" });
    expect(res.status).toBe(401);
  });

  test("a real user's own device token never opens a route, and clears nothing", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    vi.stubEnv("E2E_SECRET", SECRET);
    for (const header of CREDENTIAL_HEADERS) {
      const res = await t.fetch("/e2e/reset", {
        method: "POST",
        headers: { "content-type": "application/json", [header]: token("Maya") },
        body: JSON.stringify({ run: "maya" }),
      });
      expect(res.status).toBe(401);
    }
    const still = await t.run(async (ctx) => await ctx.db.get("groups", crew.groupId));
    expect(still?.name).toBe("Sunset Crew");
  });

  test("the secret in a query string or a body is not a credential", async () => {
    vi.stubEnv("E2E_SECRET", SECRET);
    const query = await makeT().fetch(`/e2e/reveals?run=gate-run&x-e2e-secret=${SECRET}`, { method: "GET" });
    expect(query.status).toBe(401);
    const body = await makeT().fetch("/e2e/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ run: "gate-run", secret: SECRET }),
    });
    expect(body.status).toBe(401);
  });

  test("the right secret in the right header is the only way in", async () => {
    vi.stubEnv("E2E_SECRET", SECRET);
    const res = await post("/e2e/reset", { "x-e2e-secret": SECRET });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ run: "gate-run", cleared: 0 });
  });
});

describe("the image routes cannot be walked", () => {
  const UNKNOWN = ["__proto__", "constructor", "toString", "hasOwnProperty", "%2e%2e%2fog.png", "sam", "maya.jpg.jpg"];

  test("a known portrait comes back as a jpeg and never as a page", async () => {
    const res = await makeT().fetch("/p/avatar/maya.jpg", { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  test("an unknown portrait key is a 404, not an empty image", async () => {
    const t = makeT();
    for (const key of UNKNOWN) {
      const res = await t.fetch(`/p/avatar/${key}`, { method: "GET" });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type") ?? "").not.toContain("image");
    }
  });

  test("a person cannot be addressed by id, so the route enumerates nobody", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Dev"]);
    for (const id of Object.values(crew.ids)) {
      const res = await t.fetch(`/p/avatar/${id}`, { method: "GET" });
      expect(res.status).toBe(404);
    }
  });

  test("the hero and pay art routes refuse a prototype key", async () => {
    const t = makeT();
    for (const path of ["/p/hero/__proto__", "/p/hero/constructor", "/pay-art/__proto__", "/pay-art/constructor"]) {
      const res = await t.fetch(path, { method: "GET" });
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type") ?? "").not.toContain("image");
    }
  });
});

describe("the join page tells a stranger nothing about the crew", () => {
  test("a stranger reads no mates, and a member does", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Quillon", "Zinnia"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Quillon");
    await flipDue(t);
    const shared = await t.mutation(api.web.share.create, { frolicId: crew.frolicId, deviceToken: token("Maya") });

    const stranger = await t.query(api.web.share.watch, { code: shared.code, deviceToken: token("Eve") });
    expect(stranger.mates).toEqual([]);
    expect(stranger.me).toBeNull();
    expect(stranger.revealAt).toBeNull();

    const member = await t.query(api.web.share.watch, { code: shared.code, deviceToken: token("Maya") });
    expect(member.mates.map((mate) => mate.name)).toContain("Quillon");
  });

  test("the rendered page names the host and nobody else", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Quillon", "Zinnia"]);
    await tap(t, crew, "Maya");
    await tap(t, crew, "Quillon");
    await flipDue(t);
    const shared = await t.mutation(api.web.share.create, { frolicId: crew.frolicId, deviceToken: token("Maya") });

    const res = await t.fetch(`/p/${shared.code}`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Maya");
    expect(html).not.toContain("Quillon");
    expect(html).not.toContain("Zinnia");
    expect(html).not.toContain(token("Maya"));
    const boot = JSON.parse(/<script id="boot" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]) as Record<string, unknown>;
    expect(Object.keys(boot).sort()).toEqual(["appUrl", "card", "cloudUrl", "code", "group", "host", "phase"]);
    expect(JSON.stringify(boot)).not.toContain("Quillon");
  });

  test("an expired code still renders a page with no crew in it", async () => {
    const t = makeT();
    const crew = await setupCrew(t, ["Maya", "Quillon"]);
    const shared = await t.mutation(api.web.share.create, { frolicId: crew.frolicId, deviceToken: token("Maya") });
    const res = await t.fetch(`/p/${shared.code}.wrong`, { method: "GET" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("Quillon");
    expect(html).not.toContain("Sunset Crew");
  });
});

describe("no secret reaches the repo or a log", () => {
  const sources = import.meta.glob(["/convex/**/*.ts", "/tests/**/*.ts", "/scripts/**/*", "/e2e/**/*", "/keiki/**/*", "/ios/**/*.swift", "/web/**/*"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  const PUBLISHED_PLACEHOLDERS = ["sk_test_0123456789abcdef", "sk_live_0123456789abcdef"];

  const KEY_SHAPES = [
    /\bsk-(?!test_|live_)[A-Za-z0-9_-]{20,}/,
    /\bsk_(?:test|live)_[A-Za-z0-9]{16,}/,
    /\bwhop_[A-Za-z0-9]{16,}/,
    /\bwhsec_[A-Za-z0-9]{16,}/,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    /\bAIza[0-9A-Za-z_-]{20,}/,
    /\bBearer\s+[A-Za-z0-9._-]{20,}/,
  ];

  const LOGS_A_SECRET = /console\.(?:log|error|warn|info|debug)\(.*(?:body|payload|token|secret|apikey|api_key|password)/i;

  function scanned(): [string, string][] {
    return Object.entries(sources).filter(([path]) => !path.endsWith("routeGates.test.ts") && !path.includes("_generated"));
  }

  function scannable(text: string): string {
    let out = text;
    for (const placeholder of PUBLISHED_PLACEHOLDERS) out = out.split(placeholder).join("");
    return out;
  }

  const ASSET_MODULES = ["pageTemplate.ts", "ogImage.ts", "heroes.ts", "hero.ts", "portraits.ts", "art.ts"];

  function backend(): [string, string][] {
    return scanned().filter(
      ([path, source]) => path.startsWith("/convex/") && !ASSET_MODULES.some((name) => path.endsWith(name)) && source.length < 20000,
    );
  }

  test("the scan reads the schema, the app, the flows and the tests", () => {
    const paths = scanned().map(([path]) => path);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths.some((path) => path.includes("/convex/"))).toBe(true);
    expect(paths.some((path) => path.includes("/ios/"))).toBe(true);
    expect(paths.some((path) => path.includes("/tests/"))).toBe(true);
  });

  test("no provider key is a literal anywhere in the repo", () => {
    const hits: string[] = [];
    for (const [path, source] of scanned()) {
      const text = scannable(source);
      for (const shape of KEY_SHAPES) if (shape.test(text)) hits.push(`${path} ${shape}`);
    }
    expect(hits).toEqual([]);
  });

  test("no console call carries a body, a token or a secret", () => {
    const hits = backend().filter(([, source]) => LOGS_A_SECRET.test(source)).map(([path]) => path);
    expect(hits).toEqual([]);
  });

  test("the backend logs through error and warn only", () => {
    const hits = backend().filter(([, source]) => /console\.log\(/.test(source)).map(([path]) => path);
    expect(hits).toEqual([]);
  });

  test("every provider key the code reads is an environment name", () => {
    const reads = scanned().flatMap(([, source]) => source.match(/process\.env\.[A-Z_]+/g) ?? []);
    expect(reads.length).toBeGreaterThan(5);
    expect(reads.every((read) => /^process\.env\.[A-Z_]+$/.test(read))).toBe(true);
  });
});
