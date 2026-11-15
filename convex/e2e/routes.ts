import type { HttpRouter } from "convex/server";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";

declare const process: { env: Record<string, string | undefined> };

const RUN = /^[A-Za-z0-9_-]{1,64}$/;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function denied(req: Request): Response | null {
  const secret = process.env.E2E_SECRET;
  if (!secret) return json({ error: "Not found" }, 404);
  if (req.headers.get("x-e2e-secret") !== secret) return json({ error: "Unauthorized" }, 401);
  return null;
}

async function jsonBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (!text.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function readRun(body: Record<string, unknown> | null): string | null {
  if (!body) return null;
  const run = body.run;
  return typeof run === "string" && RUN.test(run) ? run : null;
}

export function registerE2eRoutes(http: HttpRouter): void {
  http.route({
    path: "/e2e/reset",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const rejection = denied(req);
      if (rejection) return rejection;
      const run = readRun(await jsonBody(req));
      if (!run) return json({ error: "run must be 1 to 64 characters of A-Z a-z 0-9 _ -" }, 400);
      const result = await ctx.runMutation(internal.e2e.admin.reset, { run });
      return json({ run, cleared: result.cleared }, 200);
    }),
  });

  http.route({
    path: "/e2e/seed",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const rejection = denied(req);
      if (rejection) return rejection;
      const body = await jsonBody(req);
      const run = readRun(body);
      if (!run || !body) return json({ error: "run must be 1 to 64 characters of A-Z a-z 0-9 _ -" }, 400);
      const scenario = body.scenario;
      if (scenario !== undefined && scenario !== "three-phone" && scenario !== "demo") {
        return json({ error: "scenario must be three-phone or demo" }, 400);
      }
      const result = await ctx.runMutation(internal.e2e.admin.seed, {
        run,
        scenario,
      });
      return json(result, 200);
    }),
  });

  http.route({
    path: "/e2e/advance",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const rejection = denied(req);
      if (rejection) return rejection;
      const run = readRun(await jsonBody(req));
      if (!run) return json({ error: "run must be 1 to 64 characters of A-Z a-z 0-9 _ -" }, 400);
      const frolicId = await ctx.runMutation(internal.e2e.admin.advance, { run });
      if (!frolicId) return json({ error: "No demo seed for this run" }, 404);
      return json({ run, frolicId }, 200);
    }),
  });

  http.route({
    path: "/e2e/skip-boba",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const rejection = denied(req);
      if (rejection) return rejection;
      const run = readRun(await jsonBody(req));
      if (!run) return json({ error: "run must be 1 to 64 characters of A-Z a-z 0-9 _ -" }, 400);
      const result = await ctx.runMutation(internal.memory.e2eBeat.skipBobaTwice, { run });
      if (!result) return json({ error: "No demo seed for this run" }, 404);
      return json({ run, ...result }, 200);
    }),
  });

  http.route({
    path: "/e2e/reveals",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const rejection = denied(req);
      if (rejection) return rejection;
      const run = new URL(req.url).searchParams.get("run");
      if (!run || !RUN.test(run)) {
        return json({ error: "run must be 1 to 64 characters of A-Z a-z 0-9 _ -" }, 400);
      }
      const reveals = await ctx.runQuery(internal.e2e.admin.revealLog, { run });
      return json({ reveals }, 200);
    }),
  });
}
