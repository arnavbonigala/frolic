import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { registerPlanCrons } from "./plans/crons";

const crons = cronJobs();
registerPlanCrons(crons);
crons.interval("memory flush", { minutes: 1 }, internal.memory.ingest.flushDue, {});
crons.cron("memory close day", "15 8 * * *", internal.daily.closeMemoryDay, {});
export default crons;
