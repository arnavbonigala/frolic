export type Filter =
  | { field: string; operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "arrayContains"; value: string | number | boolean }
  | { operator: "and" | "or"; operands: Filter[] };

export type SearchResult = {
  id: string;
  memory?: string;
  chunk?: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
  isLatest?: boolean;
  included?: { related?: { parents?: { id: string; memory?: string }[]; children?: { id: string; memory?: string }[]; siblings?: { id: string; memory?: string }[] } };
};

export type Profile = {
  static: { id: string; memory: string }[];
  dynamic: { id: string; memory: string }[];
  buckets: Record<string, { id: string; memory: string }[]>;
};

export type AddInput = {
  content: string;
  id: string;
  metadata?: Record<string, string | number | boolean | string[]>;
  date?: string;
};

export type SearchInput = {
  query: string;
  searchMode?: "memories" | "chunks" | "hybrid";
  limit?: number;
  threshold?: number;
  filter?: Filter;
  includeRelated?: boolean;
};

export type MemoryClient = {
  add(namespace: string, input: AddInput): Promise<{ id: string; status: string }>;
  search(namespace: string, input: SearchInput): Promise<SearchResult[]>;
  profile(namespace: string): Promise<Profile>;
  setBuckets(namespace: string, buckets: Record<string, string>): Promise<void>;
  setContext(namespace: string, supportingContext: string): Promise<void>;
  deleteNamespace(namespace: string): Promise<{ deletedDocumentsCount: number }>;
};

export class SupermemoryError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

const BASE = "https://api.supermemory.ai";

export function createClient(apiKey: string, fetchImpl: typeof fetch = fetch, inlineRetries = 2, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): MemoryClient {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let last: SupermemoryError | undefined;
    for (let attempt = 0; attempt <= inlineRetries; attempt++) {
      if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
      let res: Response;
      try {
        res = await fetchImpl(BASE + path, {
          method,
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        last = new SupermemoryError(0, "network: " + (e as Error).message);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      const text = await res.text().catch(() => "");
      last = new SupermemoryError(res.status, "supermemory " + res.status + " " + path + " " + text.slice(0, 200));
      if (!last.retryable) throw last;
    }
    throw last!;
  }

  return {
    add: (ns, input) =>
      call("POST", "/ns/" + ns + "/document", { ...input, dreaming: "instant" }),
    search: async (ns, input) => {
      const { includeRelated, ...rest } = input;
      const res = await call<{ results: SearchResult[] }>("POST", "/ns/" + ns + "/search", {
        searchMode: "memories",
        threshold: 0.3,
        ...rest,
        ...(includeRelated ? { include: { related: true } } : {}),
      });
      return res.results;
    },
    profile: async (ns) => (await call<{ profile: Profile }>("POST", "/ns/" + ns + "/profile", {})).profile,
    setBuckets: async (ns, buckets) => {
      await call("PUT", "/ns/" + ns + "/profile/buckets", { buckets });
    },
    setContext: async (ns, supportingContext) => {
      await call("PATCH", "/ns/" + ns, { supportingContext });
    },
    deleteNamespace: (ns) => call("DELETE", "/ns/" + ns),
  };
}
