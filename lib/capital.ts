// Projection for the $50B-by-goal-year plan: today's market-cap levers, plus every capital strategy that
// has landed by each year (scaled by its dial), through the workbook's market-cap formula.
// ponytail: "if nothing else changes" - no organic growth, no decay; good enough to compare plans.
import { marketCap, type Levers } from "./marketcap.ts";

export type Effect = { cash_m: number; core: number; growth: number; explore: number; analysts: number[]; shares_m: number; interest_m: number };
export type Strat = { id: number; name: string; status: string; year: number | null; scale: number; effect: Effect | null };
export type Today = Levers & { shares: number; year: number };

export const ZERO: Effect = { cash_m: 0, core: 0, growth: 0, explore: 0, analysts: [0, 0, 0, 0, 0], shares_m: 0, interest_m: 0 };

// Straight line from today's market cap to the goal ($M) at the goal year.
export function requiredPath(nowM: number, fromYear: number, goalYear: number, goalM = 50_000) {
  const span = Math.max(1, goalYear - fromYear);
  return Array.from({ length: goalYear - fromYear + 1 }, (_, k) => ({ year: fromYear + k, cap: nowM + ((goalM - nowM) * k) / span }));
}

export function project(today: Today, strats: Strat[], goalYear: number, include = (s: Strat) => s.status === "locked") {
  const live = strats.filter((s) => s.effect && include(s));
  return Array.from({ length: goalYear - today.year + 1 }, (_, k) => {
    const year = today.year + k;
    const e = live.filter((s) => (s.year ?? today.year) <= year).reduce<Effect>((acc, s) => {
      const f = s.effect!, x = s.scale ?? 1;
      return {
        cash_m: acc.cash_m + f.cash_m * x, core: acc.core + f.core * x, growth: acc.growth + f.growth * x, explore: acc.explore + f.explore * x,
        analysts: acc.analysts.map((a, i) => a + (f.analysts?.[i] ?? 0) * x), shares_m: acc.shares_m + f.shares_m * x, interest_m: acc.interest_m + f.interest_m * x,
      };
    }, ZERO);
    const levers: Levers = {
      core: Math.max(0, today.core + Math.round(e.core)), growth: Math.max(0, today.growth + Math.round(e.growth)), explore: Math.max(0, today.explore + Math.round(e.explore)),
      analysts: today.analysts.map((a, i) => Math.max(0, a + Math.round(e.analysts[i]))), cash: Math.max(0, today.cash + e.cash_m * 1e6),
    };
    const mc = marketCap(levers);
    const shares = Math.max(1, today.shares + e.shares_m * 1e6);
    return { year, ...mc, price: (mc.total * 1e6) / shares, shares, interest_m: e.interest_m, levers };
  });
}
