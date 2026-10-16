// Earnings outlook and investor return, top-down (pure, no I/O): revenue by engine -> EBITDA -> net
// profit -> EPS -> share price (EPS x P/E) -> dividends and buybacks -> return on investment.
// The story: Flying Dragon runs vehicles + Dragon Nexus, sells that business to an acquirer, repays debt,
// returns cash (special dividend + buyback) and launches Terralink, the terrestrial link to space mobility.
// The current year is the workbook; later years are the team's assumptions (saved in strategy.outlook).
// ponytail: tax on positive profit only (no loss carry-forward), no tax on the sale gain, depreciation
// and the sale's effect on interest are simple; add detail if the facilitators' rules need it.

export const NEW_NAME = "Terralink";

export type Outlook = {
  toYear: number;
  vehicleGrowth: number; // %/yr on top of the workbook's own vehicle (Core + Growth BM) revenue per year; costs scale with it
  nexusGmv: number[]; // $M of Dragon Nexus marketplace transactions per year (index = game year - 1)
  takeRate: number; // % we keep of each transaction (the strategy's illustrative example: 20%)
  nexusCost: number[]; // $M/yr to run Dragon Nexus
  otherRevenue: number[]; // $M/yr space & fintech (Terralink) revenue
  otherCost: number[]; // $M/yr space & fintech cost
  costBaseGrowth: number; // %/yr on the cost base
  interest: number[]; // $M/yr; empty years use this year's workbook interest
  tax: number; // %
  payout: number; // % of positive net profit paid as regular dividends
  buybackM: number[]; // $M of shares bought back per year (at that year's share price)
  newSharesM: number[]; // shares issued per year (M)
  pe: number; // price / earnings multiple investors pay
  entryPrice: number; // $ per share an investor pays today
  // The sale of the vehicle + Dragon Nexus business (0 = no sale in the horizon). It closes at the end
  // of saleYear: that year still earns, later years are Terralink only.
  saleYear: number;
  salePriceB: number;
  debtM: number; // total debt to repay ($M)
  specialDivPct: number; // % of the net proceeds paid out as a special dividend
  buybackPct: number; // % of the net proceeds used to buy back shares
  costBaseKeptPct: number; // % of the cost base Terralink keeps after the sale
  bridge?: Bridge; // why the sale price: sum of the parts
};

export type OutlookBase = {
  now: number;
  vehicleRev: number; vehicleCost: number; // this year, $ (Core + Growth BMs)
  vehicleRevY?: number[]; vehicleCostY?: number[]; // the workbook's per-year figures (index = game year - 1)
  exploreRev: number; exploreCost: number;
  costBase: number; interest: number; depreciation: number; oneTime: number; shares: number;
};

const z = () => Array.from({ length: 10 }, () => 0);
export const DIVIDEND_PRESETS = { none: 0, moderate: 30, aggressive: 80 } as const;
export const defaultOutlook = (now: number, goalYear: number): Outlook => ({
  toYear: Math.max(goalYear, now + 2), vehicleGrowth: 0, nexusGmv: z(), takeRate: 20, nexusCost: z(), otherRevenue: z(), otherCost: z(),
  costBaseGrowth: 0, interest: [], tax: 21, payout: 0, buybackM: z(), newSharesM: z(), pe: 15, entryPrice: 1,
  saleYear: goalYear, salePriceB: 55, debtM: 925, specialDivPct: 30, buybackPct: 30, costBaseKeptPct: 50,
});

const M = 1e6;
export function outlook(b: OutlookBase, o: Outlook) {
  let shares = b.shares, cumDps = 0, netCash = 0; // netCash: Terralink's cash pile after the sale
  const rows = [];
  for (let year = b.now; year <= Math.min(10, o.toYear); year++) {
    const i = year - 1, t = year - b.now, g = (1 + o.vehicleGrowth / 100) ** t;
    const sold = o.saleYear > 0 && year > o.saleYear; // Terralink only
    // The workbook's own projection for that year (booked BMs), grown by the team's assumption.
    const wbRev = b.vehicleRevY?.[i] ?? b.vehicleRev, wbCost = b.vehicleCostY?.[i] ?? b.vehicleCost;
    const vehicles = sold ? 0 : wbRev * g, vehicleCost = sold ? 0 : wbCost * g;
    const nexus = sold ? 0 : (((o.nexusGmv[i] ?? 0) * o.takeRate) / 100) * M, nexusCost = sold ? 0 : (o.nexusCost[i] ?? 0) * M;
    const other = (o.otherRevenue[i] ?? 0) * M + (t === 0 ? b.exploreRev : 0), otherCost = (o.otherCost[i] ?? 0) * M + (t === 0 ? b.exploreCost : 0);
    const oneTime = t === 0 ? b.oneTime : 0;
    const revenue = vehicles + nexus + other + oneTime;
    const costBase = b.costBase * (1 + o.costBaseGrowth / 100) ** t * (sold ? o.costBaseKeptPct / 100 : 1);
    const ebitda = revenue - vehicleCost - nexusCost - otherCost - costBase;
    const set = t > 0 && o.interest[i] !== undefined && o.interest[i] !== null;
    const interest = sold && o.debtM > 0 ? 0 : set ? o.interest[i] * M : b.interest; // the sale repays the debt
    const depreciation = sold ? 0 : b.depreciation;
    const pretax = ebitda - interest - depreciation;
    const tax = Math.max(0, pretax) * (o.tax / 100);
    const net = pretax - tax;
    if (t > 0) shares += (o.newSharesM[i] ?? 0) * M;
    const events: { label: string; dps?: number; sharesM?: number }[] = [];
    // Price before this year's buybacks: EPS x P/E on the shares we start with.
    const priceBefore = Math.max(0.01, (net / shares) * o.pe, o.entryPrice);
    const regularBuyback = (o.buybackM[i] ?? 0) * M;
    if (regularBuyback) { const n = Math.min(regularBuyback / priceBefore, shares * 0.9); shares -= n; events.push({ label: `Buy back $${(regularBuyback / M).toFixed(0)}M of shares`, sharesM: -n / M }); }
    let dps = (Math.max(0, net) * (o.payout / 100)) / shares;
    let saleProceeds = 0;
    if (o.saleYear === year) {
      saleProceeds = o.salePriceB * 1e9 - o.debtM * M;
      const special = (saleProceeds * o.specialDivPct) / 100 / shares;
      // After the sale the shares are worth at least the net proceeds per share, so buy back at that price.
      const bb = (saleProceeds * o.buybackPct) / 100, n = Math.min(bb / Math.max(priceBefore, saleProceeds / shares), shares * 0.9);
      dps += special;
      shares -= n;
      events.push({ label: `Sell the vehicle + Dragon Nexus business for $${o.salePriceB}B, repay $${o.debtM}M of debt` });
      if (special) events.push({ label: `Special dividend $${special.toFixed(2)} a share`, dps: special });
      if (bb) events.push({ label: `Buy back $${(bb / 1e9).toFixed(1)}B of shares`, sharesM: -n / M });
      events.push({ label: `$${((saleProceeds * (100 - o.specialDivPct - o.buybackPct)) / 100 / 1e9).toFixed(1)}B launches ${NEW_NAME}` });
    }
    if (o.saleYear === year) netCash = (saleProceeds * Math.max(0, 100 - o.specialDivPct - o.buybackPct)) / 100;
    else if (o.saleYear && year > o.saleYear) netCash += net - Math.max(0, net) * (o.payout / 100) - regularBuyback;
    const eps = net / shares;
    const cashPerShare = Math.max(0, netCash) / shares;
    const price = Math.max(0, eps * o.pe) + cashPerShare; // earnings value + the cash Terralink holds
    cumDps += dps;
    rows.push({ year, company: sold ? NEW_NAME : "Flying Dragon", vehicles, nexus, gmv: sold ? 0 : (o.nexusGmv[i] ?? 0) * M, other, oneTime, revenue, vehicleCost, nexusCost, otherCost, costBase, ebitda, interest, depreciation, tax, net, shares, eps, price, cashPerShare, dps, cumDps, saleProceeds, events,
      // Valuation = what the market pays for the earnings (EPS x P/E) plus the cash Terralink holds.
      earningsValue: Math.max(0, eps * o.pe) * shares, cashValue: Math.max(0, netCash), valuation: price * shares });
  }
  // Investor return: buy at the entry price today, collect every dividend, hold to the last year's price.
  const last = rows[rows.length - 1];
  const received = last.price + last.cumDps;
  const years = Math.max(1, last.year - b.now);
  const roi = o.entryPrice > 0 ? {
    endPrice: last.price, dividends: last.cumDps, received, multiple: received / o.entryPrice,
    totalPct: (received / o.entryPrice - 1) * 100, annualPct: ((Math.max(0, received) / o.entryPrice) ** (1 / years) - 1) * 100, years,
  } : null;
  return { rows, roi };
}
export type OutlookRow = ReturnType<typeof outlook>["rows"][number];

// This year's starting point from the workbook snapshot (lib/snapshot.ts): Core + Growth BMs are the vehicle business.
type SnapLike = { seg: Record<number, number[]>; years: { revenue: number; oneTime: number; costBase: number; interest: number; depreciation: number; shares: number }[] };
export function outlookBaseFrom(snap: SnapLike, now: number): OutlookBase {
  const i = now - 1, at = (r: number) => snap.seg[r]?.[i] ?? 0, y = snap.years[i];
  return {
    now, vehicleRev: at(68) + at(86), vehicleCost: at(128) + at(146), exploreRev: at(104), exploreCost: at(164),
    vehicleRevY: Array.from({ length: 10 }, (_, k) => (snap.seg[68]?.[k] ?? 0) + (snap.seg[86]?.[k] ?? 0)),
    vehicleCostY: Array.from({ length: 10 }, (_, k) => (snap.seg[128]?.[k] ?? 0) + (snap.seg[146]?.[k] ?? 0)),
    costBase: y.costBase, interest: y.interest, depreciation: y.depreciation, oneTime: y.oneTime, shares: y.shares || 1e9,
  };
}

// One line per year, for prompts.
export function outlookText(b: OutlookBase, o: Outlook) {
  const { rows, roi } = outlook(b, o);
  const m = (n: number) => `$${(n / 1e6).toFixed(1)}M`, p = (n: number) => `$${n.toFixed(2)}`;
  return `P/E ${o.pe}x, regular payout ${o.payout}%, entry price ${p(o.entryPrice)}.\n` + rows.map((r) => `Y${r.year} ${r.company}${r.year === b.now ? " (workbook)" : " (team assumption)"}: revenue ${m(r.revenue)} [vehicles ${m(r.vehicles)}, Dragon Nexus ${m(r.nexus)} = ${o.takeRate}% of ${m(r.gmv)} GMV, space & fintech ${m(r.other)}], EBITDA ${m(r.ebitda)}, net profit ${m(r.net)}, shares ${(r.shares / 1e6).toFixed(0)}M, EPS ${p(r.eps)}, share price ${p(r.price)}, DPS ${p(r.dps)}${r.events.length ? ` - ${r.events.map((e) => e.label).join("; ")}` : ""}`).join("\n") +
    (roi ? `\nINVESTOR RETURN: entry ${p(o.entryPrice)} -> final share price ${p(roi.endPrice)} + dividends ${p(roi.dividends)} = ${roi.multiple.toFixed(1)}x, ${roi.annualPct.toFixed(0)}%/yr over ${roi.years} years.` : "");
}

// Why $60B: a sum of the parts the buyer gets, each with its own method, against the target price.
// Every input is the team's assumption (comparables guide the multiples); the gap is shown, not hidden.
export type Bridge = {
  targetB: number;
  vehiclePe: number; // x the vehicle business's after-tax earnings in the sale year
  nexusMultiple: number; // x Dragon Nexus revenue (EV / revenue) in the sale year
  customers: number; // loyal customers the buyer inherits
  valuePerCustomer: number; // $ lifetime value per customer
  networkB: number; // $B for the contributor network and data assets
  premiumPct: number; // strategic / control premium on the standalone sum
};
export const defaultBridge = (pe: number): Bridge => ({ targetB: 60, vehiclePe: pe, nexusMultiple: 0, customers: 0, valuePerCustomer: 0, networkB: 0, premiumPct: 0 });

export function bridge(row: { vehicles: number; vehicleCost: number; nexus: number }, tax: number, x: Bridge) {
  const vehicleEarnings = Math.max(0, row.vehicles - row.vehicleCost) * (1 - tax / 100);
  const parts = [
    { k: "Vehicle business", how: `after-tax earnings × ${x.vehiclePe} P/E`, v: vehicleEarnings * x.vehiclePe },
    { k: "Dragon Nexus platform", how: `revenue × ${x.nexusMultiple} EV/revenue`, v: row.nexus * x.nexusMultiple },
    { k: "Customer base", how: `${x.customers.toLocaleString()} customers × $${x.valuePerCustomer.toLocaleString()}`, v: x.customers * x.valuePerCustomer },
    { k: "Network & data assets", how: "contributor network, the 4D map and data", v: x.networkB * 1e9 },
  ];
  const standalone = parts.reduce((s, p) => s + p.v, 0);
  const premium = (standalone * x.premiumPct) / 100;
  const total = standalone + premium;
  return { parts: [...parts, { k: "Strategic premium", how: `${x.premiumPct}% on top: control and synergies`, v: premium }], standalone, total, gap: x.targetB * 1e9 - total };
}

// The built-in "Why $60B" slide, inserted after the deck's acquisition slide (no speaker notes, so the
// 3-minute timing is unchanged). Bullets carry the message; the bridge is the visual.
export function whyPriceSlide(rows: ReturnType<typeof outlook>["rows"], o: Outlook) {
  const x = o.bridge ?? defaultBridge(o.pe);
  const row = rows.find((r) => r.year === o.saleYear) ?? rows[rows.length - 1];
  const b = bridge(row, o.tax, x);
  const m = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`);
  return {
    kind: "why_price", headline: `Why $${x.targetB}B: the buyer gets a working business, we keep the brains`, notes: "",
    bullets: [
      "The buyer gets the vehicle business, its plants and legacy systems, Dragon Nexus and the loyal customers who love our UX",
      `${NEW_NAME} keeps the core human brains and rebuilds from scratch, AI-native, with none of the legacy infrastructure`,
      `Sum of the parts: ${b.parts.filter((p) => p.v > 0).map((p) => `${p.k} ${m(p.v)}`).join(" + ") || "[set the bridge in Capital > Investor case]"} = ${m(b.total)}`,
      b.gap > 0 ? `${m(b.gap)} still to argue: strategic value beyond the standalone parts` : `${m(-b.gap)} above the $${x.targetB}B ask`,
    ],
    bridge: b,
  };
}
