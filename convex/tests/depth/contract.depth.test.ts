/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";

type Registered = {
  name: string;
  path: string;
  kind: "query" | "mutation" | "action" | "other";
  public: boolean;
  args: string;
  returns: string | null;
};

async function registry(): Promise<Registered[]> {
  const mods = import.meta.glob("../../**/*.ts") as Record<string, () => Promise<Record<string, unknown>>>;
  const found: Registered[] = [];
  for (const [path, load] of Object.entries(mods)) {
    if (path.includes("_generated") || path.includes("convex.config") || path.includes("/tests/") || path.endsWith(".test.ts")) continue;
    const mod = await load();
    for (const [name, value] of Object.entries(mod)) {
      const fn = value as {
        exportArgs?: () => string;
        exportReturns?: () => string;
        isQuery?: boolean;
        isMutation?: boolean;
        isAction?: boolean;
        isPublic?: boolean;
      };
      if (typeof fn?.exportArgs !== "function") continue;
      found.push({
        name,
        path: path.replace("../../", "").replace(".ts", ""),
        kind: fn.isQuery ? "query" : fn.isMutation ? "mutation" : fn.isAction ? "action" : "other",
        public: fn.isPublic === true,
        args: fn.exportArgs(),
        returns: typeof fn.exportReturns === "function" ? fn.exportReturns() : null,
      });
    }
  }
  return found;
}

const testSources = Object.entries(
  import.meta.glob("../**/*.test.ts", { query: "?raw", eager: true, import: "default" }) as Record<string, string>,
);

const referenced = (fn: Registered): boolean => {
  const accessor = fn.public ? "api" : "internal";
  const dotted = `${accessor}.${fn.path.replace(/^convex\//, "").split("/").join(".")}.${fn.name}`;
  return testSources.some(([, text]) => text.includes(dotted));
};

describe("convex function contract", () => {
  test("every registered function declares an object argument validator", async () => {
    const functions = await registry();
    expect(functions.length).toBeGreaterThan(40);
    const bad = functions.filter((fn) => {
      const parsed = JSON.parse(fn.args) as { type?: string };
      return parsed.type !== "object";
    });
    expect(bad.map((fn) => `${fn.path}:${fn.name}`)).toEqual([]);
  });

  test("every registered function is exercised by a test", async () => {
    const functions = await registry();
    const untested = functions.filter((fn) => !referenced(fn));
    expect(untested.map((fn) => `${fn.public ? "api" : "internal"}.${fn.path.replace(/^convex\//, "").replace(/\//g, ".")}.${fn.name}`)).toEqual([]);
  });

  test("every public function is query or mutation free of untyped arguments", async () => {
    const functions = await registry();
    const loose = functions.filter((fn) => fn.public && JSON.parse(fn.args).value && Object.values(JSON.parse(fn.args).value as Record<string, { fieldType?: { type?: string } }>).some((field) => field.fieldType?.type === "any"));
    expect(loose.map((fn) => `${fn.path}:${fn.name}`)).toEqual([]);
  });
});
