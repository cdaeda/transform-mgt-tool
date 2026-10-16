// Multi-year what-if simulator (pure, no I/O): the workbook's own per-year figures are the baseline,
// and every knob is applied as a delta on top, so "no knobs" reproduces the workbook exactly.
// ponytail: deltas are taxed symmetrically (a loss earns a tax credit) and new debt is never repaid
// inside the horizon; model repayment / loss carry-forward if the facilitator's rules need it.
import type { Effect } from "./capital.ts";
import { ANALYST_NAMES, ANALYST_VALUE, BM_VALUE, marketCap } from "./marketcap.ts";

export const SEGS = ["core", "growth", "explore"] as const;
export type Seg = (typeof SEGS)[number];
const Y = 10;

// Workbook baseline, all dollars; per-year arrays are indexed by game year - 1.
export type Base = {
  now: number;
  segRev: number[][]; // [core, growth, explore][year]
  segCost: number[][];
  costBase: number[];
  interest: number[];
  net: number[];
  cash: number[];
  units: number[][]; // active BMs [core, growth, explore][year]
  analysts: number[][]; // [Outperform, Buy, Hold, Sell, Crash][year]
  shares: number;
  debt: number;
};

export type SimCard = { label: string; type: Seg; startYear: number; revenue: number[]; cost: number[]; capex: number };
export type Knobs = {
  toYear: number;
  growth: Record<Seg, number>; // %/yr volume growth of the BMs we already have (revenue and their costs)
  costInflation: number; // %/yr on the cost base
  newBMs: Record<Seg, number[]>; // BMs added per year
  profile: Record<Seg, { revenue: number; cost: number; capex: number }>; // $M per new BM: per year, and once
  analystMoves: number[][]; // [year][5] change in ratings held
  borrow: number[]; // $M drawn per year
  rate: number; // % interest on new borrowing
  equity: number[]; // $M of new shares sold per year
  issuePrice: number; // $ per share for issues and buybacks
  buyback: number[]; // $M per year
  payout: number; // % of positive net profit paid as dividends
  rolls: number[]; // extra dice rolls per year ($100k each)
  shocks: number[]; // $M one-time profit hit (+) or windfall (-) per year
  tax: number; // %
  cards: SimCard[]; // specific BM cards (from the Cards tab)
  effects: { year: number; label: string; effect: Effect; scale: number }[]; // capital strategies
  // Sell the operating business to an acquirer: in `year` the sold segments' BMs, revenue and costs leave,
  // the price (less fees) arrives as cash and `repayM` of debt is paid off (its interest stops at `rate`).
  exit: { year: number; priceB: number; feesPct: number; repayM: number; costBaseKeptPct: number; sell: Record<Seg, boolean> } | null;
};

export const zeros = () => Array.from({ length: Y }, () => 0);
export const emptyKnobs = (toYear: number): Knobs => ({
  toYear,
  growth: { core: 0, growth: 0, explore: 0 },
  costInflation: 0,
  newBMs: { core: zeros(), growth: zeros(), explore: zeros() },
  profile: { core: { revenue: 0, cost: 0, capex: 0 }, growth: { revenue: 0, cost: 0, capex: 0 }, explore: { revenue: 0, cost: 0, capex: 0 } },
  analystMoves: Array.from({ length: Y }, () => [0, 0, 0, 0, 0]),
  borrow: zeros(), rate: 6, equity: zeros(), issuePrice: 1, buyback: zeros(), payout: 0, rolls: zeros(), shocks: zeros(), tax: 21,
  cards: [], effects: [], exit: null,
});

export type Event = { label: string; mc: number /* $M, direct */; cash: number /* $ */ };
const M = 1e6;
const money = (n: number) => { const a = Math.abs(n), s = n < 0 ? "−" : "+"; return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : `${s}$${(a / M).toFixed(1)}M`; };

export function simulate(b: Base, k: Knobs) {
  // Ratings persist: a future year the workbook hasn't filled in yet carries the last year's ratings.
  const baseAnalysts = (i: number): number[] => {
    for (let j = i; j >= 0; j--) { const r = b.analysts.map((row) => row[j] ?? 0); if (j <= b.now - 1 || r.some(Boolean)) return r; }
    return [0, 0, 0, 0, 0];
  };
  let dCash = 0, newDebt = 0, repaid = 0, shares = b.shares, prevPrice = k.issuePrice;
  const out = [];
  for (let year = b.now; year <= Math.min(Y, k.toYear); year++) {
    const i = year - 1, t = year - b.now, events: Event[] = [];
    // Profit deltas from the knobs.
    let dRev = 0, dBmCost = 0, dCapex = 0;
    const segR = SEGS.map((_, j) => b.segRev[j][i] ?? 0), segC = SEGS.map((_, j) => b.segCost[j][i] ?? 0); // this year, per segment
    SEGS.forEach((s, j) => {
      const f = (1 + k.growth[s] / 100) ** t - 1;
      dRev += (b.segRev[j][i] ?? 0) * f;
      dBmCost += (b.segCost[j][i] ?? 0) * f;
      segR[j] += (b.segRev[j][i] ?? 0) * f;
      segC[j] += (b.segCost[j][i] ?? 0) * f;
    });
    if (dRev) events.push({ label: `Organic growth of today's BMs: revenue ${money(dRev)}`, mc: 0, cash: 0 });
    const units = SEGS.map((s, j) => (b.units[j][i] ?? 0));
    SEGS.forEach((s, j) => {
      for (let a = b.now; a <= year; a++) {
        const n = k.newBMs[s][a - 1] ?? 0;
        if (!n) continue;
        units[j] += n;
        dRev += n * k.profile[s].revenue * M;
        dBmCost += n * k.profile[s].cost * M;
        segR[j] += n * k.profile[s].revenue * M;
        segC[j] += n * k.profile[s].cost * M;
        if (a === year) {
          dCapex += n * k.profile[s].capex * M;
          events.push({ label: `+${n} ${s[0].toUpperCase()}${s.slice(1)} BM${n === 1 ? "" : "s"}`, mc: n * BM_VALUE[s], cash: -n * k.profile[s].capex * M });
        }
      }
    });
    for (const c of k.cards) {
      if (c.startYear > year) continue;
      const j = SEGS.indexOf(c.type);
      units[j] += 1;
      dRev += c.revenue[i] ?? 0;
      dBmCost += c.cost[i] ?? 0;
      segR[j] += c.revenue[i] ?? 0;
      segC[j] += c.cost[i] ?? 0;
      if (c.startYear === year) { dCapex += c.capex; events.push({ label: `Card starts: ${c.label}`, mc: BM_VALUE[c.type], cash: -c.capex }); }
    }
    // The sale: from the exit year the sold segments are gone (their BMs, revenue and costs).
    const ex = k.exit && year >= k.exit.year ? k.exit : null;
    let soldMc = 0;
    if (ex) SEGS.forEach((s, j) => {
      if (!ex.sell[s]) return;
      soldMc += units[j] * BM_VALUE[s];
      dRev -= segR[j];
      dBmCost -= segC[j];
      units[j] = 0;
    });
    if (ex && year === ex.year) {
      const proceeds = ex.priceB * 1e9 * (1 - ex.feesPct / 100);
      repaid = Math.min(ex.repayM * M, b.debt + newDebt + ex.repayM * M);
      dCash += proceeds - ex.repayM * M;
      events.push({ label: `Sell ${SEGS.filter((s) => ex.sell[s]).join(" + ")} business to an acquirer for $${ex.priceB}B (${ex.feesPct}% fees)`, mc: -soldMc, cash: proceeds });
      if (ex.repayM) events.push({ label: `Repay $${ex.repayM.toLocaleString()}M of debt (saves ${money(ex.repayM * M * k.rate / 100)}/yr interest)`, mc: 0, cash: -ex.repayM * M });
    }
    const analysts = baseAnalysts(i);
    for (let a = b.now; a <= year; a++) (k.analystMoves[a - 1] ?? []).forEach((d, r) => (analysts[r] += d));
    const moves = k.analystMoves[i] ?? [];
    if (moves.some(Boolean))
      events.push({ label: `Analyst moves: ${moves.map((d, r) => (d ? `${d > 0 ? "+" : ""}${d} ${ANALYST_NAMES[r]}` : "")).filter(Boolean).join(", ")}`, mc: moves.reduce((s, d, r) => s + d * ANALYST_VALUE[r], 0), cash: 0 });
    // Capital strategies landing by this year.
    let effShares = 0, effInterest = 0;
    for (const e of k.effects) {
      if (e.year > year) continue;
      const f = e.effect, x = e.scale;
      units[0] += Math.round(f.core * x); units[1] += Math.round(f.growth * x); units[2] += Math.round(f.explore * x);
      (f.analysts ?? []).forEach((d, r) => (analysts[r] += Math.round(d * x)));
      effShares += f.shares_m * x * M;
      effInterest += f.interest_m * x * M;
      if (e.year === year) {
        dCash += f.cash_m * x * M;
        events.push({ label: `Strategy lands: ${e.label}`, mc: f.core * x * BM_VALUE.core + f.growth * x * BM_VALUE.growth + f.explore * x * BM_VALUE.explore + (f.analysts ?? []).reduce((s, d, r) => s + d * x * ANALYST_VALUE[r], 0), cash: f.cash_m * x * M });
      }
    }
    // Financing.
    const borrow = (k.borrow[i] ?? 0) * M, equity = (k.equity[i] ?? 0) * M, buyback = (k.buyback[i] ?? 0) * M;
    const dInterest = newDebt * (k.rate / 100) + effInterest; // on debt drawn in earlier years
    newDebt += borrow;
    if (borrow) events.push({ label: `Borrow ${money(borrow)} at ${k.rate}% (${money(-borrow * k.rate / 100)}/yr interest from next year)`, mc: 0, cash: borrow });
    if (equity) { shares += equity / k.issuePrice; events.push({ label: `Issue ${money(equity)} of new shares at $${k.issuePrice}`, mc: 0, cash: equity }); }
    if (buyback) { shares = Math.max(1, shares - buyback / Math.max(0.01, prevPrice)); events.push({ label: `Buy back ${money(buyback)} of shares`, mc: 0, cash: -buyback }); }
    let dCostBase = (b.costBase[i] ?? 0) * ((1 + k.costInflation / 100) ** t - 1) + (k.rolls[i] ?? 0) * 100_000;
    if (ex) dCostBase -= (b.costBase[i] ?? 0) * (1 + k.costInflation / 100) ** t * (1 - ex.costBaseKeptPct / 100); // the buyer takes the rest
    const interestSaved = k.exit && year > k.exit.year ? k.exit.repayM * M * (k.rate / 100) : 0;
    const shock = (k.shocks[i] ?? 0) * M;
    if (shock) events.push({ label: shock > 0 ? `Shock: one-time hit ${money(-shock)}` : `Windfall ${money(-shock)}`, mc: 0, cash: -shock });
    const dPretax = dRev - dBmCost - dCostBase - dInterest + interestSaved - shock;
    const net = (b.net[i] ?? 0) + dPretax * (1 - k.tax / 100);
    const dividends = Math.max(0, net) * (k.payout / 100);
    if (dividends) events.push({ label: `Dividend ${k.payout}% of profit`, mc: 0, cash: -dividends });
    dCash += dPretax * (1 - k.tax / 100) - dCapex + borrow + equity - buyback - dividends;
    const cash = (b.cash[i] ?? 0) + dCash;
    const revenue = SEGS.reduce((s, _, j) => s + (b.segRev[j][i] ?? 0), 0) + dRev;
    const lev = { core: Math.max(0, units[0]), growth: Math.max(0, units[1]), explore: Math.max(0, units[2]), analysts: analysts.map((a) => Math.max(0, a)) };
    const mc = marketCap({ ...lev, cash: Math.max(0, cash) });
    const baseMc = marketCap({ core: b.units[0][i] ?? 0, growth: b.units[1][i] ?? 0, explore: b.units[2][i] ?? 0, analysts: baseAnalysts(i), cash: Math.max(0, b.cash[i] ?? 0) });
    shares += effShares - (out.length ? out[out.length - 1].effShares : 0);
    const price = (mc.total * M) / Math.max(1, shares);
    prevPrice = Math.max(0.01, price);
    out.push({
      year, revenue, net, cash, debt: Math.max(0, b.debt + newDebt - repaid), borrowAbility: (10 * revenue) / 2, shares, price, levers: lev, mc, baseMc,
      uplift: mc.total - baseMc.total, drivers: { portfolio: mc.portfolio - baseMc.portfolio, analysts: mc.analysts - baseMc.analysts, cash: mc.cashTerm - baseMc.cashTerm },
      events, effShares,
    });
  }
  return out;
}
export type SimYear = ReturnType<typeof simulate>[number];

// Plain-language read-out of a run: one line per year, biggest driver first, plus warnings.
export function explain(rows: SimYear[]) {
  const fmt = (m: number, sign = true) => `${m < 0 ? "−" : sign ? "+" : ""}$${Math.abs(m) >= 1000 ? `${(Math.abs(m) / 1000).toFixed(2)}B` : `${Math.abs(m).toFixed(0)}M`}`;
  return rows.map((r) => {
    const parts = (Object.entries(r.drivers) as [string, number][]).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([k, v]) => `${k === "portfolio" ? "business models" : k === "analysts" ? "analyst ratings" : "cash counted"} ${fmt(v)}`);
    const warn: string[] = [];
    if (r.cash < 0) warn.push(`cash is negative (${fmt(r.cash / 1e6, false)}), so cash adds nothing to market cap and the gap must be funded`);
    if (r.debt > r.borrowAbility) warn.push(`debt (${fmt(r.debt / 1e6, false)}) is above borrowing ability (${fmt(r.borrowAbility / 1e6, false)}, 10 × revenue ÷ 2)`);
    if (r.cash > 0 && r.mc.portfolio + r.mc.analysts <= 0) warn.push(`cash (${fmt(r.cash / 1e6, false)}) counts for nothing in market cap while business models + analyst ratings are below zero (${fmt(r.mc.portfolio + r.mc.analysts)}): add Explore BMs or turn Sell ratings`);
    else if (r.mc.cashCapped) warn.push(`cash is above the cap: only ${fmt(r.mc.cashTerm)} of it counts (= business models + analyst ratings); grow those to unlock the rest`);
    if (r.mc.total < 0) warn.push("market cap is below zero");
    return { year: r.year, text: parts.length ? `vs the workbook: ${parts.join(", ")}` : "same as the workbook", warn };
  });
}
