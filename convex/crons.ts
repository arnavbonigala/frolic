import { cronJobs } from "convex/server";
import { registerPlanCrons } from "./plans/crons";

const crons = cronJobs();
registerPlanCrons(crons);
export default crons;
