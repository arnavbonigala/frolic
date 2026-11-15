declare const process: { env: Record<string, string | undefined> };

export function whopConfig() {
  return {
    baseUrl: process.env.WHOP_API_BASE ?? "https://sandbox-api.whop.com/api/v1",
    apiKey: process.env.WHOP_SANDBOX_API_KEY ?? "",
    accountId: process.env.WHOP_ACCOUNT_ID ?? "",
    webhookSecret: process.env.WHOP_WEBHOOK_SECRET ?? "",
    holdProductId: process.env.WHOP_HOLD_PRODUCT_ID ?? "",
    plansProductId: process.env.WHOP_PLANS_PRODUCT_ID ?? "",
    siteUrl: process.env.FROLIC_SITE_URL ?? process.env.CONVEX_SITE_URL ?? "",
  };
}
export const policy = {
  holdCents: Number(process.env.FROLIC_HOLD_CENTS ?? 300),
  minChargeCents: 100,
  bailWindowMs: 60 * 60 * 1000,
  confirmWindowMs: 10 * 60 * 1000,
  noShowGraceMs: 45 * 60 * 1000,
  reconcileMs: 2 * 60 * 1000,
  stuckPendingMs: 30 * 60 * 1000,
  maxRefundTries: 3,
  maxReconcileErrors: 15,
  anonymousCredits: true,
};
