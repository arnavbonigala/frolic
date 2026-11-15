import { httpRouter } from "convex/server";
import { registerWebRoutes } from "./web/routes";
import { registerWhopRoutes } from "./whop/routes";
import { registerKeikiRoutes } from "./keiki/routes";
import { registerE2eRoutes } from "./e2e/routes";

const http = httpRouter();
registerWebRoutes(http);
registerWhopRoutes(http);
registerKeikiRoutes(http);
registerE2eRoutes(http);
export default http;
