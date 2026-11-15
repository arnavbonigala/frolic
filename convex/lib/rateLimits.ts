import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const DAILY_RESET_AT = Date.UTC(2026, 0, 1, 12, 0, 0);

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  tap: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
  hopIn: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
  join: { kind: "fixed window", rate: 30, period: HOUR },
  createGroup: { kind: "fixed window", rate: 10, period: HOUR },
  imFree: { kind: "fixed window", rate: 3, period: DAY, start: DAILY_RESET_AT },
  aiGroup: { kind: "fixed window", rate: 20, period: HOUR },
  aiGlobal: { kind: "token bucket", rate: 200, period: HOUR, capacity: 40 },
});
