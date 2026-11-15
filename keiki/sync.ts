import { AGENT_ID, DEDICATED_LINE, TOOLS_BASE_URL, kit } from "./agent";

const KEIKI = "https://onkeiki.com/api/v1/developer";
const apiKey = process.env.KEIKI_API_KEY;
if (!apiKey) throw new Error("KEIKI_API_KEY is not set");
if (!TOOLS_BASE_URL.startsWith("https://")) throw new Error("Set FROLIC_TOOLS_BASE_URL or SHARED_CONVEX_SITE_URL to the Convex site URL");

const dryRun = process.argv.includes("--dry-run");
const realFetch = globalThis.fetch;
const headers = { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" };

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; policy?: unknown };
type SyncBody = Record<string, unknown> & { tools: Tool[]; system_prompt: string; features: Record<string, boolean> };

function normalize(schema: Record<string, unknown>) {
  if (schema.type === "object" && schema.properties) return { type: "object", properties: schema.properties, required: schema.required ?? [] };
  return { type: "object", properties: {}, required: [] };
}

let captured: SyncBody | null = null;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/api/v1/developer/sync") && typeof init?.body === "string") {
    captured = JSON.parse(init.body) as SyncBody;
    return new Response(JSON.stringify({ devAgentId: AGENT_ID }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;
await kit.sync();
globalThis.fetch = realFetch;
if (!captured) throw new Error("AgentKit produced no sync payload");
const body: SyncBody = captured;

const tools = body.tools.map((tool) => ({
  agent_id: AGENT_ID,
  name: tool.name,
  description: tool.description,
  inputSchema: normalize(tool.inputSchema),
  executionType: "webhook",
  webhookUrl: TOOLS_BASE_URL + "/keiki/tools/" + tool.name,
  ...(tool.policy ? { policy: tool.policy } : {}),
}));
const config = {
  agent_id: AGENT_ID,
  model: body.model,
  reasoning_effort: body.reasoning_effort,
  max_steps: body.max_steps,
  history_limit: body.history_limit,
  system_prompt: body.system_prompt,
  features: { ...body.features, groupChats: DEDICATED_LINE },
};

if (dryRun) {
  console.log(JSON.stringify({ config: { ...config, system_prompt: config.system_prompt.length + " chars" }, tools }, null, 2));
  process.exit(0);
}

async function call(method: string, path: string, payload?: unknown) {
  const res = await fetch(KEIKI + path, { method, headers, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await res.text();
  if (!res.ok) throw new Error(method + " " + path + " " + res.status + " " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

await call("PATCH", "/config", config);
console.log("config synced: model, prompt (" + config.system_prompt.length + " chars), features");

const existing = ((await call("GET", "/tools?agent_id=" + AGENT_ID))?.tools ?? []) as { id: string; name: string }[];
for (const tool of tools) {
  const match = existing.find((t) => t.name === tool.name);
  if (match) await call("PATCH", "/tools/" + match.id, tool);
  else await call("POST", "/tools", tool);
  console.log((match ? "updated " : "created ") + tool.name);
}
