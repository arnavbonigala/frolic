import { httpRouter } from "convex/server";
import { registerWebRoutes } from "./web/routes";
import { registerWhopRoutes } from "./whop/routes";
import { registerKeikiRoutes } from "./keiki/routes";

const http = httpRouter();
registerWebRoutes(http);
registerWhopRoutes(http);
registerKeikiRoutes(http);
export default http;
