import puppeteer from "puppeteer-core";
import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

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
  if (trimmed === "null") return null;
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
  await page.goto(`${SITE}/p/x`);
  await page.evaluate(() => localStorage.clear());
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
  await page.waitForFunction(() => document.body.innerText.includes("It's on."), { timeout: 12000, polling: 16 });
  console.log("flip ms after the second yes", Date.now() - t1);
  await sleep(90);
  await shot("05-its-on-bloom", "the instant revealAt passes, petals and the bloom");
  await sleep(1200);
  run("web/devSeed:setAvatar", { name: "Maya", key: "maya" });
  run("web/devSeed:setAvatar", { name: "Dev", key: "dev" });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".card image")].length === 2,
    { timeout: 5000 },
  );
  await sleep(700);
  await shot("06-its-on", "it's on, settled, with the demo portraits in the flowers");
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
  const html = await (await fetch(`${SITE}/p/${code}`)).text();
  const dead = html
    .replace(/"cloudUrl":"[^"]*"/, '"cloudUrl":"http://127.0.0.1:9/"')
    .replace("<head>", `<head><base href="${SITE}/">`);
  if (dead === html) throw new Error("could not point the page at a dead backend");
  const file = `${process.env.HOME}/.capy/work/frolic-error.html`;
  writeFileSync(file, dead);
  await newPage();
  await page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#f");
  await page.type("#wn", "Maya");
  await page.click(".btn");
  await page.waitForFunction(
    () => document.body.innerText.includes("Your yes did not reach Frolic. Check your connection and try again."),
    { timeout: 20000 },
  );
  const visible = await page.evaluate(() => {
    const err = document.querySelector(".err");
    const btn = document.querySelector(".btn");
    return {
      err: err ? err.getBoundingClientRect().height > 0 : false,
      retry: btn ? btn.textContent.trim() === "Try again" && btn.getBoundingClientRect().height >= 44 : false,
      planted: document.body.innerText.includes("Waiting for a friend"),
    };
  });
  if (!visible.err || !visible.retry || visible.planted) {
    throw new Error("error state is not visibly an error: " + JSON.stringify(visible));
  }
  await sleep(300);
  await shot("12-error", "the yes did not reach the backend, so the page says so with a retry");
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
  await page.waitForFunction(() => document.body.innerText.includes("It's on."), { timeout: 12000, polling: 16 });
  await sleep(300);
  const petals = await page.evaluate(() => document.querySelectorAll(".petal").length);
  console.log("reduced motion petals", petals);
  await shot("13-reduced-motion", "reduce motion: same reveal, no petals");
  await other.close();
  await page.close();
  page = null;
}

await browser.close();
