import type { Filter } from "./client";

export type FakeDoc = { id: string; content: string; metadata: Record<string, unknown>; date?: string };

export function createFake() {
  const docs = new Map<string, Map<string, FakeDoc>>();
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const mode = { fail: null as null | number };

  const matches = (d: FakeDoc, f?: Filter): boolean => {
    if (!f) return true;
    if ("operands" in f) return f.operator === "and" ? f.operands.every((o) => matches(d, o)) : f.operands.some((o) => matches(d, o));
    return f.operator === "eq" ? d.metadata[f.field] === f.value : true;
  };

  const handler = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, path: u.pathname, body });
    if (mode.fail) return new Response("fail", { status: mode.fail });
    const m = u.pathname.match(/^\/ns\/([^/]+)(\/.*)?$/)!;
    const ns = m[1];
    const rest = m[2] ?? "";
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (method === "POST" && rest === "/document" && body!.id === "frolic_init") return json({ id: "frolic_init", status: "queued" });
    if (method === "POST" && rest === "/document") {
      const store = docs.get(ns) ?? new Map<string, FakeDoc>();
      docs.set(ns, store);
      store.set(body!.id as string, { id: body!.id as string, content: body!.content as string, metadata: (body!.metadata as Record<string, unknown>) ?? {}, date: body!.date as string | undefined });
      return json({ id: body!.id, status: "queued" });
    }
    if (method === "POST" && rest === "/search") {
      const results = [...(docs.get(ns)?.values() ?? [])]
        .filter((d) => matches(d, body!.filter as Filter | undefined))
        .map((d) => ({ id: "mem_" + d.id, memory: d.content, metadata: d.metadata }));
      return json({ results });
    }
    if (method === "POST" && rest === "/profile") return json({ profile: { static: [], dynamic: [], buckets: {} } });
    if (method === "DELETE" && rest === "") {
      const n = docs.get(ns)?.size;
      if (n === undefined) return new Response("nf", { status: 404 });
      docs.delete(ns);
      return json({ status: "deleted", deletedDocumentsCount: n });
    }
    return json({});
  };

  return { handler, docs, calls, mode, texts: (ns: string) => [...(docs.get(ns)?.values() ?? [])].map((d) => d.content) };
}
