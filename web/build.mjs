import {build} from "esbuild";
import {readFileSync, writeFileSync} from "node:fs";

const out = await build({entryPoints: ["web/src/client.js"], bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", write: false, define: {"process.env.NODE_ENV": '"production"'}});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("web/src/page.css", "utf8").replace(/\s*\n\s*/g, "");
const html = readFileSync("web/src/page.html", "utf8");
const parts = html.split("%%");
const body = parts.map((p, i) => (i % 2 ? {CSS: css, JS: js}[p] ?? "%%" + p + "%%" : p)).join("");
writeFileSync("convex/web/pageTemplate.ts", "export const PAGE_TEMPLATE = " + JSON.stringify(body) + ";\n");
console.log("template bytes", body.length);
