import type { Crons } from "convex/server";
import { internal } from "../_generated/api";

export function registerPlanCrons(crons: Crons): void {
  crons.cron("daily drop", "0 23 * * *", internal.plans.drop.dailyDrop, {});
  crons.cron("weekend drop", "0 17 * * 4", internal.plans.drop.weekendDrop, {});
}
