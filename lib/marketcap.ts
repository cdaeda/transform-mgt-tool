// The workbook's market cap formula ($M), so the planner matches the sheet exactly:
// cash x 100 (capped at portfolio + analysts, and 0 if those are negative) + BM portfolio + analyst ratings.
export const BM_VALUE = { core: 100, growth: 500, explore: 1000 } as const;
export const ANALYST_VALUE = [2500, 1000, 10, -1000, -2500] as const; // Outperform, Buy, Hold, Sell, Crash
export const ANALYST_NAMES = ["Outperform", "Buy", "Hold", "Sell", "Crash"] as const;

export type Levers = { core: number; growth: number; explore: number; analysts: number[]; cash: number /* $ */ };

export function marketCap(l: Levers) {
  const portfolio = BM_VALUE.core * l.core + BM_VALUE.growth * l.growth + BM_VALUE.explore * l.explore;
  const analysts = ANALYST_VALUE.reduce((s, v, i) => s + v * (l.analysts[i] ?? 0), 0);
  const base = portfolio + analysts;
  const cashRaw = (l.cash * 100) / 1e6;
  const cashTerm = base < 0 ? 0 : Math.min(cashRaw, base);
  return { portfolio, analysts, cashTerm, cashCapped: cashRaw > cashTerm, total: cashTerm + portfolio + analysts };
}

// Smallest extra Explore BMs (with today's other levers) that reach the target, cash topped up to the cap.
export function exploreNeeded(l: Levers, targetM = 50_000) {
  const half = targetM / 2;
  const other = marketCap({ ...l, explore: 0, cash: 0 });
  return Math.max(0, Math.ceil((half - other.portfolio - other.analysts) / BM_VALUE.explore));
}
