import { TOOLS_BASE_URL } from "./agent";

const base = (process.argv[2] ?? TOOLS_BASE_URL).replace(/\/$/, "");
const apiKey = process.env.KEIKI_API_KEY;
if (!base.startsWith("https://") && !base.startsWith("http://")) throw new Error("Pass the Convex site URL as the first argument");
if (!apiKey) throw new Error("KEIKI_API_KEY is not set");

const TOOLS = [
  "get_member",
  "join_crew",
  "get_today",
  "tap_down",
  "tap_only_if",
  "tap_pass",
  "get_reveal",
  "on_my_way",
  "check_in",
  "submit_snap",
  "pay_deposit",
  "remember",
  "pause",
  "im_free",
  "answer_pick",
];

type Row = { tool: string; anonymous: number; authenticated: number; shaped: boolean; verdict: string };

async function probe(tool: string): Promise<Row> {
  const url = base + "/keiki/tools/" + tool;
  const anonymous = await fetch(url, { method: "POST", body: "{}" });
  const authorized = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Orchid-Api-Key": apiKey! },
    body: JSON.stringify({ input: {}, context: { phone: "+15550000000" } }),
  });
  const text = await authorized.text();
  let shaped = false;
  try {
    shaped = typeof (JSON.parse(text) as { ok?: unknown }).ok === "boolean";
  } catch {
    shaped = false;
  }
  const verdict =
    anonymous.status === 401 && authorized.status < 500 && shaped
      ? "ok"
      : anonymous.status === 404
        ? "route missing (main not deployed?)"
        : "check";
  return { tool, anonymous: anonymous.status, authenticated: authorized.status, shaped, verdict };
}

const rows: Row[] = [];
for (const tool of TOOLS) rows.push(await probe(tool));
console.log("base " + base);
console.log("| tool | no key | with key | shaped | verdict |");
console.log("| --- | --- | --- | --- | --- |");
for (const row of rows) console.log("| " + row.tool + " | " + row.anonymous + " | " + row.authenticated + " | " + row.shaped + " | " + row.verdict + " |");
const bad = rows.filter((row) => row.verdict !== "ok");
console.log(bad.length === 0 ? "all " + rows.length + " routes answer" : bad.length + " of " + rows.length + " need attention");
process.exit(bad.length === 0 ? 0 : 1);
