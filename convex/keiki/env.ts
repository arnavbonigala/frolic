type Env = Record<string, string | undefined>;

export function keikiEnv() {
  const env: Env = (globalThis as { process?: { env: Env } }).process?.env ?? {};
  return {
    apiKey: env.KEIKI_API_KEY,
    signingSecret: env.KEIKI_TOOL_SIGNING_SECRET,
    agentId: env.KEIKI_AGENT_ID,
  };
}
