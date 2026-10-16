"use client";

import { useMemo, useState } from "react";
import { ANALYST_NAMES, ANALYST_VALUE, BM_VALUE, exploreNeeded, marketCap, type Levers } from "@/lib/marketcap";
import { useOverview } from "./overview-store";

type Plan = {
  units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; cash: number; shares: number;
  revenue: number; expenses: number; bmProfit10y: number; revenue10y: number;
};
type Overview = { year: number; plan: Plan };

const TARGET = 50_000; // $M
const capM = (m: number) => `${m < 0 ? "−" : ""}$${Math.abs(m) >= 1000 ? `${(Math.abs(m) / 1000).toFixed(2)}B` : `${Math.abs(m).toFixed(0)}M`}`;
const money = (n: number) => capM(n / 1e6);

function Stepper({ label, value, set, hint, step = 1 }: { label: string; value: number; set: (n: number) => void; hint?: string; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm py-0.5">
      <span>{label}{hint && <span className="text-xs text-zinc-500"> · {hint}</span>}</span>
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => set(Math.max(0, value - step))} aria-label={`Less ${label}`} className="w-7 rounded border border-zinc-300 dark:border-zinc-700">−</button>
        <input type="number" min={0} step={step} value={value} onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))} aria-label={label}
          className="w-16 rounded border border-zinc-300 dark:border-zinc-700 p-0.5 text-right tabular-nums" />
        <button type="button" onClick={() => set(value + step)} aria-label={`More ${label}`} className="w-7 rounded border border-zinc-300 dark:border-zinc-700">+</button>
      </span>
    </label>
  );
}

// "How do we get to $50B?": the workbook's market-cap formula with every lever live, plus how to pay for it.
export function PathTo50B({ version, ask, makeTasks }: { version: number; ask: (t: string) => void; makeTasks: (context: string) => void }) {
  const o = useOverview<Overview>(version);
  const p = o?.data?.plan;
  if (!p) return <div className="game-card h-64 animate-pulse" aria-busy="true" />;
  return <Planner key={`${o!.data.year}-${p.units.explore}-${p.analysts.join()}`} year={o!.data.year} p={p} ask={ask} makeTasks={makeTasks} />;
}

function Planner({ year, p, ask, makeTasks }: { year: number; p: Plan; ask: (t: string) => void; makeTasks: (c: string) => void }) {
  const today: Levers = { ...p.units, analysts: [...p.analysts, 0, 0, 0, 0, 0].slice(0, 5), cash: p.cashForCap };
  const [l, setL] = useState<Levers>(today);
  const [bond, setBond] = useState(0); // $M raised
  const [rate, setRate] = useState(6); // % coupon
  const [sharesM, setSharesM] = useState(Math.round(p.shares / 1e6));

  const set = (k: keyof Omit<Levers, "analysts">) => (n: number) => setL({ ...l, [k]: n });
  const setA = (i: number) => (n: number) => setL({ ...l, analysts: l.analysts.map((x, j) => (j === i ? n : x)) });
  const withBond = { ...l, cash: l.cash + bond * 1e6 };
  const now = marketCap(today), mc = marketCap(withBond);
  const price = (mc.total * 1e6) / (sharesM * 1e6);
  const pct = Math.max(0, Math.min(100, (mc.total / TARGET) * 100));
  const base = mc.portfolio + mc.analysts;
  const cashNeeded = Math.max(0, base) / 100; // $M of cash that still counts at the cap

  // Paying for it: profit, borrowing capacity (both rules), bond interest.
  const profit = p.revenue - p.expenses;
  const capWorkbook = p.bmProfit10y / 2;
  const capNote = (10 * p.revenue) / 2;
  const interest = bond * 1e6 * (rate / 100);

  const analystsKey = p.analysts.join();
  const presets: { label: string; why: string; levers: Levers; bond: number }[] = useMemo(() => {
    const clean = [0, today.analysts[1], today.analysts[2], 0, 0];
    const portfolio = { ...today, explore: today.explore + exploreNeeded({ ...today, explore: 0 }) - today.explore };
    const analystLed = { ...today, analysts: [Math.ceil(Math.max(0, TARGET / 2 - marketCap({ ...today, analysts: clean, cash: 0 }).total) / ANALYST_VALUE[0]), clean[1], clean[2], 0, 0] };
    const balanced = { ...today, analysts: [4, clean[1], clean[2], 0, 0] };
    balanced.explore = exploreNeeded(balanced);
    return [
      { label: "Today", why: "What the workbook shows now", levers: today, bond: 0 },
      { label: "Portfolio-led", why: "Keep the ratings, add Explore BMs", levers: portfolio, bond: 250 },
      { label: "Analyst-led", why: "Clear the Sells, earn Outperforms", levers: analystLed, bond: 250 },
      { label: "Balanced", why: "Clear Sells, 4 Outperform, add Explore", levers: balanced, bond: 250 },
    ];
  }, [p.units.explore, analystsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = `Path to $50B (Year ${year}): Core ${l.core}, Growth ${l.growth}, Explore ${l.explore}; analysts ${ANALYST_NAMES.map((n, i) => `${n} ${l.analysts[i]}`).join(", ")}; cash counted ${money(withBond.cash)} (incl. bond ${capM(bond)} at ${rate}%); shares ${sharesM}M -> market cap ${capM(mc.total)} (${pct.toFixed(0)}% of $50B), ${price.toFixed(2)} per share. Today: ${capM(now.total)}.`;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-2xl">How do we get to $50B?</h2>
        <span className="text-xs text-zinc-500">The workbook&rsquo;s own market-cap formula · Year {year} · nothing here is saved</span>
      </div>

      {/* the equation, live */}
      <section className="certificate p-5" aria-label="Market cap equation">
        <div className="relative grid gap-3 sm:grid-cols-[repeat(3,1fr)_auto] items-end">
          {[["Cash × 100", mc.cashTerm, mc.cashCapped ? "capped at portfolio + analysts" : `${money(withBond.cash)} counted`],
            ["Business models", mc.portfolio, `${l.core} Core · ${l.growth} Growth · ${l.explore} Explore`],
            ["Analyst ratings", mc.analysts, ANALYST_NAMES.map((n, i) => (l.analysts[i] ? `${l.analysts[i]} ${n}` : "")).filter(Boolean).join(" · ") || "none"]].map(([t, v, s]) => (
            <div key={t as string}>
              <p className="eyebrow text-white/60">{t}</p>
              <p className={`figure text-3xl ${(v as number) < 0 ? "text-[#ff9aa2]" : ""}`}>{capM(v as number)}</p>
              <p className="text-xs text-white/60">{s}</p>
            </div>
          ))}
          <div className="sm:text-right">
            <p className="eyebrow text-amber-300">= Market cap</p>
            <p className={`figure text-5xl ${mc.total < 0 ? "text-[#ff9aa2]" : ""}`}>{capM(mc.total)}</p>
            <p className="text-xs text-white/70">${price.toFixed(2)} a share · {sharesM.toLocaleString()}M shares</p>
          </div>
        </div>
        <div className="relative mt-4">
          <div className="flex justify-between eyebrow text-white/70 mb-1"><span>{pct.toFixed(1)}% of the way</span><span className="text-amber-300">Gap {capM(Math.max(0, TARGET - mc.total))}</span></div>
          <div className="rail h-2.5 rounded-full overflow-hidden"><span style={{ width: `${Math.max(pct, 0.6)}%` }} /></div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Paths">
        {presets.map((x) => (
          <button key={x.label} onClick={() => (setL(x.levers), setBond(x.bond))} title={x.why}
            className="rounded-full border border-indigo-900 dark:border-indigo-300 px-3 py-1 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950">
            {x.label} <span className="font-normal text-zinc-500">· {capM(marketCap({ ...x.levers, cash: x.levers.cash + x.bond * 1e6 }).total)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <fieldset className="game-card space-y-1">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Business model portfolio</legend>
          <Stepper label="Core" hint={`+${capM(BM_VALUE.core)}`} value={l.core} set={set("core")} />
          <Stepper label="Growth" hint={`+${capM(BM_VALUE.growth)}`} value={l.growth} set={set("growth")} />
          <Stepper label="Explore" hint={`+${capM(BM_VALUE.explore)}`} value={l.explore} set={set("explore")} />
          <p className="text-xs text-zinc-500">Today: {p.units.core} / {p.units.growth} / {p.units.explore}. The board limits how many models each analyst level accepts.</p>
        </fieldset>
        <fieldset className="game-card space-y-1">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Analyst ratings</legend>
          {ANALYST_NAMES.map((n, i) => <Stepper key={n} label={n} hint={`${ANALYST_VALUE[i] > 0 ? "+" : "−"}${capM(Math.abs(ANALYST_VALUE[i]))}`} value={l.analysts[i]} set={setA(i)} />)}
        </fieldset>
        <fieldset className="game-card space-y-1">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Cash, bonds & shares</legend>
          <Stepper label="Cash counted ($M)" value={Math.round(l.cash / 1e6)} set={(n) => setL({ ...l, cash: n * 1e6 })} step={5} />
          <Stepper label="Bond raise ($M)" value={bond} set={setBond} step={25} />
          <Stepper label="Coupon (%)" value={rate} set={setRate} step={0.5} />
          <Stepper label="Shares (M)" hint="buyback lowers" value={sharesM} set={setSharesM} step={50} />
          <p className="text-xs text-zinc-500">Cash counts up to {capM(Math.max(0, base))} of market cap: {money(cashNeeded * 1e6)} of cash is enough today; more adds nothing.</p>
        </fieldset>
      </div>

      <section className="game-card space-y-2" aria-label="How we pay for it">
        <h3 className="text-lg">How we pay for it · Year {year}</h3>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div><dt className="eyebrow text-zinc-500">Revenue − expenses</dt><dd className={`font-display text-2xl ${profit < 0 ? "text-red-600" : ""}`}>{money(profit)}</dd><dd className="text-xs text-zinc-500">{money(p.revenue)} − {money(p.expenses)} (BM cost + cost base + interest)</dd></div>
          <div><dt className="eyebrow text-zinc-500">Borrowing capacity · workbook rule</dt><dd className="font-display text-2xl">{money(capWorkbook)}</dd><dd className="text-xs text-zinc-500">10-year BM profit ÷ 2 (cell L227)</dd></div>
          <div><dt className="eyebrow text-zinc-500">Borrowing capacity · your note</dt><dd className="font-display text-2xl">{money(capNote)}</dd><dd className="text-xs text-zinc-500">10 × this year&rsquo;s revenue ÷ 2 — confirm which rule the facilitator uses</dd></div>
          <div><dt className="eyebrow text-zinc-500">Bond {capM(bond)} at {rate}%</dt><dd className="font-display text-2xl">{money(interest)}/yr</dd>
            <dd className={`text-xs ${bond * 1e6 > Math.max(capWorkbook, capNote) ? "text-red-600" : "text-zinc-500"}`}>{bond * 1e6 > Math.max(capWorkbook, capNote) ? "Above both borrowing limits — needs a different structure (equity, partner money)" : "Within borrowing capacity"}{" · lead lender must consent to new debt"}</dd></div>
        </dl>
      </section>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => ask(`${summary}\n\nAs CFO, give us the corporate finance plan to get to $50B - be aggressive but legitimate and audit-proof: which business models and innovation strategies to add, how to turn our analyst ratings (we hold ${p.analysts[3]} Sell), how much cash to hold vs. invest (cash only counts up to portfolio + analysts), bonds or other financing within our borrowing capacity and lender covenants, buybacks vs. issuance, and the order of moves by year. Rank the moves by $ of market cap per $ spent.`)}
          className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Corporate finance magic: plan this path</button>
        <button onClick={() => makeTasks(`The team chose this path to $50B: ${summary}`)} className="rounded-md px-3 py-1.5 text-sm font-semibold border border-green-700 text-green-800 dark:text-green-300">📋 Turn this path into tasks</button>
      </div>
      <p className="text-xs text-zinc-500">Market cap here follows the workbook formula exactly; the game&rsquo;s real valuation is greyer — capital markets reward a convincing story up to a point.</p>
    </div>
  );
}
