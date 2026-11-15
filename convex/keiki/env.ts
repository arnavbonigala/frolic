type Env = Record<string, string | undefined>;

function flag(value: string | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function keikiEnv() {
  const env: Env = (globalThis as { process?: { env: Env } }).process?.env ?? {};
  return {
    apiKey: env.KEIKI_API_KEY,
    signingSecret: env.KEIKI_TOOL_SIGNING_SECRET,
    agentId: env.KEIKI_AGENT_ID,
    imFree: env.KEIKI_IM_FREE === "1" || env.KEIKI_IM_FREE === "true",
    heroBaseUrl: env.FROLIC_HERO_BASE_URL?.replace(/\/$/, ""),
    dedicatedLine: flag(env.KEIKI_DEDICATED_LINE),
  };
}
