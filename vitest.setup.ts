declare const process: { env: Record<string, string | undefined> };

if (process.env.SUPERMEMORY_LIVE !== "1") delete process.env.SUPERMEMORY_API_KEY;
