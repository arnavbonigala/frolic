declare const process: { env: Record<string, string | undefined> };

export function holdCents(): number {
  const raw = Number(process.env.FROLIC_HOLD_CENTS ?? 300);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 300;
}
