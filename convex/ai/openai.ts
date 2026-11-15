export const OPENAI_URL = "https://api.openai.com/v1/responses";
export const OPENAI_MODEL = "gpt-5.6-luna";
export const DEFAULT_TIMEOUT_MS = 6000;

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type StructuredBody = {
  model: string;
  input: { role: "system" | "user"; content: string }[];
  text: { format: { type: "json_schema"; name: string; strict: true; schema: JsonSchema } };
};

export type StructuredCall = {
  schemaName: string;
  schema: JsonSchema;
  system: string;
  user: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
};

type Env = Record<string, string | undefined>;

function runtimeEnv(): Env | undefined {
  return (globalThis as { process?: { env?: Env } }).process?.env;
}

function apiKey(): string | null {
  const key = runtimeEnv()?.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function hasOpenAI(): boolean {
  return apiKey() !== null;
}

export function structuredBody(call: Pick<StructuredCall, "schemaName" | "schema" | "system" | "user">): StructuredBody {
  return {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    text: { format: { type: "json_schema", name: call.schemaName, strict: true, schema: call.schema } },
  };
}

export function extractOutputText(payload: unknown): string | null {
  const body = payload as { output_text?: unknown; output?: unknown };
  if (typeof body?.output_text === "string" && body.output_text.trim().length > 0) return body.output_text;
  if (!Array.isArray(body?.output)) return null;
  const parts: string[] = [];
  for (const item of body.output as { content?: unknown }[]) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content as { type?: unknown; text?: unknown }[]) {
      if (part?.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  const text = parts.join("").trim();
  return text.length > 0 ? text : null;
}

export async function callStructured<T>(call: StructuredCall): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;
  const fetcher = call.fetcher ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, call.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([
      fetcher(OPENAI_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify(structuredBody(call)),
        signal: controller.signal,
      }),
      expired,
    ]);
    if (!res || !res.ok) return null;
    const text = extractOutputText(await res.json());
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
