import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";

export type ImFreeResult = { error: string } | null;

export const imFreeAs = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; groupId: Id<"groups">; forMinutes: number },
  ImFreeResult
>("frolics:imFreeAs");
