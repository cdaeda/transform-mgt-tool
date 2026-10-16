"use client";

import { useMemo, useState } from "react";
import { project, type Strat } from "@/lib/capital";
import { ANALYST_NAMES, ANALYST_VALUE, BM_VALUE, exploreNeeded, marketCap, type Levers } from "@/lib/marketcap";
import { refreshOverview, useOverview } from "./overview-store";

type Plan = {
  units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; cash: number; shares: number;
  revenue: number; expenses: number; bmProfit10y: number; revenue10y: number;
  years: { year: number; revenue: number; expenses: number }[];
};
type Overview = { year: number; plan: Plan; goal: { year: number; cap: number }; capital: (Strat & { category: string })[] };

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
  return (
    <>
      <Planner key={`${o!.data.year}-${p.units.explore}-${p.analysts.join()}`} year={o!.data.year} p={p} ask={ask} makeTasks={makeTasks} />
      <YearPlan o={o!.data} />
    </>
  );
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
        <fieldset className="game-card space-y-1 [&>legend+*]:clear-both">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Business model portfolio</legend>
          <Stepper label="Core" hint={`+${capM(BM_VALUE.core)}`} value={l.core} set={set("core")} />
          <Stepper label="Growth" hint={`+${capM(BM_VALUE.growth)}`} value={l.growth} set={set("growth")} />
          <Stepper label="Explore" hint={`+${capM(BM_VALUE.explore)}`} value={l.explore} set={set("explore")} />
          <p className="text-xs text-zinc-500">Today: {p.units.core} / {p.units.growth} / {p.units.explore}. The board limits how many models each analyst level accepts.</p>
        </fieldset>
        <fieldset className="game-card space-y-1 [&>legend+*]:clear-both">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Analyst ratings</legend>
          {ANALYST_NAMES.map((n, i) => <Stepper key={n} label={n} hint={`${ANALYST_VALUE[i] > 0 ? "+" : "−"}${capM(Math.abs(ANALYST_VALUE[i]))}`} value={l.analysts[i]} set={setA(i)} />)}
        </fieldset>
        <fieldset className="game-card space-y-1 [&>legend+*]:clear-both">
          <legend className="eyebrow text-zinc-500 float-left w-full mb-2">Cash, bonds & shares</legend>
          <Stepper label="Cash counted ($M)" value={Math.round(l.cash / 1e6)} set={(n) => setL({ ...l, cash: n * 1e6 })} step={5} />
          <Stepper label="Bond raise ($M)" value={bond} set={setBond} step={25} />
          <Stepper label="Coupon (%)" value={rate} set={setRate} step={0.5} />
          <Stepper label="Shares (M)" hint="buyback lowers" value={sharesM} set={setSharesM} step={50} />
          <p className="text-xs text-zinc-500">Cash counts up to {capM(Math.max(0, base))} of market cap: {money(cashNeeded * 1e6)} of cash is enough today; more adds nothing.</p>
        </fieldset>
      </div>

      <p className="text-sm">
        Bond {capM(bond)} at {rate}%: <b>{money(interest)}/yr</b> interest ·{" "}
        <span className={bond * 1e6 > Math.max(capWorkbook, capNote) ? "text-red-600" : "text-zinc-500"}>
          {bond * 1e6 > Math.max(capWorkbook, capNote) ? "above both borrowing limits: needs equity or partner money" : "within borrowing capacity"}; the lead lender must consent to new debt.
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => ask(`${summary}\n\nAs CFO, give us the corporate finance plan to get to $50B - be aggressive but legitimate and audit-proof: which business models and innovation strategies to add, how to turn our analyst ratings (we hold ${p.analysts[3]} Sell), how much cash to hold vs. invest (cash only counts up to portfolio + analysts), bonds or other financing within our borrowing capacity and lender covenants, buybacks vs. issuance, and the order of moves by year. Rank the moves by $ of market cap per $ spent.`)}
          className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Corporate finance magic: plan this path</button>
        <button onClick={() => makeTasks(`The team chose this path to $50B: ${summary}`)} className="rounded-md px-3 py-1.5 text-sm font-semibold border border-green-700 text-green-800 dark:text-green-300">📋 Turn this path into tasks</button>
      </div>
      <p className="text-xs text-zinc-500">Market cap here follows the workbook formula exactly; the game&rsquo;s real valuation is greyer — capital markets reward a convincing story up to a point.</p>
    </div>
  );
}

const STATUS = ["idea", "pitching", "locked"] as const;
const STATUS_STYLE: Record<string, string> = { idea: "border-zinc-300 dark:border-zinc-700", pitching: "border-amber-500", locked: "border-green-700 bg-green-50 dark:bg-green-950/30" };

// Every year from now to the goal: what the workbook says we earn and can borrow, and which capital
// strategies land when. Planning = giving each strategy a year and a status; the projection follows.
function YearPlan({ o }: { o: Overview }) {
  const { year: now, plan: p, goal } = o;
  const [busy, setBusy] = useState(0);
  const strats = o.capital.filter((s) => s.status !== "rejected");
  const today = { ...p.units, analysts: [...p.analysts, 0, 0, 0, 0, 0].slice(0, 5), cash: p.cashForCap, shares: p.shares, year: now };
  const proj = project(today, strats, goal.year);
  const years = proj.map((x) => x.year);
  const capWorkbook = p.bmProfit10y / 2;
  const patch = async (id: number, body: object) => {
    setBusy(id);
    await fetch("/api/financing", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    refreshOverview();
    setBusy(0);
  };
  const Chip = ({ s }: { s: (typeof strats)[number] }) => (
    <li className={`rounded-md border p-1.5 text-xs space-y-1 ${STATUS_STYLE[s.status] ?? ""} ${busy === s.id ? "opacity-50" : ""}`}>
      <p className="font-semibold leading-snug">{s.name}</p>
      {s.effect && <p className="text-zinc-500">{[s.effect.cash_m && `cash ${capM(s.effect.cash_m * (s.scale ?? 1))}`, (s.effect.core || s.effect.growth || s.effect.explore) && `BMs +${s.effect.core}/${s.effect.growth}/${s.effect.explore}`, s.effect.analysts?.some(Boolean) && "ratings move", s.effect.shares_m && `${s.effect.shares_m > 0 ? "+" : ""}${s.effect.shares_m}M shares`].filter(Boolean).join(" · ") || "no lever effect"}</p>}
      <span className="flex gap-1">
        <select value={s.year ?? ""} onChange={(e) => patch(s.id, { year: e.target.value ? +e.target.value : null })} aria-label={`Year for ${s.name}`} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent">
          <option value="">No year</option>
          {years.map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <select value={s.status} onChange={(e) => patch(s.id, { status: e.target.value })} aria-label={`Status of ${s.name}`} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent">
          {STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </span>
    </li>
  );
  const row = (label: string, f: (y: number, k: number) => React.ReactNode, note?: string) => (
    <tr className="border-t border-zinc-200 dark:border-zinc-800 align-top">
      <th scope="row" className="text-left font-normal text-zinc-600 dark:text-zinc-400 py-1.5 pr-3">{label}{note && <span className="block text-xs text-zinc-500">{note}</span>}</th>
      {years.map((y, k) => <td key={y} className="py-1.5 px-2 tabular-nums">{f(y, k)}</td>)}
    </tr>
  );
  const fin = (y: number) => p.years.find((r) => r.year === y);
  const unplanned = strats.filter((s) => !s.year || s.year < now || s.year > goal.year);
  return (
    <section className="game-card space-y-3" aria-label="Year-by-year plan">
      <div>
        <h3 className="text-lg">Year-by-year plan · Year {now} → Year {goal.year}</h3>
        <p className="text-xs text-zinc-500">Give each capital strategy a year and a status. Locked ones drive the market-cap projection here and in &ldquo;${goal.cap / 1000}B by Year {goal.year}&rdquo;. Revenue and expenses are what the workbook holds for each year.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead><tr><th className="sr-only">Measure</th>{years.map((y) => <th key={y} scope="col" className="text-left eyebrow text-zinc-500 px-2 pb-1">Year {y}{y === now ? " · now" : ""}</th>)}</tr></thead>
          <tbody>
            {row("Revenue − expenses", (y) => { const r = fin(y); return r ? <span className={r.revenue - r.expenses < 0 ? "text-red-600" : ""}>{money(r.revenue - r.expenses)}<span className="block text-xs text-zinc-500">{money(r.revenue)} − {money(r.expenses)}</span></span> : "—"; })}
            {row("Borrowing capacity", (y) => { const r = fin(y); return <>{money(capWorkbook)}<span className="block text-xs text-zinc-500">note rule {r ? money((10 * r.revenue) / 2) : "—"}</span></>; }, "workbook: 10-yr BM profit ÷ 2 (L227)")}
            {row("Market cap · locked plan", (_, k) => <b className={proj[k].total < 0 ? "text-red-600" : ""}>{capM(proj[k].total)}</b>)}
            {row("Cash raised (locked)", (y) => money(strats.filter((s) => s.status === "locked" && s.year === y && s.effect).reduce((t, s) => t + s.effect!.cash_m * (s.scale ?? 1), 0) * 1e6))}
            {row("Extra interest / yr", (_, k) => money(proj[k].interest_m * 1e6), "cumulative, locked")}
            {row("Strategies landing", (y) => {
              const here = strats.filter((s) => s.year === y), ideas = here.filter((s) => s.status === "idea");
              return (
                <div className="space-y-1.5 min-w-40">
                  <ul className="space-y-1.5">{here.filter((s) => s.status !== "idea").map((s) => <Chip key={s.id} s={s} />)}</ul>
                  {ideas.length > 0 && (
                    <details><summary className="cursor-pointer text-xs font-semibold">+{ideas.length} idea{ideas.length === 1 ? "" : "s"}</summary>
                      <ul className="space-y-1.5 mt-1.5">{ideas.map((s) => <Chip key={s.id} s={s} />)}</ul>
                    </details>
                  )}
                </div>
              );
            }, "pitching & locked; ideas folded")}
          </tbody>
        </table>
      </div>
      {unplanned.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{unplanned.length} strateg{unplanned.length === 1 ? "y has" : "ies have"} no year in this window: give them one</summary>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{unplanned.map((s) => <Chip key={s.id} s={s} />)}</ul>
        </details>
      )}
    </section>
  );
}
