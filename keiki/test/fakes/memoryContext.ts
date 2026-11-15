import { v } from "convex/values";
import { internalQuery } from "../../../convex/_generated/server";

export const forUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async () => ({ summary: "Hates hikes. Free after 6 on weekdays." }),
});
