import type { ApiFromModules } from "convex/server";
import { internal } from "../_generated/api";
import type * as checkins from "../checkins";
import type * as etas from "../etas";
import type * as memoryEvents from "../memory/events";
import type * as snaps from "../snaps";
import type * as taps from "../taps";
import type * as users from "../users";
import type * as whopLinks from "../whop/links";

type AgentApi = ApiFromModules<{
  checkins: typeof checkins;
  etas: typeof etas;
  "memory/events": typeof memoryEvents;
  snaps: typeof snaps;
  taps: typeof taps;
  users: typeof users;
  "whop/links": typeof whopLinks;
}>;

export const tapAs: AgentApi["taps"]["tapAs"] = internal.taps.tapAs;

export const createUserAs: AgentApi["users"]["createAs"] = internal.users.createAs;

export const joinAs: AgentApi["users"]["joinAs"] = internal.users.joinAs;

export const checkInAs: AgentApi["checkins"]["checkInAs"] = internal.checkins.checkInAs;

export const setEtaAs: AgentApi["etas"]["setEtaAs"] = internal.etas.setEtaAs;

export const addSnapAs: AgentApi["snaps"]["addSnapAs"] = internal.snaps.addSnapAs;

export const checkoutLink: AgentApi["whop"]["links"]["checkoutLink"] = internal.whop.links.checkoutLink;

export const recordMemoryEvent: AgentApi["memory"]["events"]["recordEvent"] = internal.memory.events.recordEvent;
