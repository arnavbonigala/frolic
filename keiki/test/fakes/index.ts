const real = import.meta.glob("../../../convex/**/*.ts");

const fakes: Record<string, () => Promise<unknown>> = {
  "../../../convex/whop/links.ts": () => import("./whopDeposits"),
  "../../../convex/memory/context.ts": () => import("./memoryContext"),
};

export const modules: Record<string, () => Promise<unknown>> = { ...fakes, ...real };
