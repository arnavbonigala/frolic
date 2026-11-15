import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";

type TimeWindow = { start: number; end: number };

export const tapAs = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    frolicId: Id<"frolics">;
    kind: "down" | "notToday";
    onlyIf?: Id<"users">[];
    window?: TimeWindow;
    source: "imessage";
  },
  null
>("taps:tapAs");

export const createUserAs = makeFunctionReference<
  "mutation",
  { name: string; phone: string },
  Id<"users">
>("users:createAs");

export const joinAs = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; inviteCode: string; via: "imessage" },
  unknown
>("users:joinAs");

export const checkInAs = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; frolicId: Id<"frolics">; method: "imessage" },
  null
>("checkins:checkInAs");

export const setEtaAs = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; frolicId: Id<"frolics">; minutes: number; onTheWay: boolean },
  null
>("etas:setEtaAs");

export const addSnapAs = makeFunctionReference<
  "mutation",
  { userId: Id<"users">; frolicId: Id<"frolics">; storageId: Id<"_storage">; takenAt: number },
  null
>("snaps:addSnapAs");

export const checkoutLinkFor = makeFunctionReference<
  "action",
  { userId: Id<"users">; frolicId: Id<"frolics"> },
  { url: string; amountCents: number } | null
>("whop/deposits:checkoutLinkFor");

export const recordMemoryEvent = makeFunctionReference<
  "mutation",
  {
    eventKey: string;
    kind: "limit";
    groupId: Id<"groups">;
    userId: Id<"users">;
    payload: { text: string };
  },
  unknown
>("memory/events:recordEvent");

export const memoryContextForUser = makeFunctionReference<
  "query",
  { userId: Id<"users"> },
  { summary: string } | null
>("memory/context:forUser");
