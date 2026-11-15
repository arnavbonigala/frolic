import type { HttpRouter } from "convex/server";
import { httpAction } from "../_generated/server";
import { portraitBytes } from "./portraits";

export function registerAvatarRoutes(http: HttpRouter): void {
  http.route({
    pathPrefix: "/p/avatar/",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      const key = new URL(req.url).pathname
        .slice("/p/avatar/".length)
        .replace(/\.jpg$/, "");
      const bytes = portraitBytes(key);
      if (!bytes) return new Response("Not found", { status: 404 });
      return new Response(bytes.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }),
  });
}
