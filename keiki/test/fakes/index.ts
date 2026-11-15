const real = import.meta.glob("../../../convex/**/*.ts");

export const modules: Record<string, () => Promise<unknown>> = real;
