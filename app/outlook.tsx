"use client";

import { INSTRUMENTS, financingPlan, type PlanStrat } from "@/lib/outlook";
import { DIVIDEND_PRESETS, NEW_NAME, bridge, defaultBridge, defaultOutlook, outlook, type Bridge, type Outlook, type OutlookBase, type OutlookRow } from "@/lib/outlook";
import { useEffect, useState } from "react";
import { refreshOverview, useOverview } from "./overview-store";
import { infusion, type Base as SimBase, type InfusionCard } from "@/lib/simulate";

type O = { year: number; goal: { year: number; cap: number }; outlookBase: OutlookBase; outlook: Partial<Outlook>; certificate?: { caps: number[] }; sim?: SimBase; capital?: PlanStrat[]; plan?: { revenue: number; debt: number } };
type Roi = ReturnType<typeof outlook>["roi"];

const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : `${s}$${(a / 1e6).toFixed(1)}M`;
};
export const ps = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1000 ? Math.round(Math.abs(n)).toLocaleString() : Math.abs(n).toFixed(Math.abs(n) >= 10 ? 1 : 2)}`;

// The saved outlook (or defaults) and its results; shared with the presentation.
export function useInvestorCase(version: number) {
  const o = useOverview<O>(version);
  const d = o?.data?.outlookBase ? o.data : null;
  if (!d) return null;
  const saved: Outlook = { ...defaultOutlook(d.year, d.goal.year), ...(d.outlook ?? {}) };
  return { capital: d.capital ?? [], borrow: d.plan ? { ability: (10 * d.plan.revenue) / 2, debt: d.plan.debt } : null, sim: d.sim ?? null, base: d.outlookBase, game: d.certificate?.caps ?? [], saved, hasSaved: Object.keys(d.outlook ?? {}).length > 0, goal: d.goal, run: (x: Outlook) => outlook(d.outlookBase, x) };
}

// Top-down, step by step: what we earn, what the market pays for it, and what a shareholder gets.
export function Ladder({ r, roi, o, className = "grid gap-2 sm:grid-cols-4 lg:grid-cols-7" }: { r: OutlookRow; roi: Roi; o: Outlook; className?: string }) {
  const steps = [
    { k: "Revenue", v: money(r.revenue), s: r.company === NEW_NAME ? `${NEW_NAME}: space & fintech` : `vehicles ${money(r.vehicles)} · Nexus ${money(r.nexus)}` },
    { k: "EBITDA", v: money(r.ebitda), s: "after operating costs" },
    { k: "Net profit", v: money(r.net), s: "after interest, depreciation, tax" },
    { k: "EPS", v: ps(r.eps), s: `÷ ${(r.shares / 1e6).toFixed(0)}M shares (buybacks shrink this)` },
    { k: "Share price", v: ps(r.price), s: r.cashPerShare ? `EPS × ${o.pe} P/E + ${ps(r.cashPerShare)} cash a share` : `EPS × ${o.pe} P/E` },
    ...(roi ? [
      { k: "Dividends", v: ps(roi.dividends), s: `per share to Year ${r.year}${o.saleYear ? ", incl. the special" : ""}` },
      { k: "Return", v: `${roi.multiple.toFixed(1)}×`, s: `from ${ps(o.entryPrice)}: ${roi.annualPct.toFixed(0)}%/yr over ${roi.years} yr` },
    ] : []),
  ];
  return (
    <ol className={className} aria-label="From revenue to return">
      {steps.map((x, i) => (
        <li key={x.k} className={`rounded-lg p-3 ${i === steps.length - 1 && roi ? "bg-[var(--gold)] text-[var(--ink)]" : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"}`}>
          <p className="eyebrow opacity-70">{i + 1} · {x.k}</p>
          <p className={`font-display text-2xl tabular-nums leading-tight ${x.v.startsWith("−") ? "text-red-600" : ""}`}>{x.v}</p>
          <p className="text-xs opacity-75 leading-snug">{x.s}</p>
        </li>
      ))}
    </ol>
  );
}

const PART_COLOR = ["var(--core)", "var(--growth)", "var(--explore)", "#7c6aa8", "var(--gold)"];

// Why the buyer pays the price: the parts they get, valued one by one, against the target. Also the deck slide.
export function WhyPrice({ rows, o, onChange }: { rows: OutlookRow[]; o: Outlook; onChange?: (b: Bridge) => void }) {
  const [comps, setComps] = useState<{ company: string; ev_revenue: number | null }[]>([]);
  useEffect(() => void fetch("/api/comps").then((r) => r.json()).then((x) => Array.isArray(x) && setComps(x.filter((c) => c.ev_revenue)), () => {}), []);
  const x = o.bridge ?? defaultBridge(o.pe);
  const row = rows.find((r) => r.year === o.saleYear) ?? rows[rows.length - 1];
  const b = bridge(row, o.tax, x);
  const target = x.targetB * 1e9, max = Math.max(target, b.total) * 1.05;
  const set = (p: Partial<Bridge>) => onChange?.({ ...x, ...p });
  const num = (v: number, f: (n: number) => void, label: string, step = 1, w = "w-20") => (
    <input type="number" step={step} value={v} aria-label={label} onChange={(e) => f(Number(e.target.value) || 0)} disabled={!onChange}
      className={`${w} rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5 text-right tabular-nums text-sm`} />
  );
  // Where each segment of the bar starts (cumulative %).
  const widths = b.parts.map((p) => (Math.max(0, p.v) / max) * 100);
  const starts = widths.map((_, i) => widths.slice(0, i).reduce((a, w) => a + w, 0));
  const end = widths.reduce((a, w) => a + w, 0);
  return (
    <section className="rounded-lg bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3 space-y-3" aria-label="Why the sale price">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">Why ${x.targetB}B: what the buyer gets</h3>
        <p className={`text-sm font-semibold ${b.gap > 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{money(b.total)} built up{b.gap > 0 ? ` · ${money(b.gap)} still to argue` : ` · ${money(-b.gap)} above the target`}</p>
      </div>
      <div className="relative h-10 rounded bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden>
        {b.parts.map((p, i) => <span key={p.k} className="absolute inset-y-0" style={{ left: `${starts[i]}%`, width: `${widths[i]}%`, background: PART_COLOR[i] }} title={`${p.k} ${money(p.v)}`} />)}
        {b.gap > 0 && <span className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#d2353f33_0_6px,transparent_6px_12px)]" style={{ left: `${end}%`, width: `${(b.gap / max) * 100}%` }} />}
        <span className="absolute inset-y-0 w-0.5 bg-zinc-900 dark:bg-white" style={{ left: `${(target / max) * 100}%` }} />
      </div>
      <ul className="grid gap-2 sm:grid-cols-5 text-sm">
        {b.parts.map((p, i) => (
          <li key={p.k} className="rounded border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="eyebrow flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: PART_COLOR[i] }} />{p.k}</p>
            <p className="font-display text-xl tabular-nums">{money(p.v)}</p>
            <p className="text-xs text-zinc-500">{p.how}</p>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <p className="rounded bg-amber-50 dark:bg-amber-950/30 p-2"><b>The buyer gets:</b> the vehicle business and its plants, the legacy systems, the Dragon Nexus platform, and the loyal customers who love our UX.</p>
        <p className="rounded bg-indigo-50 dark:bg-indigo-950/30 p-2"><b>We keep:</b> the core human brains. {NEW_NAME} is rebuilt from scratch, AI-native, with none of the legacy infrastructure.</p>
      </div>
      {onChange && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-sm">
          <label className="flex items-center gap-1.5">Target ${num(x.targetB, (n) => set({ targetB: n }), "Target price", 1, "w-16")}B</label>
          <label className="flex items-center gap-1.5">Vehicle P/E {num(x.vehiclePe, (n) => set({ vehiclePe: n }), "Vehicle P/E", 1, "w-16")}×</label>
          <label className="flex items-center gap-1.5">Nexus EV/revenue {num(x.nexusMultiple, (n) => set({ nexusMultiple: n }), "Nexus multiple", 0.5, "w-16")}×</label>
          {comps.length > 0 && <span className="text-xs text-zinc-500 flex flex-wrap gap-1 items-center">comps:{comps.slice(0, 5).map((c) => <button key={c.company} onClick={() => set({ nexusMultiple: Math.round(c.ev_revenue! * 10) / 10 })} className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2">{c.company} {c.ev_revenue!.toFixed(1)}×</button>)}</span>}
          <label className="flex items-center gap-1.5">Customers {num(x.customers, (n) => set({ customers: n }), "Customers", 1000, "w-28")} × ${num(x.valuePerCustomer, (n) => set({ valuePerCustomer: n }), "Value per customer", 100, "w-20")}</label>
          <label className="flex items-center gap-1.5">Network & data ${num(x.networkB, (n) => set({ networkB: n }), "Network value", 0.5, "w-16")}B</label>
          <label className="flex items-center gap-1.5">Strategic premium {num(x.premiumPct, (n) => set({ premiumPct: n }), "Premium", 5, "w-16")} %</label>
          <span className="text-xs text-zinc-500 basis-full">Valued on Year {row.year} figures (the sale year): vehicle revenue {money(row.vehicles)}, Dragon Nexus revenue {money(row.nexus)}. Every multiple and count is a team assumption; the comparables guide them.</span>
        </div>
      )}
    </section>
  );
}

// What an investor's money does: new shares at a price, the cash funding chosen cards, and the projected
// market cap and EPS with and without it (same simulator as Finance). Also the deck slide.
export function useCards() {
  const [cards, setCards] = useState<(InfusionCard & { status: string })[]>([]);
  useEffect(() => void fetch("/api/cards").then((r) => r.json()).then((x) => Array.isArray(x) && setCards(x), () => {}), []);
  return cards;
}
export function Infusion({ sim, o, cards, onChange }: { sim: SimBase; o: Outlook; cards: (InfusionCard & { status: string })[]; onChange?: (inf: NonNullable<Outlook["infusion"]>) => void }) {
  const inf = o.infusion ?? { amountM: 0, price: o.entryPrice, year: sim.now, toYear: Math.max(o.toYear, sim.now + 2), cardIds: [] };
  const set = (p: Partial<typeof inf>) => onChange?.({ ...inf, ...p });
  const r = infusion(sim, inf, cards);
  const last = r.rows[r.rows.length - 1];
  const choosable = cards.filter((c) => ["Core", "Growth", "Explore"].includes(c.type) && c.status !== "booked" && c.status !== "passed");
  const dil = (r.newShares / (sim.shares + r.newShares)) * 100;
  const capM = (n: number) => money(n * 1e6);
  const num = (v: number, f: (n: number) => void, label: string, step = 1, w = "w-20") => (
    <input type="number" step={step} value={v} aria-label={label} onChange={(e) => f(Number(e.target.value) || 0)}
      className={`${w} rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5 text-right tabular-nums text-sm`} />
  );
  return (
    <section className="rounded-lg bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3 space-y-3" aria-label="What your capital does">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">What a capital infusion does</h3>
        {inf.amountM > 0 && <p className="text-sm font-semibold">${inf.amountM}M at ${inf.price.toFixed(2)} a share → market cap {capM(last.with.mc.total)} in Year {last.year} ({last.mcDelta >= 0 ? "+" : ""}{capM(last.mcDelta)} vs without)</p>}
      </div>
      {onChange && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-sm">
          <label className="flex items-center gap-1.5">Raise ${num(inf.amountM, (n) => set({ amountM: n }), "Infusion amount", 25)}M</label>
          <label className="flex items-center gap-1.5">at ${num(inf.price, (n) => set({ price: n }), "Price per share", 0.1, "w-16")} a share</label>
          <label className="flex items-center gap-1.5">in
            <select value={inf.year} onChange={(e) => set({ year: +e.target.value })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
              {Array.from({ length: 10 - sim.now + 1 }, (_, j) => sim.now + j).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">play to
            <select value={inf.toYear} onChange={(e) => set({ toYear: +e.target.value })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
              {Array.from({ length: 10 - inf.year }, (_, j) => inf.year + 1 + j).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </label>
          {choosable.length > 0 && (
            <span className="basis-full flex flex-wrap gap-2 items-center">
              <span className="text-zinc-500">It funds:</span>
              {choosable.map((c) => (
                <label key={c.id} className="flex items-center gap-1 rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5">
                  <input type="checkbox" checked={inf.cardIds.includes(c.id)} onChange={(e) => set({ cardIds: e.target.checked ? [...inf.cardIds, c.id] : inf.cardIds.filter((x) => x !== c.id) })} />
                  {c.title} <span className="text-xs text-zinc-500">cap.ex {money(c.capex)}</span>
                </label>
              ))}
              {inf.cardIds.length > 0 && <button onClick={() => set({ amountM: Math.round(r.spent / 1e6) })} className="text-xs underline">raise exactly what they cost ({money(r.spent)})</button>}
            </span>
          )}
        </div>
      )}
      {inf.amountM > 0 ? (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{(r.newShares / 1e6).toFixed(0)}M new shares ({dil.toFixed(0)}% dilution). {r.funded.length ? `Funds ${r.funded.map((c) => c.title).join(", ")} (${money(r.spent)})` : "Funds no card yet"}{r.leftover > 0 ? `; ${money(r.leftover)} stays as cash` : r.leftover < 0 ? `; ${money(-r.leftover)} short of what they cost` : ""}. Cash counts ×100 toward market cap, up to business models + ratings.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[32rem]">
              <thead><tr><th />{r.rows.map((x) => <th key={x.year} className="eyebrow text-zinc-500 px-2 text-right">Year {x.year}</th>)}</tr></thead>
              <tbody>
                {([["Market cap, with the infusion", (x: (typeof r.rows)[number]) => capM(x.with.mc.total)], ["Market cap, without", (x: (typeof r.rows)[number]) => capM(x.without.mc.total)], ["Difference", (x: (typeof r.rows)[number]) => `${x.mcDelta >= 0 ? "+" : ""}${capM(x.mcDelta)}`],
                  ["EPS with / without", (x: (typeof r.rows)[number]) => `${ps(x.epsWith)} / ${ps(x.epsWithout)}`], ["Cash with the infusion", (x: (typeof r.rows)[number]) => money(x.with.cash)]] as const).map(([l, f]) => (
                  <tr key={l} className="border-t border-zinc-200 dark:border-zinc-800"><th scope="row" className="text-left font-normal py-1 pr-3 whitespace-nowrap">{l}</th>{r.rows.map((x) => <td key={x.year} className="px-2 text-right tabular-nums">{f(x)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="text-sm text-zinc-500">Set an amount{onChange ? " (and tick the cards it funds)" : ""} to see what it does.</p>}
    </section>
  );
}

// How we raise (and return) money, by instrument: committed (locked), in progress (pitching), or in our outlook.
const INSTR_COLOR: Record<string, string> = { "Selling shares": "var(--explore)", "Bonds & loans": "var(--core)", "Partner & customer money": "var(--growth)", "Returning cash to shareholders": "var(--gold)", "The sale": "#d2353f", "Investing in space & fintech": "#0e7490", "Advisor-structured financing": "#9333ea" };
export function FinancingPlan({ strats, o, borrow }: { strats: PlanStrat[]; o: Outlook; borrow: { ability: number; debt: number } | null }) {
  const { lines, totals } = financingPlan(strats, o);
  const ideas = strats.filter((s) => s.status === "idea" && s.effect && (s.effect.cash_m > 0 || s.effect.shares_m !== 0)).length;
  return (
    <section className="rounded-lg bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3 space-y-3" aria-label="Financing plan">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">Our financing plan: how we raise and return money</h3>
        {borrow && <span className="text-xs text-zinc-500">Borrowing ability {money(borrow.ability)} (10 × revenue ÷ 2) · {money(borrow.debt)} drawn</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {INSTRUMENTS.map((k) => (
          <div key={k} className="rounded border border-zinc-200 dark:border-zinc-800 p-2">
            <p className="eyebrow flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: INSTR_COLOR[k] }} />{k}</p>
            <p className="font-display text-xl tabular-nums">{totals[k] ? money(totals[k] * 1e6) : "—"}</p>
            <p className="text-xs text-zinc-500">{lines.filter((l) => l.instrument === k).length || "none"} planned</p>
          </div>
        ))}
      </div>
      {lines.length ? (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
          {INSTRUMENTS.flatMap((k) => lines.filter((l) => l.instrument === k)).map((l, i) => (
            <li key={i} className="py-1.5 flex flex-wrap items-baseline gap-x-3">
              <span className="w-2.5 h-2.5 rounded-sm self-center" style={{ background: INSTR_COLOR[l.instrument] }} />
              <span className="flex-1 min-w-48">{l.name}<span className="text-xs text-zinc-500">{l.note ? ` · ${l.note}` : ""}</span></span>
              <span className="tabular-nums">{l.amountM ? money(l.amountM * 1e6) : ""}</span>
              <span className="text-xs text-zinc-500 w-16">{l.year ? `Year ${l.year}` : "each year"}</span>
              <span className={`chip !text-[10px] ${l.status === "committed" ? "!bg-green-700" : l.status === "in progress" ? "!bg-amber-600" : "!bg-indigo-900"}`}>{l.status}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-zinc-500">Nothing is pitching or locked yet.</p>}
      <p className="text-xs text-zinc-500">
        Committed = locked on the <a href="#capital/plan-strategies" className="underline">capital board</a>; in progress = pitching; outlook = this Investor case (infusion, buybacks, dividends, sale).
        {ideas > 0 && ` ${ideas} more idea${ideas === 1 ? "" : "s"} on the board could raise money: pitch or lock them to add them here.`} New borrowing needs the lead lender&rsquo;s consent.
      </p>
    </section>
  );
}

// Terralink's money, start to finish: launch capital into space and into fintech, what each earns per
// year, and what the capital returns. The clear tie between the sale and the new businesses.
export function MoneyMap({ rows, o, strats = [], compact = false }: { rows: OutlookRow[]; o: Outlook; strats?: PlanStrat[]; compact?: boolean }) {
  // Initial funding raised for each venture before the sale (committed or pitching strategies' uses).
  const seed = (k: string) => strats.filter((s) => ["locked", "pitching"].includes(s.status)).flatMap((s) => (s.uses ?? []).filter((u) => new RegExp(k, "i").test(u.what)).map((u) => ({ name: s.name, year: s.year, amount: u.amount_m * 1e6 })));
  const sale = rows.find((r) => r.year === o.saleYear);
  if (!sale) return null;
  const after = rows.filter((r) => r.year > o.saleYear);
  const line = (k: "space" | "fintech", capital: number, color: string) => {
    const rev = after.reduce((s, r) => s + r[k], 0), cost = after.reduce((s, r) => s + (k === "space" ? r.spaceCost : r.fintechCost), 0);
    return (
      <div className="rounded border border-zinc-200 dark:border-zinc-800 p-3 space-y-1">
        <p className="eyebrow flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{k === "space" ? "Space" : "Fintech"}</p>
        {seed(k).map((x) => <p key={x.name} className="text-sm">{money(x.amount)} initial funding{x.year ? ` (Year ${x.year})` : ""} <span className="text-xs text-zinc-500">· {x.name}</span></p>)}
        <p className="text-sm"><b className="font-display text-2xl tabular-nums">{money(capital)}</b> launch capital from the sale (Year {o.saleYear})</p>
        {(!compact || rev > 0) && <p className="text-sm tabular-nums">{after.length ? after.map((r) => `Y${r.year} ${money(r[k])}`).join(" · ") : "no years after the sale in view"} revenue</p>}
        {(!compact || rev > 0) && <p className="text-xs text-zinc-500">To Year {rows[rows.length - 1].year}: revenue {money(rev)} − cost {money(cost)} = {money(rev - cost)}{capital > 0 ? ` · ${(((rev - cost) / capital) * 100).toFixed(1)}% of the capital back so far` : ""}</p>}
        {rev === 0 && !compact && <p className="text-xs text-amber-700">Set {k} revenue and cost by year under Assumptions to project its return.</p>}
      </div>
    );
  };
  return (
    <section className="rounded-lg bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3 space-y-2" aria-label="Terralink money map">
      <h3 className="text-lg">Where the sale money goes: {NEW_NAME}&rsquo;s space and fintech</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">${o.salePriceB}B sale → repay ${o.debtM}M debt → {o.specialDivPct}% special dividend + {o.buybackPct}% buyback to shareholders → <b>{money(sale.launchSpace + sale.launchFintech)} launches {NEW_NAME}</b>.</p>
      <div className="grid gap-2 sm:grid-cols-2">{line("space", sale.launchSpace, "#0e7490")}{line("fintech", sale.launchFintech, "var(--explore)")}</div>
    </section>
  );
}

// What the company is worth each year, and what that value is made of.
export function ValuationPath({ rows, o, game }: { rows: OutlookRow[]; o: Outlook; game: number[] }) {
  const sale = o.saleYear ? o.salePriceB * 1e9 : 0;
  const max = Math.max(1, ...rows.map((r) => r.valuation), sale);
  return (
    <section className="rounded-lg bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 p-3 space-y-2" aria-label="Valuation by year">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">Valuation by year</h3>
        <span className="text-xs text-zinc-500 flex flex-wrap gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--growth)]" />earnings × {o.pe} P/E</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-700" />cash held</span>
          {sale > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--gold)]" />sale price</span>}
        </span>
      </div>
      <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(7rem, 1fr))` }}>
        {rows.map((r) => {
          const h = (v: number) => `${(Math.max(0, v) / max) * 100}%`, sold = r.year === o.saleYear;
          return (
            <li key={r.year} className="space-y-1 min-w-0">
              <p className="eyebrow text-zinc-500">Year {r.year} · {r.company}</p>
              <div className="h-28 flex items-end gap-1">
                <div className="flex-1 h-full flex flex-col justify-end" title={`Valuation ${money(r.valuation)}`}>
                  <span className="rounded-t bg-indigo-700" style={{ height: h(r.cashValue) }} />
                  <span className={`bg-[var(--growth)] ${r.cashValue ? "" : "rounded-t"}`} style={{ height: h(r.earningsValue) }} />
                </div>
                {sold && <span className="flex-1 rounded-t bg-[var(--gold)]" style={{ height: h(sale) }} title={`Sold for $${o.salePriceB}B`} />}
              </div>
              <p className="font-display text-2xl tabular-nums leading-none">{money(r.valuation)}</p>
              <p className="text-xs text-zinc-500 leading-snug">{money(r.earningsValue)} earnings value{r.cashValue ? ` + ${money(r.cashValue)} cash` : ""}{sold ? ` · business sold for $${o.salePriceB}B` : ""}</p>
              {game[r.year - 1] !== undefined && <p className="text-xs text-zinc-400">game score (workbook): {money(game[r.year - 1] * 1e6)}</p>}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-zinc-500">Investor view: what the market pays for our earnings at a {o.pe}× P/E, plus the cash on the balance sheet. The game score is the workbook&rsquo;s own formula (business models + analyst ratings + cash × 100); a year it hasn&rsquo;t filled in shows $0.</p>
    </section>
  );
}

export function InvestorCase({ version, ask }: { version: number; ask: (t: string) => void }) {
  const ic = useInvestorCase(version);
  const cards = useCards();
  const [edit, setEdit] = useState<Outlook | null>(null);
  const [msg, setMsg] = useState("");
  if (!ic) return <div className="game-card h-64 animate-pulse" aria-busy="true" />;
  const o = edit ?? ic.saved;
  const { rows, roi } = ic.run(o);
  const last = rows[rows.length - 1];
  const sale = rows.find((r) => r.year === o.saleYear);
  const set = (p: Partial<Outlook>) => setEdit({ ...o, ...p });
  const years = rows.map((r) => r.year);
  type Arr = "nexusGmv" | "nexusCost" | "otherRevenue" | "otherCost" | "fintechRevenue" | "fintechCost" | "newSharesM" | "interest" | "buybackM";
  const arr = (k: Arr, y: number, v: number) => { const a = [...(o[k] ?? [])]; a[y - 1] = v; set({ [k]: a }); };
  const save = async () => {
    const r = await fetch("/api/strategy", { method: "PUT", body: JSON.stringify({ outlook: o }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setMsg(r.error ? `⚠ ${r.error}` : "✓ Saved as our outlook: the presentation and PowerPoint use it.");
    if (r.error) return;
    setEdit(null);
    refreshOverview();
  };
  const num = (v: number, f: (n: number) => void, label: string, step = 1, w = "w-20") => (
    <input type="number" step={step} value={Number.isFinite(v) ? v : 0} aria-label={label} onChange={(e) => f(Number(e.target.value) || 0)}
      className={`${w} rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5 text-right tabular-nums text-sm`} />
  );
  const line = (label: string, f: (r: OutlookRow) => string, strong = false, neg?: (r: OutlookRow) => boolean) => (
    <tr className={`border-t border-zinc-200 dark:border-zinc-800 ${strong ? "font-semibold" : ""}`}>
      <th scope="row" className="text-left font-normal py-1 pr-3 whitespace-nowrap">{label}</th>
      {rows.map((r) => <td key={r.year} className={`px-2 text-right tabular-nums ${r.company === NEW_NAME ? "bg-indigo-50/60 dark:bg-indigo-950/30" : ""} ${neg?.(r) ? "text-red-600" : ""}`}>{f(r)}</td>)}
    </tr>
  );
  const divPreset = (Object.entries(DIVIDEND_PRESETS) as [string, number][]).find(([, v]) => v === o.payout)?.[0];
  const summary = `Investor case (team assumptions): ${rows.map((r) => `Y${r.year} ${r.company}: revenue ${money(r.revenue)}, EBITDA ${money(r.ebitda)}, net ${money(r.net)}, ${(r.shares / 1e6).toFixed(0)}M shares, EPS ${ps(r.eps)}, price ${ps(r.price)} at ${o.pe}x P/E, DPS ${ps(r.dps)}${r.events.length ? ` (${r.events.map((e) => e.label).join("; ")})` : ""}`).join("; ")}.${roi ? ` Investor: entry ${ps(o.entryPrice)} -> price ${ps(roi.endPrice)} + dividends ${ps(roi.dividends)} = ${roi.multiple.toFixed(1)}x (${roi.annualPct.toFixed(0)}%/yr).` : ""}`;
  return (
    <section className="rounded-xl border-2 border-[var(--gold)] bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900 p-4 sm:p-5 space-y-4" aria-label="Investor case">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="eyebrow text-amber-700 dark:text-amber-300">The investor case · Flying Dragon → {NEW_NAME}</p>
          <p className="font-display text-xl text-indigo-800 dark:text-indigo-300">Valued at {money(last.valuation)} in Year {last.year}{o.saleYear ? ` · the business sells for $${o.salePriceB}B in Year ${o.saleYear}` : ""}</p>
          <h2 className="text-2xl sm:text-3xl leading-tight">{roi ? `${ps(o.entryPrice)} today → ${ps(roi.endPrice)} a share + ${ps(roi.dividends)} in dividends: ${roi.multiple.toFixed(1)}× by Year ${last.year}` : "Earnings outlook: from revenue to share price"}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{o.saleYear ? `The dragon is shedding: we sell the vehicle + Dragon Nexus business in Year ${o.saleYear} for $${o.salePriceB}B, repay debt, return cash to shareholders, and launch ${NEW_NAME}, the terrestrial link to space mobility.` : "No sale in this outlook yet: set one under Assumptions."} Year {ic.base.now} is the workbook; later years are the team&rsquo;s assumptions, not forecasts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => ask(`${summary}\n\nPropose a defensible set of outlook assumptions: vehicle revenue growth, Dragon Nexus GMV by year and take rate, Nexus costs, ${NEW_NAME} (space and fintech) revenue and cost after the sale, a dividend strategy (none, moderate or aggressive) and buybacks to drive the share price, the P/E investors would pay (use our comparable valuations), an entry price for new investors, and the sale year, price ($50-60B) and split of proceeds. Mark every number as an assumption and say which to confirm with the facilitators.`)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold border border-amber-600 text-amber-800 dark:text-amber-300">✨ Propose assumptions</button>
          <button onClick={() => ask(`${summary}\n\nWrite the compelling, honest investor story for the board and capital markets: "The dragon is shedding" - Flying Dragon sells the vehicle + Dragon Nexus business (the network effect and the UX our loyal customers love) for $50-60B, repays debt, returns cash through a special dividend and buybacks, and launches ${NEW_NAME}, the terrestrial link to space mobility (space + fintech). Make the acquisition message clear: we keep the core human brains and go AI-native; the buyer takes the legacy infrastructure we no longer need, and ${NEW_NAME} is rebuilt from scratch on a modern, AI-first model. Walk the return step by step (EPS, share price, DPS, total return), why a strategic buyer pays the price, how dividends and buybacks drive the share price, the risks and what must be true. No invented facts; [placeholders] where we have no number.`)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Write the investor story</button>
        </div>
      </div>

      <ValuationPath rows={rows} o={o} game={ic.game} />
      {ic.sim && <Infusion sim={ic.sim} o={o} cards={cards} onChange={(inf) => set({ infusion: inf })} />}
      {o.saleYear > 0 && <WhyPrice rows={rows} o={o} onChange={(b) => set({ bridge: b })} />}
      <Ladder r={last} roi={roi} o={o} />
      <FinancingPlan strats={ic.capital} o={o} borrow={ic.borrow} />
      {o.saleYear > 0 && <MoneyMap rows={rows} o={o} strats={ic.capital} />}
      {sale && (
        <div className="rounded-lg border-l-4 border-[var(--gold)] bg-white/70 dark:bg-zinc-900/60 px-3 py-2 text-sm">
          <b>Year {sale.year}: the dragon is shedding.</b> {sale.events.map((e) => e.label).join(" · ")}.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead><tr><th />{rows.map((r) => <th key={r.year} className={`eyebrow px-2 text-right ${r.company === NEW_NAME ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500"}`}>Year {r.year}<span className="block normal-case">{r.company}{r.year === ic.base.now ? " · workbook" : ""}{r.year === o.saleYear ? " · sale" : ""}</span></th>)}</tr></thead>
          <tbody>
            {line("Vehicles", (r) => money(r.vehicles))}
            {line("Dragon Nexus (take of GMV)", (r) => money(r.nexus))}
            {line(`Space (${NEW_NAME})`, (r) => money(r.space))}
            {line(`Fintech (${NEW_NAME})`, (r) => money(r.fintech))}
            {line("Other & one-time", (r) => money(r.other - r.space - r.fintech + r.oneTime))}
            {line("Revenue", (r) => money(r.revenue), true)}
            {line("− operating costs & cost base", (r) => money(-(r.vehicleCost + r.nexusCost + r.otherCost + r.costBase)))}
            {line("EBITDA", (r) => money(r.ebitda), true, (r) => r.ebitda < 0)}
            {line("− interest, depreciation, tax", (r) => money(-(r.interest + r.depreciation + r.tax)))}
            {line("Net profit", (r) => money(r.net), true, (r) => r.net < 0)}
            {line("Shares (after buybacks)", (r) => `${(r.shares / 1e6).toFixed(0)}M`)}
            {line("EPS", (r) => ps(r.eps), true, (r) => r.eps < 0)}
            {line("Cash held per share", (r) => (r.cashPerShare ? ps(r.cashPerShare) : "—"))}
            {line(`Share price (EPS × ${o.pe} + cash)`, (r) => ps(r.price), true)}
            {line("Valuation (share price × shares)", (r) => money(r.valuation), true)}
            {line("DPS (incl. special)", (r) => ps(r.dps), true)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">How the levers move the share price: buybacks retire shares, so the same profit is more per share (EPS up, price up at the same P/E). Dividends put cash in shareholders&rsquo; hands every year, and an aggressive payout signals confidence; whether the game&rsquo;s analysts reward it is a question for the facilitators.</p>
      {ic.base.interest > 50e6 && <p className="text-xs text-red-600">⚠ This year&rsquo;s workbook interest is {money(ic.base.interest)} (cell K34), flagged in the audit as likely wrong ($1.25M on the $25M loan). Set future interest below.</p>}

      <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3" open={!ic.hasSaved || !!edit}>
        <summary className="cursor-pointer font-display uppercase tracking-wide">Assumptions {edit && <span className="text-xs text-amber-700 normal-case tracking-normal">· unsaved changes</span>}</summary>
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Dividend strategy</span>
            {(Object.entries(DIVIDEND_PRESETS) as [string, number][]).map(([k, v]) => (
              <button key={k} onClick={() => set({ payout: v })} aria-pressed={divPreset === k}
                className={`rounded-full px-3 py-1 text-sm border ${divPreset === k ? "bg-indigo-900 text-white border-indigo-900" : "border-zinc-300 dark:border-zinc-700"}`}>{k} ({v}% of profit)</button>
            ))}
            <label className="flex items-center gap-1.5">or {num(o.payout, (n) => set({ payout: n }), "Payout", 5, "w-16")} %</label>
          </div>
          <p className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-1.5">P/E multiple {num(o.pe, (n) => set({ pe: n }), "P/E", 1, "w-16")}×</label>
            <label className="flex items-center gap-1.5">Investor entry price ${num(o.entryPrice, (n) => set({ entryPrice: n }), "Entry price", 0.1, "w-16")}</label>
            <label className="flex items-center gap-1.5">Vehicle revenue growth {num(o.vehicleGrowth, (n) => set({ vehicleGrowth: n }), "Vehicle growth", 1, "w-16")} %/yr</label>
            <label className="flex items-center gap-1.5">Take rate {num(o.takeRate, (n) => set({ takeRate: n }), "Take rate", 1, "w-16")} %</label>
            <label className="flex items-center gap-1.5">Cost base growth {num(o.costBaseGrowth, (n) => set({ costBaseGrowth: n }), "Cost base growth", 1, "w-16")} %/yr</label>
            <label className="flex items-center gap-1.5">Tax {num(o.tax, (n) => set({ tax: n }), "Tax", 1, "w-16")} %</label>
          </p>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr><th />{years.map((y) => <th key={y} className="eyebrow text-zinc-500 px-1">Year {y}</th>)}</tr></thead>
              <tbody>
                {([["Nexus marketplace GMV ($M)", "nexusGmv"], ["Nexus running cost ($M)", "nexusCost"], [`${NEW_NAME} space revenue ($M)`, "otherRevenue"], [`${NEW_NAME} space cost ($M)`, "otherCost"], [`${NEW_NAME} fintech revenue ($M)`, "fintechRevenue"], [`${NEW_NAME} fintech cost ($M)`, "fintechCost"], ["Share buybacks ($M)", "buybackM"], ["Interest ($M; blank = workbook)", "interest"], ["New shares issued (M)", "newSharesM"]] as const).map(([l, k]) => (
                  <tr key={k}><th scope="row" className="text-left font-normal pr-2 whitespace-nowrap">{l}</th>
                    {years.map((y) => <td key={y} className="px-0.5">{y === ic.base.now && ["nexusCost", "otherCost", "fintechCost", "interest", "newSharesM"].includes(k) ? <span className="text-xs text-zinc-400 px-2">workbook</span> : num(o[k]?.[y - 1] ?? 0, (n) => arr(k, y, n), `${l} Year ${y}`, 5)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-2">
            <legend className="px-1 font-semibold">The sale: the dragon is shedding, {NEW_NAME} launches</legend>
            <p className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-1.5">Sell at the end of
                <select value={o.saleYear} onChange={(e) => set({ saleYear: +e.target.value })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
                  <option value={0}>no sale</option>{years.map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">for ${num(o.salePriceB, (n) => set({ salePriceB: n }), "Sale price", 0.5, "w-16")}B</label>
              <label className="flex items-center gap-1.5">repay ${num(o.debtM, (n) => set({ debtM: n }), "Debt repaid", 25)}M debt</label>
              <label className="flex items-center gap-1.5">special dividend {num(o.specialDivPct, (n) => set({ specialDivPct: n }), "Special dividend %", 5, "w-16")} %</label>
              <label className="flex items-center gap-1.5">buyback {num(o.buybackPct, (n) => set({ buybackPct: n }), "Buyback %", 5, "w-16")} %</label>
              <span className="text-xs text-zinc-500">of the net proceeds; the rest ({Math.max(0, 100 - o.specialDivPct - o.buybackPct)}%) launches {NEW_NAME}</span>
              <label className="flex items-center gap-1.5">of which space {num(o.spaceSharePct ?? 50, (n) => set({ spaceSharePct: Math.max(0, Math.min(100, n)) }), "Space share", 5, "w-16")} % (fintech {100 - (o.spaceSharePct ?? 50)}%)</label>
              <label className="flex items-center gap-1.5">{NEW_NAME} keeps {num(o.costBaseKeptPct, (n) => set({ costBaseKeptPct: n }), "Cost base kept", 5, "w-16")} % of the cost base</label>
            </p>
          </fieldset>
          <p className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-1.5">Play to
              <select value={o.toYear} onChange={(e) => set({ toYear: +e.target.value })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
                {Array.from({ length: 10 - ic.base.now }, (_, j) => ic.base.now + 1 + j).map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </label>
            <button onClick={save} disabled={!edit} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-indigo-900 text-white disabled:opacity-40">Save as our outlook</button>
            {edit && <button onClick={() => setEdit(null)} className="rounded-md px-3 py-1.5 text-sm border border-zinc-400">Discard changes</button>}
          </p>
          {msg && <p className={`text-sm font-semibold ${msg.startsWith("⚠") ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{msg}</p>}
        </div>
      </details>
    </section>
  );
}
