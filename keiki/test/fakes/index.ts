const real = import.meta.glob("../../../convex/**/*.ts");

export function modulesWith(fakes: Record<string, () => Promise<unknown>>): Record<string, () => Promise<unknown>> {
  return { ...real, ...fakes };
}

export const modules: Record<string, () => Promise<unknown>> = modulesWith({});

export const frolicsWithImFree = modulesWith({
  "../../../convex/frolics.ts": () => import("./frolicsWithImFree"),
});

export const frolicsRefusingImFree = modulesWith({
  "../../../convex/frolics.ts": () => import("./frolicsRefusingImFree"),
});
