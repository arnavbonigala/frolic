import puppeteer from "puppeteer-core";
import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import { execFileSync } from "node:child_process";

const SITE = process.env.SITE ?? "http://127.0.0.1:3213";
const CLOUD = process.env.CLOUD ?? "http://127.0.0.1:3212";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = (fn, args, attempt = 0) => {
  const out = execFileSync("npx", ["convex", "run", fn, JSON.stringify(args ?? {})], {
    encoding: "utf8",
  });
  const trimmed = out.trim();
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  const from = out.indexOf("{");
  if (from === -1) {
    if (attempt < 3) return run(fn, args, attempt + 1);
    throw new Error(`convex run ${fn} returned nothing`);
  }
  return JSON.parse(out.slice(from, out.lastIndexOf("}") + 1));
};

const newLink = (mode) => {
  const { frolicId } = run("web/devSeed:seed", { mode });
  return { frolicId, code: run("web/devSeed:frolicInvite", { frolicId }) };
};

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--user-data-dir=/tmp/frolic-audit"],
});

const problems = [];
const audited = [];

const audit = async (name, page) => {
  const result = await page.evaluate(() => {
    const app = document.getElementById("app");
    const buttons = [...document.querySelectorAll("button, a.btn, .btn")].map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent || "").trim().slice(0, 30), height: Math.round(r.height) };
    });
    const input = document.querySelector("input");
    const heading = document.querySelector("h1");
    return {
      text: document.body.innerText.replace(/\n+/g, " | ").slice(0, 400),
      heading: heading ? heading.textContent : null,
      overflowX: app ? app.scrollWidth - app.clientWidth : 0,
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buttons,
      inputHeight: input ? Math.round(input.getBoundingClientRect().height) : null,
      bg: getComputedStyle(document.body).backgroundColor,
      appWidth: app ? Math.round(app.getBoundingClientRect().width) : null,
    };
  });
  audited.push({ state: name, ...result });
  if (result.overflowX > 0 || result.pageOverflowX > 0) problems.push(`${name}: horizontal overflow`);
  for (const b of result.buttons) if (b.height < 44) problems.push(`${name}: tap target ${b.height}px "${b.text}"`);
  if (result.inputHeight !== null && result.inputHeight < 44) problems.push(`${name}: input under 44px`);
  if (/—|!/.test(result.text)) problems.push(`${name}: copy has an em dash or exclamation`);
  return result;
};

const fresh = async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("404")) errors.push(m.text());
  });
  return { page, errors };
};

{
  const { code } = newLink("open");
  const { page, errors } = await fresh();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await audit("open", page);
  await page.type("#wn", "Maya");
  await page.click(".btn");
  await page.waitForSelector(".card .row");
  await audit("planted", page);
  const other = new ConvexClient(CLOUD);
  await other.mutation(anyApi.web.share.join, {
    code,
    deviceToken: "device-dev-0123456789abcdefghijklmnopq",
    name: "Dev",
  });
  const t0 = Date.now();
  await page.waitForFunction(() => document.body.innerText.includes("It\u2019s on."), {
    timeout: 12000,
    polling: 16,
  });
  const flipped = Date.now() - t0;
  const petals = await page.evaluate(() => document.querySelectorAll(".petal").length);
  await audit("on", page);
  console.log(JSON.stringify({ flippedMs: flipped, petals }, null, 0));
  if (petals === 0) problems.push("on: no petals at the bloom");
  if (errors.length) problems.push(`on: console errors ${errors.join(" / ")}`);
  await other.close();
  await page.close();
}

for (const mode of ["drifted", "done"]) {
  const { code } = newLink(mode);
  const { page } = await fresh();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await sleep(500);
  await audit(mode === "done" ? "expired" : "drifted", page);
  await page.close();
}

{
  const { page } = await fresh();
  await page.goto(`${SITE}/p/nosuchcod`, { waitUntil: "networkidle0" });
  await sleep(400);
  await audit("invalid", page);
  await page.close();
}

{
  const { code } = newLink("open");
  const { page } = await fresh();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await page.setOfflineMode(true);
  await sleep(600);
  const offline = await audit("offline", page);
  if (!offline.text.includes("offline")) problems.push("offline: no offline copy on screen");
  await page.setOfflineMode(false);
  await page.close();
}

console.log(JSON.stringify({ audited, problems }, null, 2));
await browser.close();
process.exit(problems.length ? 1 : 0);
