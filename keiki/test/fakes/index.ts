const real = import.meta.glob("../../../convex/**/*.ts");

const fakes: Record<string, () => Promise<unknown>> = {
  "../../../convex/whop/links.ts": () => import("./whopDeposits"),
};

export const modules: Record<string, () => Promise<unknown>> = { ...fakes, ...real };
