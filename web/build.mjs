import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const out = await build({entryPoints: ["web/src/client.js"], bundle: true, minify: true, format: "iife", platform: "browser", target: "es2020", write: false, define: {"process.env.NODE_ENV": '"production"'}});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("web/src/page.css", "utf8").replace(/\s*\n\s*/g, "");
const html = readFileSync("web/src/page.html", "utf8");
const body = html
  .split("%%")
  .map((part, i) => (i % 2 ? { CSS: css, JS: js }[part] ?? `%%${part}%%` : part))
  .join("");
writeFileSync("convex/web/pageTemplate.ts", "export const PAGE_TEMPLATE = " + JSON.stringify(body) + ";\n");
console.log("template bytes", body.length);

const dir = "web/heroes";
const heroes = existsSync(dir)
  ? readdirSync(dir).filter((name) => /^plan-[a-z0-9-]+\.jpg$/.test(name))
  : [];
const entries = heroes.map((name) => [name.replace(/\.jpg$/, ""), readFileSync(`${dir}/${name}`).toString("base64")]);
writeFileSync(
  "convex/web/heroes.ts",
  "export const HERO_IMAGES: Record<string, string> = {\n" +
    entries.map(([key, data]) => `  ${JSON.stringify(key)}: ${JSON.stringify(data)},`).join("\n") +
    "\n};\n",
);
console.log("heroes", heroes.join(", ") || "none yet");
