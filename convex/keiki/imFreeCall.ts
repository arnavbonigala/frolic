import type { ApiFromModules } from "convex/server";
import { internal } from "../_generated/api";
import type * as frolics from "../frolics";

type FrolicsApi = ApiFromModules<{ frolics: typeof frolics }>;

export const imFreeAs: FrolicsApi["frolics"]["imFreeAs"] = internal.frolics.imFreeAs;
