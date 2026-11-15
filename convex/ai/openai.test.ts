import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  OPENAI_MODEL,
  OPENAI_URL,
  callStructured,
  extractOutputText,
  hasOpenAI,
  structuredBody,
  type Fetcher,
  type StructuredBody,
} from "./openai";

const KEY = "sk-test-key";

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

type Call = { url: string; init: RequestInit; body: StructuredBody };

const stub = (payload: unknown, status = 200) => {
  const calls: Call[] = [];
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) as StructuredBody });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  };
  return { fetcher, calls };
};

const envelope = (payload: unknown) => ({
  output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(payload), annotations: [] }] },
  ],
});

const schema = {
  type: "object" as const,
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false as const,
};

const call = (fetcher?: Fetcher, timeoutMs?: number) => ({
  schemaName: "probe",
  schema,
  system: "system text",
  user: "user text",
  fetcher,
  timeoutMs,
});

beforeEach(() => {
  env.OPENAI_API_KEY = KEY;
});

afterEach(() => {
  delete env.OPENAI_API_KEY;
});

describe("callStructured", () => {
  test("returns the parsed structured output", async () => {
    const { fetcher } = stub(envelope({ answer: "yes" }));
    expect(await callStructured<{ answer: string }>(call(fetcher))).toEqual({ answer: "yes" });
  });

  test("posts the current Responses structured output body", async () => {
    const { fetcher, calls } = stub(envelope({ answer: "yes" }));
    await callStructured(call(fetcher));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENAI_URL);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].body.model).toBe(OPENAI_MODEL);
    expect(calls[0].body.model).toBe("gpt-5.6-luna");
    expect(calls[0].body.input).toEqual([
      { role: "system", content: "system text" },
      { role: "user", content: "user text" },
    ]);
    expect(calls[0].body.text.format.type).toBe("json_schema");
    expect(calls[0].body.text.format.name).toBe("probe");
    expect(calls[0].body.text.format.strict).toBe(true);
    expect(calls[0].body.text.format.schema).toEqual(schema);
  });

  test("sends the key as a bearer token", async () => {
    const { fetcher, calls } = stub(envelope({ answer: "yes" }));
    await callStructured(call(fetcher));
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer " + KEY);
    expect(headers["content-type"]).toBe("application/json");
  });

  test("returns null on an http error", async () => {
    const { fetcher } = stub({ error: { message: "boom" } }, 500);
    expect(await callStructured(call(fetcher))).toBeNull();
  });

  test("returns null when the request times out", async () => {
    const hanging: Fetcher = () => new Promise<Response>(() => {});
    expect(await callStructured(call(hanging, 20))).toBeNull();
  });

  test("returns null without calling fetch when the key is missing", async () => {
    delete env.OPENAI_API_KEY;
    const { fetcher, calls } = stub(envelope({ answer: "yes" }));
    expect(await callStructured(call(fetcher))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("returns null when the output text is not JSON", async () => {
    const { fetcher } = stub({ output: [{ type: "message", content: [{ type: "output_text", text: "sure thing" }] }] });
    expect(await callStructured(call(fetcher))).toBeNull();
  });

  test("returns null when the response carries no output text", async () => {
    const { fetcher } = stub({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] });
    expect(await callStructured(call(fetcher))).toBeNull();
  });

  test("returns null when the connection fails", async () => {
    const failing: Fetcher = async () => {
      throw new Error("network down");
    };
    expect(await callStructured(call(failing))).toBeNull();
  });
});

describe("openai helpers", () => {
  test("hasOpenAI follows the key", () => {
    expect(hasOpenAI()).toBe(true);
    delete env.OPENAI_API_KEY;
    expect(hasOpenAI()).toBe(false);
    env.OPENAI_API_KEY = "   ";
    expect(hasOpenAI()).toBe(false);
  });

  test("the default timeout is 6 seconds", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(6000);
  });

  test("extractOutputText reads the convenience field", () => {
    expect(extractOutputText({ output_text: '{"a":1}' })).toBe('{"a":1}');
  });

  test("structuredBody defaults to the luna model", () => {
    expect(structuredBody({ schemaName: "x", schema, system: "s", user: "u" }).model).toBe("gpt-5.6-luna");
  });
});
