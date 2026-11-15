const site = (process.env.SHARED_CONVEX_SITE_URL ?? "").replace(/\/$/, "");
const apiKey = process.env.KEIKI_API_KEY;
const e2eUrl = (process.env.E2E_URL ?? site).replace(/\/$/, "");
const e2eSecret = process.env.E2E_SECRET;
const run = process.argv[2] ?? "keiki" + Date.now().toString(36);
if (!site || !apiKey) throw new Error("SHARED_CONVEX_SITE_URL and KEIKI_API_KEY are required");
if (!e2eSecret) throw new Error("E2E_SECRET is required");

const FRIEND = { name: "Priya", phone: "+15105550200" };
const OTHER = { name: "Jordan", phone: "+15105550201" };

async function e2e(path: string, body?: unknown) {
  const res = await fetch(e2eUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-e2e-secret": e2eSecret!, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(path + " " + res.status + " " + (await res.text()).slice(0, 300));
  return await res.json();
}

let trace = 0;
async function tool(name: string, input: Record<string, unknown>, phone: string, context: Record<string, unknown> = {}) {
  trace++;
  const res = await fetch(site + "/keiki/tools/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": apiKey!, "X-Orchid-Trace-Id": "conv_" + trace },
    body: JSON.stringify({ input, context: { phone, ...context } }),
  });
  const body = await res.json();
  console.log("\n> " + name + " " + JSON.stringify(input) + "  [" + phone + "]");
  console.log("  " + res.status + " " + JSON.stringify(body));
  return body as Record<string, unknown>;
}

async function turn(who: { name: string; phone: string }, text: string) {
  console.log("\n=== " + who.name + " texts: " + text);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const seed = (await e2e("/e2e/seed", { run, scenario: "demo" })) as { inviteCode: string; frolicId: string };
console.log("seeded run " + run + " invite " + seed.inviteCode + " frolic " + seed.frolicId);

turn(FRIEND, "hi, Maya sent me the code " + seed.inviteCode);
await tool("get_member", {}, FRIEND.phone);
await tool("join_crew", { invite_code: seed.inviteCode, first_name: FRIEND.name }, FRIEND.phone);
await tool("get_member", {}, FRIEND.phone);
await tool("get_today", {}, FRIEND.phone);

turn(FRIEND, "down, but only if Maya is in");
const tap = await tool("tap_only_if", { names: ["Maya"] }, FRIEND.phone);
if ((tap as { ok?: boolean }).ok !== true) throw new Error("the only if tap did not land");

turn(FRIEND, "wait, is anyone else down?");
const before = await tool("get_reveal", {}, FRIEND.phone);

turn(OTHER, "down");
await tool("join_crew", { invite_code: seed.inviteCode, first_name: OTHER.name }, OTHER.phone);
await tool("tap_down", {}, OTHER.phone);
const after = await tool("get_reveal", {}, OTHER.phone);
const same = JSON.stringify(before.state) === JSON.stringify(after.state);
console.log("\nsecrecy: both asked get_reveal before the reveal and got state " + JSON.stringify(before.state) + " and " + JSON.stringify(after.state) + ", identical answer: " + same);

console.log("\nwaiting 3s for the scheduled flip");
await sleep(3000);
const reveals = (await e2e("/e2e/reveals?run=" + run)) as { reveals: unknown[] };
console.log("reveal log: " + JSON.stringify(reveals.reveals));

turn(FRIEND, "is it on?");
const reveal = await tool("get_reveal", {}, FRIEND.phone);
if ((reveal as { state?: string }).state !== "on") console.log("note: reveal state is " + JSON.stringify(reveal));

turn(FRIEND, "I'm here");
await tool("check_in", { lat: 37.8925, lng: -122.2717 }, FRIEND.phone);
await tool("on_my_way", { minutes: 12 }, FRIEND.phone);

const advance = (await e2e("/e2e/advance", { run })) as { frolicId: string };
console.log("\nadvanced to the kayaks frolic " + advance.frolicId);
await tool("get_today", {}, FRIEND.phone);
await tool("tap_down", {}, FRIEND.phone);
await tool("tap_down", {}, OTHER.phone);
await sleep(3000);
await tool("get_reveal", {}, FRIEND.phone);
await tool("pay_deposit", {}, FRIEND.phone, { preflight: true });
await tool("pay_deposit", {}, FRIEND.phone);

turn(FRIEND, "remember I hate hiking, free after 6 on weekdays");
await tool("remember", { text: "hates hiking, free after 6 on weekdays" }, FRIEND.phone);
turn(FRIEND, "stop texting me");
await tool("pause", {}, FRIEND.phone);
await tool("get_member", {}, FRIEND.phone);
console.log("\nconversation complete on run " + run);
