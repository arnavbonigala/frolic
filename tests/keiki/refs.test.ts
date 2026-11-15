/// <reference types="vite/client" />
import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { imFreeAs } from "../../convex/keiki/imFreeCall";
import * as agentRefs from "../../convex/keiki/refs";

const modules = import.meta.glob("../../convex/**/*.ts");
const sources = import.meta.glob("../../convex/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

type RegisteredFunction = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isInternal?: boolean;
  isPublic?: boolean;
  exportArgs?: () => string;
  exportReturns?: () => string;
};

const refs: Record<string, FunctionReference<"mutation", "internal", any, any>> = { ...agentRefs, imFreeAs };

function kindOf(fn: RegisteredFunction): string {
  if (fn.isMutation) return "mutation";
  if (fn.isQuery) return "query";
  if (fn.isAction) return "action";
  return "none";
}

describe("every reference the keiki agent layer holds", () => {
  for (const [exportName, reference] of Object.entries(refs)) {
    it(`${exportName} resolves to an internal mutation that exports the path it names`, async () => {
      const name = getFunctionName(reference);
      const parts = name.split(":");
      expect(parts, name).toHaveLength(2);
      const [modulePath, functionName] = parts;
      const load = modules[`../../convex/${modulePath}.ts`];
      expect(typeof load, `convex/${modulePath}.ts is not a module the backend has`).toBe("function");
      const module = (await load!()) as Record<string, unknown>;
      const target = module[functionName];
      expect(typeof target, `convex/${modulePath}.ts exports no ${functionName}`).toBe("function");
      const fn = target as RegisteredFunction;
      expect(kindOf(fn), `${name} declares mutation but is a ${kindOf(fn)}`).toBe("mutation");
      expect(fn.isInternal, `${name} declares internal but is public`).toBe(true);
      expect(typeof fn.exportArgs, `${name} has no argument validator`).toBe("function");
      expect(typeof fn.exportReturns, `${name} has no return validator`).toBe("function");
    });
  }

  it("are built from the generated internal object, never from a hand-typed string", () => {
    const handTyped = Object.entries(sources)
      .filter(([path]) => !path.includes("/_generated/"))
      .filter(([, text]) => /\bmakeFunctionReference\s*[(<]/.test(text))
      .map(([path]) => path);
    expect(handTyped).toEqual([]);
  });

  it("names every write tool the agent layer promises", () => {
    expect(Object.keys(refs).sort()).toEqual([
      "addSnapAs",
      "checkInAs",
      "checkoutLink",
      "createUserAs",
      "imFreeAs",
      "joinAs",
      "recordMemoryEvent",
      "setEtaAs",
      "tapAs",
    ]);
  });
});
