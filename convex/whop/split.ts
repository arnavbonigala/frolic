export type Split = { appliedCents: number; shares: number[] };

export function splitCost(perPersonCents: number, people: number, fundCents: number, minChargeCents: number): Split {
  if (people <= 0 || perPersonCents <= 0) return { appliedCents: 0, shares: [] };
  const total = perPersonCents * people;
  let appliedCents = Math.max(0, Math.min(fundCents, total));
  if (appliedCents < total && total - appliedCents < people * minChargeCents) {
    appliedCents = total >= people * minChargeCents ? total - people * minChargeCents : 0;
  }
  const due = total - appliedCents;
  const base = Math.floor(due / people);
  const extra = due - base * people;
  const shares = Array.from({ length: people }, (_, i) => {
    const s = base + (i < extra ? 1 : 0);
    return s > 0 && s < minChargeCents ? minChargeCents : s;
  });
  return { appliedCents, shares };
}

export type ShareStatus =
  | "due"
  | "pending"
  | "held"
  | "releasing"
  | "released"
  | "paid"
  | "refunding"
  | "refunded"
  | "forfeited"
  | "failed"
  | "waived"
  | "needsAttention";

export type WhopSignal = "authorized" | "succeeded" | "failed" | "canceled" | "refunded" | "disputed" | "pending";

export function signalFrom(status?: string, substatus?: string): WhopSignal {
  switch (substatus) {
    case "requires_capture":
      return "authorized";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "blocked":
    case "price_too_low":
    case "uncollectible":
      return "failed";
    case "canceled":
      return "canceled";
    case "refunded":
    case "auto_refunded":
    case "partially_refunded":
      return "refunded";
  }
  if (substatus?.startsWith("dispute") || substatus?.startsWith("resolution")) return "disputed";
  if (status === "authorized") return "authorized";
  if (status === "paid") return "succeeded";
  if (status === "void") return "canceled";
  return "pending";
}

export function nextStatus(kind: "deposit" | "chipIn", from: ShareStatus, signal: WhopSignal): ShareStatus | null {
  if (signal === "pending") return null;
  if (signal === "disputed") return ["paid", "forfeited", "refunded"].includes(from) ? "needsAttention" : null;
  if (kind === "deposit") {
    if (signal === "authorized") return from === "pending" ? "held" : null;
    if (signal === "succeeded") return from === "held" || from === "pending" ? "forfeited" : null;
    if (signal === "canceled") return ["pending", "held", "releasing"].includes(from) ? "released" : null;
    if (signal === "failed") return from === "pending" ? "failed" : null;
    if (signal === "refunded") return ["forfeited", "refunding", "releasing", "held"].includes(from) ? "refunded" : null;
    return null;
  }
  if (signal === "authorized") return null;
  if (signal === "succeeded") return from === "pending" ? "paid" : null;
  if (signal === "failed") return from === "pending" ? "failed" : null;
  if (signal === "canceled") return from === "pending" ? "failed" : null;
  if (signal === "refunded") return ["paid", "refunding"].includes(from) ? "refunded" : null;
  return null;
}

export const ACTIVE: ShareStatus[] = ["pending", "held", "releasing", "refunding"];
