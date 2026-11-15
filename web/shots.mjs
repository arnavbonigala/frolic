import puppeteer from "puppeteer-core";
import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const SITE = process.env.SITE ?? "http://127.0.0.1:3213";
const CLOUD = process.env.CLOUD ?? "http://127.0.0.1:3212";
const OUT = process.env.OUT ?? `${process.env.HOME}/.capy/work/shots`;
const only = process.argv[2] ?? "all";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

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
  const code = run("web/devSeed:frolicInvite", { frolicId });
  return { frolicId, code };
};

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--user-data-dir=/tmp/frolic-shots"],
});

let page;
const newPage = async () => {
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  return page;
};
const shot = async (name, caption) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name, caption ?? "");
};

if (only === "all" || only === "loading") {
  const { code } = newLink();
  await newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 3200,
    downloadThroughput: 60000,
    uploadThroughput: 30000,
  });
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "domcontentloaded" });
  await sleep(900);
  await shot("01-loading", "first paint on slow cellular, before the subscription resolves");
  await page.close();
  page = null;
}

if (only === "all" || only === "card") {
  const { code } = newLink("open");
  await newPage();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await sleep(400);
  await shot("02-card", "open: the seed packet, a first name, a secret I'm down");
  await page.click("#wn");
  await page.type("#wn", "Maya");
  await sleep(300);
  await shot("03-typed", "name typed, button ready");
  const t0 = Date.now();
  await page.click(".btn");
  await page.waitForSelector(".card .row", { timeout: 8000 });
  console.log("yes round trip ms", Date.now() - t0);
  await sleep(500);
  await shot("04-planted", "planted: your bud, only you know");

  const other = new ConvexClient(CLOUD);
  await other.mutation(anyApi.web.share.join, { code, deviceToken: "device-dev-0123456789abcdefghijklmnopq", name: "Dev" });
  const t1 = Date.now();
  await page.waitForFunction(() => document.body.innerText.includes("It\u2019s on."), { timeout: 12000, polling: 16 });
  console.log("flip ms after the second yes", Date.now() - t1);
  await sleep(90);
  await shot("05-its-on-bloom", "the instant revealAt passes, petals and the bloom");
  await sleep(1800);
  await shot("06-its-on", "it's on, settled");
  await other.close();
  await page.close();
  page = null;
}

if (only === "all" || only === "drifted") {
  const { code } = newLink("drifted");
  await newPage();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await sleep(700);
  await shot("07-drifted", "drifted off: nobody else said yes in time");
  await page.close();
  page = null;
}

if (only === "all" || only === "expired") {
  const { code } = newLink("done");
  await newPage();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await sleep(700);
  await shot("08-expired", "expired: the frolic is over");
  await page.close();
  page = null;
}

if (only === "all" || only === "invalid") {
  await newPage();
  await page.goto(`${SITE}/p/nosuchlink`, { waitUntil: "networkidle0" });
  await sleep(600);
  await shot("09-invalid", "invalid link");
  await page.close();
  page = null;
}

if (only === "all" || only === "offline") {
  const { code } = newLink();
  await newPage();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await page.setOfflineMode(true);
  await sleep(700);
  await shot("10-offline", "offline: the yes is not sent, the page says so");
  await page.setOfflineMode(false);
  await sleep(900);
  await shot("11-reconnected", "back online, the page recovers");
  await page.close();
  page = null;
}

if (only === "all" || only === "error") {
  const { code } = newLink();
  await newPage();
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().startsWith(CLOUD) && !req.url().includes("/version")) req.abort();
    else req.continue();
  });
  await page.type("#wn", "Maya");
  await page.click(".btn");
  await sleep(2500);
  await shot("12-error", "the yes did not go through, said plainly");
  await page.close();
  page = null;
}

if (only === "all" || only === "a11y") {
  const { code } = newLink();
  await newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(`${SITE}/p/${code}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#f");
  await page.type("#wn", "Maya");
  await page.click(".btn");
  await page.waitForSelector(".card .row");
  const other = new ConvexClient(CLOUD);
  await other.mutation(anyApi.web.share.join, { code, deviceToken: "device-dev-0123456789abcdefghijklmnopq", name: "Dev" });
  await page.waitForFunction(() => document.body.innerText.includes("It\u2019s on."), { timeout: 12000, polling: 16 });
  await sleep(300);
  const petals = await page.evaluate(() => document.querySelectorAll(".petal").length);
  console.log("reduced motion petals", petals);
  await shot("13-reduced-motion", "reduce motion: same reveal, no petals");
  await other.close();
  await page.close();
  page = null;
}

await browser.close();
