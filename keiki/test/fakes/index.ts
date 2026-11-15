const real = import.meta.glob("../../../convex/**/*.ts");

const fakes: Record<string, () => Promise<unknown>> = {
  "../../../convex/taps.ts": () => import("./taps"),
  "../../../convex/users.ts": () => import("./users"),
  "../../../convex/checkins.ts": () => import("./checkins"),
  "../../../convex/etas.ts": () => import("./etas"),
  "../../../convex/snaps.ts": () => import("./snaps"),
  "../../../convex/whop/deposits.ts": () => import("./whopDeposits"),
  "../../../convex/memory/events.ts": () => import("./memoryEvents"),
  "../../../convex/memory/context.ts": () => import("./memoryContext"),
};

export const modules: Record<string, () => Promise<unknown>> = { ...fakes, ...real };
