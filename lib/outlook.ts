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
  otherRevenue: number[]; // $M/yr Terralink SPACE revenue
  otherCost: number[]; // $M/yr Terralink space cost
  fintechRevenue?: number[]; // $M/yr Terralink FINTECH revenue
  fintechCost?: number[]; // $M/yr Terralink fintech cost
  spaceSharePct?: number; // % of the launch capital that goes to space (the rest to fintech)
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
  infusion?: { amountM: number; price: number; year: number; toYear: number; cardIds: number[] }; // what new capital does
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
  fintechRevenue: z(), fintechCost: z(), spaceSharePct: 50,
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
    const space = (o.otherRevenue[i] ?? 0) * M, fintech = (o.fintechRevenue?.[i] ?? 0) * M;
    const spaceCost = (o.otherCost[i] ?? 0) * M, fintechCost = (o.fintechCost?.[i] ?? 0) * M;
    const other = space + fintech + (t === 0 ? b.exploreRev : 0), otherCost = spaceCost + fintechCost + (t === 0 ? b.exploreCost : 0);
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
      const launch = (saleProceeds * (100 - o.specialDivPct - o.buybackPct)) / 100, sp = (o.spaceSharePct ?? 50) / 100;
      events.push({ label: `$${(launch / 1e9).toFixed(1)}B launches ${NEW_NAME}: $${((launch * sp) / 1e9).toFixed(1)}B space, $${((launch * (1 - sp)) / 1e9).toFixed(1)}B fintech` });
    }
    let launchSpace = 0, launchFintech = 0;
    if (o.saleYear === year) {
      netCash = (saleProceeds * Math.max(0, 100 - o.specialDivPct - o.buybackPct)) / 100;
      launchSpace = (netCash * (o.spaceSharePct ?? 50)) / 100;
      launchFintech = netCash - launchSpace;
    }
    else if (o.saleYear && year > o.saleYear) netCash += net - Math.max(0, net) * (o.payout / 100) - regularBuyback;
    const eps = net / shares;
    const cashPerShare = Math.max(0, netCash) / shares;
    const price = Math.max(0, eps * o.pe) + cashPerShare; // earnings value + the cash Terralink holds
    cumDps += dps;
    rows.push({ year, company: sold ? NEW_NAME : "Flying Dragon", vehicles, nexus, gmv: sold ? 0 : (o.nexusGmv[i] ?? 0) * M, other, oneTime, revenue, vehicleCost, nexusCost, otherCost, costBase, ebitda, interest, depreciation, tax, net, shares, eps, price, cashPerShare, dps, cumDps, saleProceeds, events, space, fintech, spaceCost, fintechCost, launchSpace, launchFintech,
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
  return `P/E ${o.pe}x, regular payout ${o.payout}%, entry price ${p(o.entryPrice)}.\n` + rows.map((r) => `Y${r.year} ${r.company}${r.year === b.now ? " (workbook)" : " (team assumption)"}: revenue ${m(r.revenue)} [vehicles ${m(r.vehicles)}, Dragon Nexus ${m(r.nexus)} = ${o.takeRate}% of ${m(r.gmv)} GMV, space ${m(r.space)}, fintech ${m(r.fintech)}], EBITDA ${m(r.ebitda)}, net profit ${m(r.net)}, shares ${(r.shares / 1e6).toFixed(0)}M, EPS ${p(r.eps)}, share price ${p(r.price)}, DPS ${p(r.dps)}${r.events.length ? ` - ${r.events.map((e) => e.label).join("; ")}` : ""}`).join("\n") +
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

// The built-in "What your capital does" slide, after the deck's funding-plan (deliver) slide.
import { infusion as runInfusion, type Base as SimBase, type InfusionCard } from "./simulate.ts";
export function infusionSlide(sim: SimBase, o: Outlook, cards: InfusionCard[]) {
  const inf = o.infusion;
  if (!inf || inf.amountM <= 0) return null;
  const r = runInfusion(sim, inf, cards), last = r.rows[r.rows.length - 1];
  const m = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(0)}M`);
  return {
    kind: "infusion", notes: "", result: r,
    headline: `$${inf.amountM}M of new capital takes us to ${m(last.with.mc.total * 1e6)} by Year ${last.year}`,
    bullets: [
      `$${inf.amountM}M at $${inf.price.toFixed(2)} a share in Year ${inf.year}: ${(r.newShares / 1e6).toFixed(0)}M new shares`,
      r.funded.length ? `It funds ${r.funded.map((c) => c.title).join(", ")} (${m(r.spent)})${r.leftover > 0 ? ` and leaves ${m(r.leftover)} of cash` : ""}` : "It strengthens the balance sheet: cash counts ×100 toward market cap",
      `Year ${last.year}: market cap ${m(last.with.mc.total * 1e6)} vs ${m(last.without.mc.total * 1e6)} without (${last.mcDelta >= 0 ? "+" : ""}${m(last.mcDelta * 1e6)})`,
      `EPS ${last.epsWith.toFixed(2)} vs ${last.epsWithout.toFixed(2)} without · projections from our strategy and the workbook, not forecasts`,
    ],
  };
}

// Our financing plan by instrument: the capital strategies we're pitching or have locked (classified by
// what they do to cash, shares and interest), plus the outlook's infusion, buybacks, dividends and sale.
export type PlanStrat = { name: string; status: string; year: number | null; scale?: number; category?: string; effect: { cash_m: number; shares_m: number; interest_m: number } | null };
export const INSTRUMENTS = ["Selling shares", "Bonds & loans", "Partner & customer money", "Returning cash to shareholders", "The sale", "Investing in space & fintech"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];
export function financingPlan(strats: PlanStrat[], o: Outlook) {
  const lines: { instrument: Instrument; name: string; year: number | null; amountM: number; status: "committed" | "in progress" | "outlook"; note: string }[] = [];
  for (const s of strats) {
    if (!s.effect || !["locked", "pitching"].includes(s.status)) continue;
    const e = s.effect, x = s.scale ?? 1, status = s.status === "locked" ? "committed" : "in progress";
    const instrument: Instrument | null = e.shares_m < 0 ? "Returning cash to shareholders" : e.shares_m > 0 ? "Selling shares" : e.interest_m > 0 ? "Bonds & loans" : e.cash_m > 0 ? "Partner & customer money" : null;
    if (!instrument) continue; // ratings campaigns and the like raise no money
    lines.push({ instrument, name: s.name, year: s.year, amountM: Math.abs(e.cash_m * x), status,
      note: [e.shares_m ? `${e.shares_m > 0 ? "+" : ""}${(e.shares_m * x).toFixed(0)}M shares` : "", e.interest_m > 0 ? `$${(e.interest_m * x).toFixed(1)}M/yr interest` : ""].filter(Boolean).join(" · ") });
  }
  if (o.infusion && o.infusion.amountM > 0)
    lines.push({ instrument: "Selling shares", name: `Capital infusion at $${o.infusion.price.toFixed(2)} a share`, year: o.infusion.year, amountM: o.infusion.amountM, status: "outlook", note: `${(o.infusion.amountM / Math.max(0.01, o.infusion.price)).toFixed(0)}M new shares` });
  o.buybackM.forEach((v, i) => v > 0 && lines.push({ instrument: "Returning cash to shareholders", name: "Share buyback", year: i + 1, amountM: v, status: "outlook", note: "lifts EPS" }));
  if (o.payout > 0) lines.push({ instrument: "Returning cash to shareholders", name: `Dividend policy: ${o.payout}% of profit`, year: null, amountM: 0, status: "outlook", note: o.payout >= 80 ? "aggressive" : o.payout >= 30 ? "moderate" : "light" });
  if (o.saleYear) {
    const net = o.salePriceB * 1000 - o.debtM;
    lines.push({ instrument: "The sale", name: `Sell the vehicle + Dragon Nexus business for $${o.salePriceB}B`, year: o.saleYear, amountM: o.salePriceB * 1000, status: "outlook", note: `repays $${o.debtM}M of debt` });
    if (o.specialDivPct) lines.push({ instrument: "Returning cash to shareholders", name: "Special dividend from the sale", year: o.saleYear, amountM: (net * o.specialDivPct) / 100, status: "outlook", note: `${o.specialDivPct}% of net proceeds` });
    if (o.buybackPct) lines.push({ instrument: "Returning cash to shareholders", name: "Buyback from the sale", year: o.saleYear, amountM: (net * o.buybackPct) / 100, status: "outlook", note: `${o.buybackPct}% of net proceeds` });
    const launch = (net * Math.max(0, 100 - o.specialDivPct - o.buybackPct)) / 100, sp = (o.spaceSharePct ?? 50) / 100;
    if (launch > 0) {
      lines.push({ instrument: "Investing in space & fintech", name: `${NEW_NAME} space launch capital`, year: o.saleYear, amountM: launch * sp, status: "outlook", note: `${Math.round(sp * 100)}% of the launch capital` });
      lines.push({ instrument: "Investing in space & fintech", name: `${NEW_NAME} fintech launch capital`, year: o.saleYear, amountM: launch * (1 - sp), status: "outlook", note: `${Math.round((1 - sp) * 100)}% of the launch capital` });
    }
  }
  const totals = Object.fromEntries(INSTRUMENTS.map((k) => [k, lines.filter((l) => l.instrument === k).reduce((s, l) => s + l.amountM, 0)])) as Record<Instrument, number>;
  return { lines, totals };
}

export function financingPlanText(strats: PlanStrat[], o: Outlook) {
  const { lines } = financingPlan(strats, o);
  if (!lines.length) return "No financing instrument is pitching, locked or in the outlook yet.";
  return INSTRUMENTS.map((k) => {
    const ls = lines.filter((l) => l.instrument === k);
    return ls.length ? `${k}: ${ls.map((l) => `${l.name}${l.amountM ? ` $${l.amountM.toFixed(0)}M` : ""}${l.year ? ` (Year ${l.year})` : ""} [${l.status}]${l.note ? ` - ${l.note}` : ""}`).join("; ")}` : `${k}: none planned`;
  }).join("\n");
}
