# convex/ai

One OpenAI client for the backend. Every call is a Responses API request with a strict JSON schema, a 6 second timeout, and a `null` return on any failure, so callers always have a template or scorer path to fall back to.

`OPENAI_API_KEY` is read from the environment at call time. Without it every function returns `null` before any request is made.

## `openai.ts`

```ts
const OPENAI_MODEL = "gpt-5.6-luna";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 6000;

function hasOpenAI(): boolean;

async function callStructured<T>(input: {
  schemaName: string;
  schema: JsonSchema;
  system: string;
  user: string;
  timeoutMs?: number;
  fetcher?: Fetcher;
}): Promise<T | null>;
```

`callStructured` POSTs `{ model, input: [system, user], text: { format: { type: "json_schema", name, schema, strict: true } } }`, reads the first `output_text` part, and returns the parsed JSON. Missing key, http error, timeout, a refusal, and output that is not JSON all return `null`. `fetcher` defaults to `fetch` and exists so tests never touch the network.

Also exported: `structuredBody`, `extractOutputText`, and the `Fetcher` and `JsonSchema` types.

## `pick.ts`

```ts
type PickCandidate = { slug: string; name: string; tags: string[]; costLabel: string; indoor: boolean; why: string };
type PickContext = { topTags: string[]; memory: string | null; weather: string | null };

async function pickPlace(input: {
  candidates: PickCandidate[];
  context: PickContext;
  fetcher?: Fetcher;
}): Promise<{ slug: string; why: string } | null>;
```

The slug field is a JSON schema `enum` of the candidate slugs, so the model can only answer with an id it was given. A slug outside the list, a `why` over 140 characters, or a `why` that breaks the copy rules returns `null`. No candidates means no request. `pickSchema` and `pickPrompt` are exported for tests.

Feed the result into `generatePlan(input, { preferredSlug, preferredWhy })` from `../plans/engine` and keep `fallbackPlan` as the fallback.

## `copy.ts`

```ts
type CopyInput =
  | { kind: "tasteHeadline"; tags: string[]; vibe: string[]; budget: string[] }
  | { kind: "why"; placeName: string; topTags: string[]; memory: string | null; weather: string | null; rainSwap: boolean }
  | { kind: "gardenCaption"; placeName: string; date: string; people: number; memory: string | null };

type CopyOutput =
  | { kind: "tasteHeadline"; headline: string; why: string }
  | { kind: "why"; text: string }
  | { kind: "gardenCaption"; text: string };

const COPY_MAX = { headline: 32, tasteWhy: 90, why: 120, caption: 80 };

async function writeCopy(input: CopyInput, fetcher?: Fetcher): Promise<CopyOutput | null>;
function templateCopy(input: CopyInput): CopyOutput;
```

`writeCopy` validates every field against the copy rules and the per kind limit, and returns `null` when the model misses. `templateCopy` is the always valid fallback and is deterministic: crew names come from a tag to name map, not from the raw tag list.

The Supermemory lane calls `writeCopy({ kind: "tasteHeadline", tags, vibe, budget })` for the taste headline. The names above are stable.

## Tests

`npm test`. The suite mocks `fetcher`, so it never calls OpenAI and never needs a key beyond a placeholder.
