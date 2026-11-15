import { describe, expect, test, vi } from "vitest";
import { createClient, SupermemoryError } from "./client";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("supermemory client", () => {
  test("add posts to the namespace with id and instant dreaming", async () => {
    const f = vi.fn().mockResolvedValue(ok({ id: "e1", status: "queued" }));
    const c = createClient("k", f as unknown as typeof fetch, 0, async () => {});
    await c.add("frolic_g_1", { content: "hi", id: "e1", metadata: { kind: "night" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.supermemory.ai/ns/frolic_g_1/document");
    expect(JSON.parse(init.body)).toMatchObject({ id: "e1", dreaming: "instant", content: "hi" });
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  test("retries 500 then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("no", { status: 503 })).mockResolvedValueOnce(ok({ id: "e", status: "queued" }));
    const c = createClient("k", f as unknown as typeof fetch, 2, async () => {});
    await c.add("n", { content: "x", id: "e" });
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("does not retry a 400", async () => {
    const f = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    const c = createClient("k", f as unknown as typeof fetch, 2, async () => {});
    await expect(c.add("n", { content: "x", id: "e" })).rejects.toBeInstanceOf(SupermemoryError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("search sends filter and include.related and returns results", async () => {
    const f = vi.fn().mockResolvedValue(ok({ results: [{ id: "m", memory: "x" }] }));
    const c = createClient("k", f as unknown as typeof fetch, 0, async () => {});
    const r = await c.search("n", { query: "q", filter: { field: "kind", operator: "eq", value: "night" }, includeRelated: true });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.filter).toEqual({ field: "kind", operator: "eq", value: "night" });
    expect(body.include).toEqual({ related: true });
    expect(body.searchMode).toBe("memories");
    expect(r[0].id).toBe("m");
  });

  test("deleteNamespace uses DELETE", async () => {
    const f = vi.fn().mockResolvedValue(ok({ status: "deleted", deletedDocumentsCount: 2 }));
    const c = createClient("k", f as unknown as typeof fetch, 0, async () => {});
    expect((await c.deleteNamespace("frolic_p_1")).deletedDocumentsCount).toBe(2);
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });
});
