import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { registerPlanCrons } from "./plans/crons";

const crons = cronJobs();
registerPlanCrons(crons);
crons.cron("memory close day", "15 8 * * *", internal.daily.closeMemoryDay, {});
crons.cron("garden nudge", "0 * * * *", internal.garden.nudgeCrews, {});
crons.cron("daily pick", "5 * * * *", internal.dailyPick.ensureCrews, {});
export default crons;
