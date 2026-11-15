import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  tap: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
  hopIn: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 6 },
  join: { kind: "fixed window", rate: 30, period: HOUR },
  createGroup: { kind: "fixed window", rate: 10, period: HOUR },
});
