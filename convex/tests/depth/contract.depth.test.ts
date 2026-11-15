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
        path: path.replace("../../", ""),
        kind: fn.isQuery ? "query" : fn.isMutation ? "mutation" : fn.isAction ? "action" : "other",
        public: fn.isPublic === true,
        args: fn.exportArgs(),
        returns: typeof fn.exportReturns === "function" ? fn.exportReturns() : null,
      });
    }
  }
  return found;
}

function withoutSkips(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf("test.skip(", index);
    if (start === -1) {
      out += source.slice(index);
      break;
    }
    out += source.slice(index, start);
    let depth = 0;
    let cursor = start + "test.skip(".length - 1;
    for (; cursor < source.length; cursor++) {
      if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
  return out;
}

const testSources = Object.entries(
  import.meta.glob(["../**/*.test.ts", "../../**/*.test.ts", "../../../../tests/**/*.test.ts"], {
    query: "?raw",
    eager: true,
    import: "default",
  }) as Record<string, string>,
);

const liveSources = testSources.filter(([path]) => !path.includes("/depth/"));

const dotted = (fn: Registered) =>
  `${fn.public ? "api" : "internal"}.${fn.path.replace(/^convex\//, "").replace(/\.ts$/, "").split("/").join(".")}.${fn.name}`;

const calledBy = (fn: Registered, sources: [string, string][]) =>
  sources.filter(([, text]) => withoutSkips(text).includes(dotted(fn))).map(([path]) => path);

const declarations = new Map<string, number>();
const scanDeclarations = async () => {
  const sources = import.meta.glob("../../**/*.ts", { query: "?raw", eager: true, import: "default" }) as Record<string, string>;
  for (const [path, text] of Object.entries(sources)) {
    if (path.includes("_generated") || path.includes("convex.config") || path.includes("/tests/") || path.endsWith(".test.ts")) continue;
    const count = (text.match(/= (?:internal)?(?:Query|Mutation|Action)\(/gi) ?? []).length;
    if (count > 0) declarations.set(path.replace("../../", ""), count);
  }
};

describe("convex function contract", () => {
  test("every registered function declares an object argument validator", async () => {
    const functions = await registry();
    expect(functions.length).toBeGreaterThan(60);
    const bad = functions.filter((fn) => (JSON.parse(fn.args) as { type?: string }).type !== "object");
    expect(bad.map((fn) => `${fn.path}:${fn.name}`)).toEqual([]);
  });

  test("the registry sees every file that declares a function", async () => {
    await scanDeclarations();
    const functions = await registry();
    const registered = new Map<string, number>();
    for (const fn of functions) registered.set(fn.path, (registered.get(fn.path) ?? 0) + 1);
    const missing = [...declarations.entries()]
      .filter(([path, count]) => (registered.get(path) ?? 0) < count)
      .map(([path, count]) => `${path}: ${registered.get(path) ?? 0} registered of ${count} declared`);
    expect(missing).toEqual([]);
  });

  test("every registered function is called by a test outside its own file", async () => {
    const functions = await registry();
    const untested = functions.filter((fn) => calledBy(fn, testSources).length === 0);
    expect(untested.map(dotted)).toEqual([]);
    const onlySkipped = functions.filter((fn) => calledBy(fn, liveSources).length === 0);
    expect(onlySkipped.map(dotted)).toEqual([]);
  });

  test("no public function takes an untyped argument", async () => {
    const functions = await registry();
    const loose = functions.filter((fn) => {
      if (!fn.public) return false;
      const value = (JSON.parse(fn.args) as { value?: Record<string, { fieldType?: { type?: string } }> }).value;
      return Object.values(value ?? {}).some((field) => field.fieldType?.type === "any");
    });
    expect(loose.map(dotted)).toEqual([]);
  });
});
