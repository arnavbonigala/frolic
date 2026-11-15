import { httpRouter } from "convex/server";
import { env, httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { PAGE_TEMPLATE } from "./pageTemplate";
import { OG_IMAGE_BASE64 } from "./ogImage";
import { heroBytes } from "./hero";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

type Share = {
  phase: string;
  host: string | null;
  group: string | null;
  card: { title: string; why: string | null; imageUrl: string | null; chips: string[] } | null;
};

function originOf(req: Request): string {
  return new URL(req.url).origin;
}

function renderPage(boot: Record<string, unknown>, share: Share, origin: string): string {
  const title = share.card ? `${share.card.title} · Frolic` : "Frolic";
  const desc =
    "Anyone free for this? Say you're down. It stays secret unless someone else is too.";
  const card = share.card?.imageUrl;
  const image = card ? (card.startsWith("http") ? card : `${origin}${card}`) : `${origin}/p/og.png`;
  const values: Record<string, string> = {
    TITLE: escapeHtml(title),
    DESC: escapeHtml(desc),
    URL: escapeHtml(`${origin}/p/${String(boot.code ?? "")}`),
    IMAGE: escapeHtml(image),
    CLOUD: escapeHtml(env.CONVEX_CLOUD_URL ?? ""),
    BOOT: JSON.stringify(boot).replace(/</g, "\\u003c"),
  };
  return PAGE_TEMPLATE.replace(/%%([A-Z]+)%%/g, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

export function registerWebRoutes(http: ReturnType<typeof httpRouter>): void {
  http.route({
    path: "/p/og.png",
    method: "GET",
    handler: httpAction(async () => {
      const bytes = Uint8Array.from(atob(OG_IMAGE_BASE64), (c) => c.charCodeAt(0));
      return new Response(bytes.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400, immutable",
        },
      });
    }),
  });

  http.route({
    pathPrefix: "/p/hero/",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      const key = new URL(req.url).pathname.slice("/p/hero/".length).replace(/\.(png|jpg)$/, "");
      const bytes = heroBytes(key);
      if (!bytes) return new Response("Not found", { status: 404 });
      return new Response(bytes.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }),
  });

  http.route({
    pathPrefix: "/p/",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const origin = originOf(req);
      const code = new URL(req.url).pathname.slice("/p/".length).replace(/\/+$/, "");
      const share = (
        code.length > 0 && code.length < 40
          ? await ctx.runQuery(internal.web.share.peek, { code })
          : null
      ) as Share | null;
      const boot: Record<string, unknown> = {
        code,
        cloudUrl: env.CONVEX_CLOUD_URL ?? "",
        appUrl: origin,
        phase: share ? share.phase : "invalid",
        host: share?.host ?? null,
        group: share?.group ?? null,
        card: share?.card ?? null,
      };
      const dead: Share = { phase: "invalid", host: null, group: null, card: null };
      return new Response(renderPage(boot, share ?? dead, origin), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=10",
          "X-Frame-Options": "DENY",
        },
      });
    }),
  });
}
