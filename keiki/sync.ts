import { AGENT_ID, TOOLS_BASE_URL, kit } from "./agent";

if (!process.env.KEIKI_API_KEY) throw new Error("KEIKI_API_KEY is not set");
if (!TOOLS_BASE_URL.startsWith("https://")) throw new Error("Set FROLIC_TOOLS_BASE_URL or SHARED_CONVEX_SITE_URL to the Convex site URL");

function normalize(schema: Record<string, unknown>) {
  if (schema.type === "object" && schema.properties) return { type: "object", properties: schema.properties, required: schema.required ?? [] };
  return { type: "object", properties: {}, required: [] };
}

const dryRun = process.argv.includes("--dry-run");
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.endsWith("/api/v1/developer/sync") || typeof init?.body !== "string") return realFetch(input, init);
  const body = JSON.parse(init.body);
  body.agent_id = AGENT_ID;
  body.tools = body.tools.map((tool: Record<string, unknown>) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: normalize(tool.inputSchema as Record<string, unknown>),
    executionType: "webhook",
    webhookUrl: TOOLS_BASE_URL + "/keiki/tools/" + tool.name,
    ...(tool.policy ? { policy: tool.policy } : {}),
  }));
  if (dryRun) {
    console.log(JSON.stringify({ ...body, system_prompt: body.system_prompt.length + " chars" }, null, 2));
    return new Response(JSON.stringify({ devAgentId: AGENT_ID }), { status: 200 });
  }
  return realFetch(input, { ...init, body: JSON.stringify(body) });
}) as typeof fetch;

await kit.sync();
globalThis.fetch = realFetch;

if (!dryRun) {
  const res = await fetch("https://onkeiki.com/api/v1/developer/config", {
    method: "PATCH",
    headers: { Authorization: "Bearer " + process.env.KEIKI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: AGENT_ID, features: { groupChats: true } }),
  });
  console.log("groupChats:", res.ok ? "on" : "failed " + res.status);
}
