import type { TriageUsage } from "./types";

/**
 * Micro-USD cost from measured token usage and env-configured prices
 * (USD per million tokens — USD/MTok × tokens = micro-USD). Null when
 * prices or usage are unavailable; never estimated.
 */
export function computeCostMicros(usage: TriageUsage | null): number | null {
  if (!usage) return null;
  const priceIn = Number(process.env.KIMI_PRICE_IN_USD_PER_MTOK);
  const priceOut = Number(process.env.KIMI_PRICE_OUT_USD_PER_MTOK);
  if (!Number.isFinite(priceIn) || !Number.isFinite(priceOut)) return null;
  const priceCached = Number(process.env.KIMI_PRICE_CACHED_IN_USD_PER_MTOK);
  const cachedRate = Number.isFinite(priceCached) ? priceCached : priceIn;
  const freshInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return Math.round(
    freshInput * priceIn + usage.cachedInputTokens * cachedRate + usage.outputTokens * priceOut,
  );
}
