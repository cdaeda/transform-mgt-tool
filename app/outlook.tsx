"use client";

import { useState } from "react";
import { DIVIDEND_PRESETS, NEW_NAME, defaultOutlook, outlook, type Outlook, type OutlookBase, type OutlookRow } from "@/lib/outlook";
import { refreshOverview, useOverview } from "./overview-store";

type O = { year: number; goal: { year: number; cap: number }; outlookBase: OutlookBase; outlook: Partial<Outlook> };
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
  return { base: d.outlookBase, saved, hasSaved: Object.keys(d.outlook ?? {}).length > 0, goal: d.goal, run: (x: Outlook) => outlook(d.outlookBase, x) };
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

export function InvestorCase({ version, ask }: { version: number; ask: (t: string) => void }) {
  const ic = useInvestorCase(version);
  const [edit, setEdit] = useState<Outlook | null>(null);
  const [msg, setMsg] = useState("");
  if (!ic) return <div className="game-card h-64 animate-pulse" aria-busy="true" />;
  const o = edit ?? ic.saved;
  const { rows, roi } = ic.run(o);
  const last = rows[rows.length - 1];
  const sale = rows.find((r) => r.year === o.saleYear);
  const set = (p: Partial<Outlook>) => setEdit({ ...o, ...p });
  const years = rows.map((r) => r.year);
  type Arr = "nexusGmv" | "nexusCost" | "otherRevenue" | "otherCost" | "newSharesM" | "interest" | "buybackM";
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
          <h2 className="text-2xl sm:text-3xl leading-tight">{roi ? `${ps(o.entryPrice)} today → ${ps(roi.endPrice)} a share + ${ps(roi.dividends)} in dividends: ${roi.multiple.toFixed(1)}× by Year ${last.year}` : "Earnings outlook: from revenue to share price"}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{o.saleYear ? `We shed our skin: sell the vehicle + Dragon Nexus business in Year ${o.saleYear} for $${o.salePriceB}B, repay debt, return cash to shareholders, and launch ${NEW_NAME}, the terrestrial link to space mobility.` : "No sale in this outlook yet: set one under Assumptions."} Year {ic.base.now} is the workbook; later years are the team&rsquo;s assumptions, not forecasts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => ask(`${summary}\n\nPropose a defensible set of outlook assumptions: vehicle revenue growth, Dragon Nexus GMV by year and take rate, Nexus costs, ${NEW_NAME} (space and fintech) revenue and cost after the sale, a dividend strategy (none, moderate or aggressive) and buybacks to drive the share price, the P/E investors would pay (use our comparable valuations), an entry price for new investors, and the sale year, price ($50-60B) and split of proceeds. Mark every number as an assumption and say which to confirm with the facilitators.`)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold border border-amber-600 text-amber-800 dark:text-amber-300">✨ Propose assumptions</button>
          <button onClick={() => ask(`${summary}\n\nWrite the compelling, honest investor story for the board and capital markets: Flying Dragon sheds its skin - sells the vehicle + Dragon Nexus business (the network effect and the UX our loyal customers love) for $50-60B, repays debt, returns cash through a special dividend and buybacks, and launches ${NEW_NAME}, the terrestrial link to space mobility (space + fintech). Walk the return step by step (EPS, share price, DPS, total return), why a strategic buyer pays the price, how dividends and buybacks drive the share price, the risks and what must be true. No invented facts; [placeholders] where we have no number.`)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Write the investor story</button>
        </div>
      </div>

      <Ladder r={last} roi={roi} o={o} />
      {sale && (
        <div className="rounded-lg border-l-4 border-[var(--gold)] bg-white/70 dark:bg-zinc-900/60 px-3 py-2 text-sm">
          <b>Year {sale.year}: shedding the skin.</b> {sale.events.map((e) => e.label).join(" · ")}.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead><tr><th />{rows.map((r) => <th key={r.year} className={`eyebrow px-2 text-right ${r.company === NEW_NAME ? "text-indigo-700 dark:text-indigo-300" : "text-zinc-500"}`}>Year {r.year}<span className="block normal-case">{r.company}{r.year === ic.base.now ? " · workbook" : ""}{r.year === o.saleYear ? " · sale" : ""}</span></th>)}</tr></thead>
          <tbody>
            {line("Vehicles", (r) => money(r.vehicles))}
            {line("Dragon Nexus (take of GMV)", (r) => money(r.nexus))}
            {line(`Space & fintech (${NEW_NAME})`, (r) => money(r.other + r.oneTime))}
            {line("Revenue", (r) => money(r.revenue), true)}
            {line("− operating costs & cost base", (r) => money(-(r.vehicleCost + r.nexusCost + r.otherCost + r.costBase)))}
            {line("EBITDA", (r) => money(r.ebitda), true, (r) => r.ebitda < 0)}
            {line("− interest, depreciation, tax", (r) => money(-(r.interest + r.depreciation + r.tax)))}
            {line("Net profit", (r) => money(r.net), true, (r) => r.net < 0)}
            {line("Shares (after buybacks)", (r) => `${(r.shares / 1e6).toFixed(0)}M`)}
            {line("EPS", (r) => ps(r.eps), true, (r) => r.eps < 0)}
            {line("Cash held per share", (r) => (r.cashPerShare ? ps(r.cashPerShare) : "—"))}
            {line(`Share price (EPS × ${o.pe} + cash)`, (r) => ps(r.price), true)}
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
                {([["Nexus marketplace GMV ($M)", "nexusGmv"], ["Nexus running cost ($M)", "nexusCost"], [`${NEW_NAME} space & fintech revenue ($M)`, "otherRevenue"], [`${NEW_NAME} space & fintech cost ($M)`, "otherCost"], ["Share buybacks ($M)", "buybackM"], ["Interest ($M; blank = workbook)", "interest"], ["New shares issued (M)", "newSharesM"]] as const).map(([l, k]) => (
                  <tr key={k}><th scope="row" className="text-left font-normal pr-2 whitespace-nowrap">{l}</th>
                    {years.map((y) => <td key={y} className="px-0.5">{y === ic.base.now && ["nexusCost", "otherCost", "interest", "newSharesM"].includes(k) ? <span className="text-xs text-zinc-400 px-2">workbook</span> : num(o[k]?.[y - 1] ?? 0, (n) => arr(k, y, n), `${l} Year ${y}`, 5)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <fieldset className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-2">
            <legend className="px-1 font-semibold">The sale: shed the skin, launch {NEW_NAME}</legend>
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
