"use client";

import { useEffect, useState } from "react";
import type { Strat } from "@/lib/capital";
import { ANALYST_NAMES } from "@/lib/marketcap";
import { emptyKnobs, explain, SEGS, simulate, zeros, type Base, type Knobs, type Seg, type SimCard, type SimYear } from "@/lib/simulate";
import { CardActions } from "./card-actions";
import { useOverview } from "./overview-store";

export type SimData = Base & { avgCapex: Record<Seg, number> };
type O = { year: number; goal: { year: number; cap: number }; sim: SimData; capital: Strat[] };
type CardLite = { id: number; title: string; type: string; status: string; capex: number; start_year: number; revenue: number[]; cost: number[] };

const capM = (m: number, sign = false) => {
  const a = Math.abs(m), s = m < 0 ? "−" : sign ? "+" : "";
  return a < 0.5 ? "$0" : `${s}$${a >= 1000 ? `${(a / 1000).toFixed(2)}B` : `${a.toFixed(0)}M`}`;
};
const money = (n: number, sign = false) => capM(n / 1e6, sign);
const SEG_LABEL: Record<Seg, string> = { core: "Core", growth: "Growth", explore: "Explore" };
const SEG_COLOR: Record<Seg, string> = { core: "var(--core)", growth: "var(--growth)", explore: "var(--explore)" };

// Defaults come from the workbook: a new BM earns what an average active BM of its type earns this year.
function defaults(s: SimData, toYear: number): Knobs {
  const k = emptyKnobs(toYear), i = s.now - 1;
  SEGS.forEach((seg, j) => {
    const n = s.units[j]?.[i] || 0;
    k.profile[seg] = { revenue: n ? Math.round((s.segRev[j][i] ?? 0) / n / 1e5) / 10 : 0, cost: n ? Math.round((s.segCost[j][i] ?? 0) / n / 1e5) / 10 : 0, capex: Math.round((s.avgCapex[seg] ?? 0) / 1e5) / 10 };
  });
  return k;
}

function Num({ value, set, step = 1, w = "w-16", label }: { value: number; set: (n: number) => void; step?: number; w?: string; label: string }) {
  return <input type="number" step={step} value={value} aria-label={label} onChange={(e) => set(Number(e.target.value) || 0)}
    className={`${w} rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5 text-right tabular-nums text-sm`} />;
}

// "Card starts: Space BM 3 (Year 2)" x5 -> one "Card starts: Space BM ×5" with the effects summed.
const group = (events: SimYear["events"]) => {
  const out: SimYear["events"] = [];
  for (const e of events) {
    const key = e.label.replace(/ \d+ \(Year \d+\)$/, "");
    const hit = key !== e.label ? out.find((x) => x.label.startsWith(`${key} ×`) || x.label === key) : undefined;
    if (!hit) { out.push({ ...e, label: key === e.label ? e.label : `${key} ×1` }); continue; }
    hit.label = `${key} ×${Number(hit.label.split("×")[1] ?? 1) + 1}`;
    hit.mc += e.mc; hit.cash += e.cash;
  }
  return out;
};

// The result view, shared by the simulator and the card impact timelines.
export function SimTimeline({ rows, compact = false }: { rows: SimYear[]; compact?: boolean }) {
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.mc.total), Math.abs(r.baseMc.total)]));
  const notes = explain(rows);
  return (
    <div className="space-y-3">
      <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(9rem, 1fr))` }} aria-label="Timeline">
        {rows.map((r) => (
          <li key={r.year} className="space-y-1.5 min-w-0">
            <p className="eyebrow text-zinc-500">Year {r.year}</p>
            <div className="h-24 flex items-end gap-1" aria-hidden>
              <span className="w-1/3 rounded-t bg-zinc-300 dark:bg-zinc-700" style={{ height: `${(Math.max(0, r.baseMc.total) / max) * 100}%` }} title="Workbook" />
              <span className="w-1/3 rounded-t bg-[var(--gold)]" style={{ height: `${(Math.max(0, r.mc.total) / max) * 100}%` }} title="Simulated" />
            </div>
            <p className="font-display text-xl tabular-nums leading-none">{capM(r.mc.total)}</p>
            <p className={`text-sm font-semibold tabular-nums ${r.uplift > 0 ? "text-green-700 dark:text-green-400" : r.uplift < 0 ? "text-red-600" : "text-zinc-500"}`}>
              {r.uplift ? `${r.uplift > 0 ? "▲" : "▼"} ${capM(r.uplift, true)} vs workbook` : "= workbook"}
            </p>
            {!compact && <p className="text-xs text-zinc-500 tabular-nums">${r.price.toFixed(2)}/sh · net {money(r.net)} · cash {money(r.cash)} · debt {money(r.debt)} / can borrow {money(r.borrowAbility)}</p>}
            <ul className="space-y-1">
              {group(r.events).map((e, j) => (
                <li key={j} className="text-xs rounded border border-zinc-200 dark:border-zinc-800 px-1.5 py-1">
                  {e.label}
                  {(e.mc !== 0 || e.cash !== 0) && <span className="block text-zinc-500 tabular-nums">{e.mc ? `market cap ${capM(e.mc, true)}` : ""}{e.mc && e.cash ? " · " : ""}{e.cash ? `cash ${money(e.cash, true)}` : ""}</span>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1 text-sm">
        <p className="eyebrow text-zinc-500">What happened</p>
        {notes.map((n) => (
          <p key={n.year}><b>Year {n.year}:</b> {n.text}.{n.warn.map((w) => <span key={w} className="block text-red-600 text-xs">⚠ {w}</span>)}</p>
        ))}
      </div>
    </div>
  );
}

// Market-cap timeline for one card on top of the workbook (Cards tab).
export function CardTimeline({ card, analystMove, version }: { card: CardLite; analystMove?: { from: number; to: number }; version: number }) {
  const o = useOverview<O>(version);
  const s = o?.data?.sim;
  if (!s) return <p className="text-xs text-zinc-500">Loading…</p>;
  const k = emptyKnobs(Math.max(s.now + 2, o!.data.goal.year));
  const seg = card.type.toLowerCase() as Seg;
  if (SEGS.includes(seg)) k.cards = [{ label: card.title, type: seg, startYear: Math.max(s.now, card.start_year), revenue: card.revenue, cost: card.cost, capex: card.capex }];
  if (analystMove) {
    const d = [0, 0, 0, 0, 0];
    if (analystMove.from >= 0) d[analystMove.from] -= 1;
    if (analystMove.to >= 0) d[analystMove.to] += 1;
    k.analystMoves[s.now - 1] = d;
  }
  return <SimTimeline rows={simulate(s, k)} compact />;
}

export function Simulator({ version, ask }: { version: number; ask: (t: string) => void }) {
  const o = useOverview<O>(version);
  const [cards, setCards] = useState<CardLite[] | null>(null);
  const [k, setK] = useState<Knobs | null>(null);
  const [strats, setStrats] = useState<"none" | "locked" | "pitching">("none");
  const [picked, setPicked] = useState<number[]>([]);
  const [run, setRun] = useState<{ rows: SimYear[]; summary: string } | null>(null);
  useEffect(() => void fetch("/api/cards").then((r) => r.json()).then((x) => setCards(Array.isArray(x) ? x : []), () => setCards([])), [version]);
  const s = o?.data?.sim;
  if (!s || !o) return <div className="game-card h-48 animate-pulse" aria-busy="true" />;
  const goalYear = o.data.goal.year;
  const knobs = k ?? defaults(s, Math.max(goalYear, s.now + 2));
  const years = Array.from({ length: knobs.toYear - s.now + 1 }, (_, j) => s.now + j);
  const upd = (f: (x: Knobs) => void) => { const n = structuredClone(knobs); f(n); setK(n); };
  const perYear = (label: string, get: (x: Knobs) => number[], step = 1, unit = "") => (
    <tr key={label}>
      <th scope="row" className="text-left font-normal pr-2 py-0.5 whitespace-nowrap">{label}{unit && <span className="text-xs text-zinc-500"> {unit}</span>}</th>
      {years.map((y) => <td key={y} className="px-0.5"><Num label={`${label} Year ${y}`} step={step} value={get(knobs)[y - 1] ?? 0} set={(n) => upd((x) => (get(x)[y - 1] = n))} /></td>)}
    </tr>
  );
  const bmCards = (cards ?? []).filter((c) => ["Core", "Growth", "Explore"].includes(c.type) && c.status !== "booked" && c.status !== "passed");

  function go() {
    const kk = structuredClone(knobs);
    kk.cards = bmCards.filter((c) => picked.includes(c.id)).map((c): SimCard => ({ label: c.title, type: c.type.toLowerCase() as Seg, startYear: Math.max(s!.now, c.start_year), revenue: c.revenue, cost: c.cost, capex: c.capex }));
    kk.effects = strats === "none" ? [] : o!.data.capital.filter((x) => x.effect && (x.status === "locked" || (strats === "pitching" && x.status === "pitching")))
      .map((x) => ({ year: x.year ?? s!.now, label: x.name, effect: x.effect!, scale: x.scale ?? 1 }));
    const rows = simulate(s!, kk);
    const last = rows[rows.length - 1];
    const summary = `Simulation Year ${s!.now}-${kk.toYear}. Knobs: organic growth core ${kk.growth.core}% growth ${kk.growth.growth}% explore ${kk.growth.explore}%, cost inflation ${kk.costInflation}%, ` +
      `new BMs ${SEGS.map((g) => `${g} [${kk.newBMs[g].slice(s!.now - 1, kk.toYear).join(",")}]`).join(" ")}, BM profile ${SEGS.map((g) => `${g} rev ${kk.profile[g].revenue}M cost ${kk.profile[g].cost}M capex ${kk.profile[g].capex}M`).join("; ")}, ` +
      `borrow [${kk.borrow.slice(s!.now - 1, kk.toYear).join(",")}]M at ${kk.rate}%, equity [${kk.equity.slice(s!.now - 1, kk.toYear).join(",")}]M at $${kk.issuePrice}, buyback [${kk.buyback.slice(s!.now - 1, kk.toYear).join(",")}]M, payout ${kk.payout}%, ` +
      `analyst moves ${kk.analystMoves.slice(s!.now - 1, kk.toYear).map((m) => `[${m.join(",")}]`).join(" ")} (Outperform,Buy,Hold,Sell,Crash), shocks [${kk.shocks.slice(s!.now - 1, kk.toYear).join(",")}]M, ` +
      `cards: ${kk.cards.map((c) => c.label).join("; ") || "none"}, strategies: ${strats}.\nResult: ${rows.map((r) => `Y${r.year} market cap ${capM(r.mc.total)} (${capM(r.uplift, true)} vs workbook), net ${money(r.net)}, cash ${money(r.cash)}, debt ${money(r.debt)} vs ability ${money(r.borrowAbility)}`).join("; ")}. Final ${capM(last.mc.total)} vs goal ${capM(o!.data.goal.cap)}.`;
    setRun({ rows, summary });
  }

  return (
    <section className="game-card space-y-4" aria-label="Simulator">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl">Simulator · play it forward</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Starts from the workbook&rsquo;s own numbers for every year; each knob is added on top. Nothing here is saved to the workbook.</p>
        </div>
        <label className="text-sm flex items-center gap-1.5">Play to
          <select value={knobs.toYear} onChange={(e) => upd((x) => (x.toYear = +e.target.value))} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5">
            {Array.from({ length: 10 - s.now + 1 }, (_, j) => s.now + j).filter((y) => y > s.now).map((y) => <option key={y} value={y}>Year {y}{y === goalYear ? " (goal)" : ""}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="font-display uppercase tracking-wide">Growth &amp; costs</legend>
          {SEGS.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              <span className="w-44">{SEG_LABEL[g]} BMs we have: growth</span>
              <input type="range" min={-30} max={60} value={knobs.growth[g]} onChange={(e) => upd((x) => (x.growth[g] = +e.target.value))} className="flex-1" style={{ accentColor: SEG_COLOR[g] }} />
              <span className="w-14 text-right tabular-nums">{knobs.growth[g]}%/yr</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <span className="w-44">Cost base inflation</span>
            <input type="range" min={-20} max={30} value={knobs.costInflation} onChange={(e) => upd((x) => (x.costInflation = +e.target.value))} className="flex-1 accent-zinc-500" />
            <span className="w-14 text-right tabular-nums">{knobs.costInflation}%/yr</span>
          </label>
          <label className="flex items-center gap-2 text-sm"><span className="w-44">Tax rate</span><Num label="Tax rate" value={knobs.tax} set={(n) => upd((x) => (x.tax = n))} /> %</label>
          <label className="flex items-center gap-2 text-sm"><span className="w-44">Dividend payout</span><Num label="Payout" value={knobs.payout} set={(n) => upd((x) => (x.payout = n))} /> % of profit</label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="font-display uppercase tracking-wide">What a new business model brings ($M)</legend>
          <table className="text-sm"><thead><tr><th /><th className="eyebrow text-zinc-500 px-1">Revenue/yr</th><th className="eyebrow text-zinc-500 px-1">Cost/yr</th><th className="eyebrow text-zinc-500 px-1">Cap.ex once</th></tr></thead>
            <tbody>{SEGS.map((g) => (
              <tr key={g}><th scope="row" className="text-left font-normal pr-2">{SEG_LABEL[g]}</th>
                {(["revenue", "cost", "capex"] as const).map((f) => <td key={f} className="px-1"><Num label={`${g} ${f}`} step={0.5} value={knobs.profile[g][f]} set={(n) => upd((x) => (x.profile[g][f] = n))} /></td>)}
              </tr>
            ))}</tbody>
          </table>
          <p className="text-xs text-zinc-500">Defaults: what an average active BM of that type earns in the workbook this year, and the average cap.ex on our cards. Assumptions, so tune them.</p>
        </fieldset>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead><tr><th />{years.map((y) => <th key={y} scope="col" className="eyebrow text-zinc-500 px-1 text-right">Year {y}</th>)}</tr></thead>
          <tbody>
            <tr><th colSpan={years.length + 1} className="text-left font-display uppercase tracking-wide pt-2">New business models (count)</th></tr>
            {SEGS.map((g) => perYear(`+ ${SEG_LABEL[g]}`, (x) => x.newBMs[g]))}
            <tr><th colSpan={years.length + 1} className="text-left font-display uppercase tracking-wide pt-2">Analyst ratings (change in cards held)</th></tr>
            {ANALYST_NAMES.map((n, r) => (
              <tr key={n}>
                <th scope="row" className="text-left font-normal pr-2">{n}</th>
                {years.map((y) => <td key={y} className="px-0.5"><Num label={`${n} Year ${y}`} value={knobs.analystMoves[y - 1][r]} set={(v) => upd((x) => (x.analystMoves[y - 1][r] = v))} /></td>)}
              </tr>
            ))}
            <tr><th colSpan={years.length + 1} className="text-left font-display uppercase tracking-wide pt-2">Financing ($M)</th></tr>
            {perYear("Borrow", (x) => x.borrow, 5)}
            {perYear("Issue shares", (x) => x.equity, 5)}
            {perYear("Buy back shares", (x) => x.buyback, 5)}
            <tr><th colSpan={years.length + 1} className="text-left font-display uppercase tracking-wide pt-2">Operations &amp; risk</th></tr>
            {perYear("Extra dice rolls", (x) => x.rolls, 1, "$100k each")}
            {perYear("One-time hit (+) / windfall (−)", (x) => x.shocks, 5, "$M")}
          </tbody>
        </table>
        <p className="text-sm mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5">Interest on new debt <Num label="Interest rate" step={0.5} value={knobs.rate} set={(n) => upd((x) => (x.rate = n))} /> %</label>
          <label className="flex items-center gap-1.5">Share price for issues / buybacks $ <Num label="Issue price" step={0.1} value={knobs.issuePrice} set={(n) => upd((x) => (x.issuePrice = Math.max(0.01, n)))} /></label>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="space-y-1 text-sm">
          <legend className="font-display uppercase tracking-wide">Cards we haven&rsquo;t booked yet</legend>
          {bmCards.length ? bmCards.map((c) => (
            <div key={c.id} className="space-y-0.5">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                <span>{c.title} <span className="text-xs text-zinc-500">· {c.type} · from Year {c.start_year}</span></span>
              </label>
              <div className="pl-6"><CardActions card={c} ask={ask} /></div>
            </div>
          )) : <p className="text-zinc-500">{cards ? "No unbooked business-model cards." : "Loading cards…"}</p>}
        </fieldset>
        <fieldset className="space-y-1 text-sm">
          <legend className="font-display uppercase tracking-wide">Capital strategies</legend>
          {([["none", "Leave them out"], ["locked", "Include locked ones"], ["pitching", "Include locked and pitching"]] as const).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2"><input type="radio" name="sim-strats" checked={strats === v} onChange={() => setStrats(v)} />{l}</label>
          ))}
          <p className="text-xs text-zinc-500">Each lands in its planned year (Capital → Lever planner) with its sized effect.</p>
        </fieldset>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={go} className="rounded-md px-4 py-2 font-semibold bg-[var(--gold)] text-[var(--ink)]">▶ Run simulation</button>
        <button onClick={() => (setK(null), setPicked([]), setStrats("none"), setRun(null))} className="rounded-md px-3 py-2 text-sm border border-zinc-400">Reset knobs</button>
        {run && <button onClick={() => ask(`${run.summary}\n\nExplain this simulation for the team in plain words: what drives the change each year, what is fragile, which knob matters most for reaching $${o!.data.goal.cap / 1000}B by Year ${goalYear}, and which assumptions we must confirm with the facilitator.`)}
          className="rounded-md px-3 py-2 text-sm font-semibold bg-amber-600 text-white">✨ Ask the copilot to explain it</button>}
      </div>

      {run && (
        <div className="space-y-2" aria-live="polite">
          <h3 className="text-lg">Result · gold = simulated, grey = workbook</h3>
          <SimTimeline rows={run.rows} />
        </div>
      )}
    </section>
  );
}

// The primary what-if: sell the car + Dragon Nexus business to an acquirer for $50-60B, pay off the
// debt, then go big in space and fintech (new Explore BMs). Dragon Nexus stays the stated strategy.
export function ExitScenario({ version, ask }: { version: number; ask: (t: string) => void }) {
  const o = useOverview<O>(version);
  const [cfg, setCfg] = useState<{ year: number; toYear: number; priceB: number; feesPct: number; repayM: number; keep: number; sell: Record<Seg, boolean>; space: number[]; fintech: number[]; econ: { revenue: number; cost: number; capex: number }; sellToBuy: number } | null>(null);
  const [run, setRun] = useState<SimYear[] | null>(null);
  const [msg, setMsg] = useState("");
  const s = o?.data?.sim;
  if (!s || !o) return <div className="game-card h-40 animate-pulse" aria-busy="true" />;
  const goal = o.data.goal;
  const c = cfg ?? {
    year: Math.min(10, Math.max(s.now + 1, Math.min(goal.year, s.now + 1))), toYear: Math.max(goal.year, s.now + 2), priceB: 55, feesPct: 0,
    repayM: Math.round(s.debt / 1e6) + 900, keep: 100, sell: { core: true, growth: true, explore: false },
    space: zeros(), fintech: zeros(), econ: defaults(s, goal.year).profile.explore, sellToBuy: 0,
  };
  const set = (p: Partial<typeof c>) => setCfg({ ...c, ...p });
  const yrs = Array.from({ length: c.toYear - c.year + 1 }, (_, j) => c.year + j);
  const knobs = (): Knobs => {
    const k = emptyKnobs(c.toYear);
    k.exit = { year: c.year, priceB: c.priceB, feesPct: c.feesPct, repayM: c.repayM, costBaseKeptPct: c.keep, sell: c.sell };
    const bm = (label: string, n: number[]) => n.flatMap((cnt, i) => Array.from({ length: cnt }, (_, x): SimCard => ({ label: `${label} BM ${x + 1} (Year ${i + 1})`, type: "explore", startYear: i + 1, revenue: Array.from({ length: 10 }, (_, y) => (y + 1 >= i + 1 ? c.econ.revenue * 1e6 : 0)), cost: Array.from({ length: 10 }, (_, y) => (y + 1 >= i + 1 ? c.econ.cost * 1e6 : 0)), capex: c.econ.capex * 1e6 })));
    k.cards = [...bm("Space", c.space), ...bm("Fintech", c.fintech)];
    if (c.sellToBuy) k.analystMoves[c.year - 1] = [0, c.sellToBuy, 0, -c.sellToBuy, 0];
    return k;
  };
  const go = () => setRun(simulate(s, knobs()));
  const last = run?.[run.length - 1];
  // Explore BMs (in total, after the sale) for business models + analysts to reach half the goal, so cash doubles it.
  const needExplore = last ? Math.max(0, Math.ceil((goal.cap / 2 - last.mc.analysts) / 1000)) : null;
  const sold = SEGS.filter((g) => c.sell[g]).map((g) => SEG_LABEL[g]).join(" + ");
  const totalSpace = c.space.reduce((a, b) => a + b, 0), totalFin = c.fintech.reduce((a, b) => a + b, 0);
  const summary = () => `Primary exit scenario: sell the ${sold} business (cars, Dragon Nexus, network effect, customer UX) to an acquirer in Year ${c.year} for $${c.priceB}B, fees ${c.feesPct}%, repay $${c.repayM}M of debt, keep ${c.keep}% of the cost base; then go big in space (${totalSpace} Explore BMs) and fintech (${totalFin} Explore BMs) at revenue $${c.econ.revenue}M, cost $${c.econ.cost}M, capex $${c.econ.capex}M per BM per year; ${c.sellToBuy} Sell -> Buy flips at the sale. Result: ${(run ?? []).map((r) => `Y${r.year} market cap ${capM(r.mc.total)} (cash ${money(r.cash)}, cash counted ${capM(r.mc.cashTerm)}, BMs ${capM(r.mc.portfolio)}, analysts ${capM(r.mc.analysts)})`).join("; ")}.`;
  async function addToPlan() {
    const at = s!.units.map((u) => u[c.year - 1] ?? 0);
    const r = await fetch("/api/capital/add", { method: "POST", body: JSON.stringify({
      name: `Primary exit: sell the ${sold} business for $${c.priceB}B, repay debt, go big in space and fintech`,
      category: "Exit / M&A", year: c.year, cost: `${c.feesPct}% fees`,
      how_it_works: `An acquirer buys the operating business (vehicles, Dragon Nexus, the network effect and the customer UX our loyal base loves) for $${c.priceB}B in Year ${c.year}. We repay $${c.repayM}M of debt, then redeploy into space (${totalSpace} Explore BMs) and fintech (${totalFin} Explore BMs).`,
      effect: { cash_m: c.priceB * 1000 * (1 - c.feesPct / 100) - c.repayM, core: c.sell.core ? -at[0] : 0, growth: c.sell.growth ? -at[1] : 0, explore: totalSpace + totalFin - (c.sell.explore ? at[2] : 0), analysts: [0, c.sellToBuy, 0, -c.sellToBuy, 0], shares_m: 0, interest_m: -(c.repayM * 0.06) },
      pitch_to: "The acquirer, the lead lender (consent to the sale and repayment), our board and shareholders, the facilitators (confirm the game allows it)",
      fit: "Turns the operating business into cash at a $50B+ valuation and funds the space and fintech push; Dragon Nexus remains the stated strategy until a buyer commits.",
      risks: "Cash only counts for market cap up to business models + analysts; buyer and price are [placeholders]; lender consent; whether the game allows a third-party sale (BOOM cards only buy models back at 3-4M).",
      legal_basis: "A disclosed sale of a business to a third party with shareholder and lender approval.", red_lines: "No undisclosed side terms; no claiming a price before a signed offer.",
    }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setMsg(r.error ? `⚠ ${r.error}` : "✓ Added to the capital plan (Capital › Plan & strategies). Set it to pitching or locked to put it in the projections.");
  }
  const numIn = (v: number, f: (n: number) => void, label: string, step = 1, w = "w-20") => <Num label={label} value={v} step={step} w={w} set={f} />;
  return (
    <section className="rounded-xl border-2 border-[var(--gold)] bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900 p-4 sm:p-5 space-y-4" aria-label="Exit scenario">
      <div>
        <p className="eyebrow text-amber-700 dark:text-amber-300">Primary what-if scenario</p>
        <h2 className="text-2xl">Sell the business for ${c.priceB}B, clear the debt, go big in space &amp; fintech</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">An acquirer buys our cars, Dragon Nexus, the network effect and the UX our loyal customers love. We keep the cash and the listing, and rebuild around space and fintech. Dragon Nexus stays our stated strategy. Confirm with the facilitators that the game allows a third-party sale.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 text-sm">
        <fieldset className="space-y-2">
          <legend className="font-display uppercase tracking-wide">The sale</legend>
          <label className="flex items-center gap-2">Price <input type="range" min={50} max={60} step={0.5} value={c.priceB} onChange={(e) => set({ priceB: +e.target.value })} className="flex-1 accent-amber-600" /><b className="w-14 text-right tabular-nums">${c.priceB}B</b></label>
          <label className="flex items-center gap-2">In year
            <select value={c.year} onChange={(e) => set({ year: +e.target.value, toYear: Math.max(c.toYear, +e.target.value) })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
              {Array.from({ length: 10 - s.now + 1 }, (_, j) => s.now + j).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
            · play to <select value={c.toYear} onChange={(e) => set({ toYear: +e.target.value })} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1">
              {Array.from({ length: 10 - c.year + 1 }, (_, j) => c.year + j).map((y) => <option key={y} value={y}>Year {y}{y === goal.year ? " (goal)" : ""}</option>)}
            </select>
          </label>
          <p className="flex flex-wrap gap-3">{SEGS.map((g) => <label key={g} className="flex items-center gap-1"><input type="checkbox" checked={c.sell[g]} onChange={(e) => set({ sell: { ...c.sell, [g]: e.target.checked } })} />sell {SEG_LABEL[g]}</label>)}</p>
          <label className="flex items-center gap-2">Debt repaid ($M) {numIn(c.repayM, (n) => set({ repayM: n }), "Debt repaid", 25)}<span className="text-xs text-zinc-500">default: workbook debt + the case&rsquo;s $900M lead-lender loan</span></label>
          <label className="flex items-center gap-2">Deal fees % {numIn(c.feesPct, (n) => set({ feesPct: n }), "Deal fees", 0.5, "w-16")}<span className="text-xs text-zinc-500">your assumption</span></label>
          <label className="flex items-center gap-2">Cost base we keep % {numIn(c.keep, (n) => set({ keep: n }), "Cost base kept", 5, "w-16")}<span className="text-xs text-zinc-500">the buyer takes the rest</span></label>
          <label className="flex items-center gap-2">Sell → Buy rating flips at the sale {numIn(c.sellToBuy, (n) => set({ sellToBuy: n }), "Sell to Buy flips", 1, "w-16")}</label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="font-display uppercase tracking-wide">Go big: new Explore business models</legend>
          <table><thead><tr><th />{yrs.map((y) => <th key={y} className="eyebrow text-zinc-500 px-1">Year {y}</th>)}</tr></thead>
            <tbody>
              {([["Space", "space"], ["Fintech", "fintech"]] as const).map(([l, key]) => (
                <tr key={key}><th scope="row" className="text-left font-normal pr-2">{l}</th>
                  {yrs.map((y) => <td key={y} className="px-0.5">{numIn(c[key][y - 1], (n) => set({ [key]: c[key].map((v, i) => (i === y - 1 ? n : v)) } as Partial<typeof c>), `${l} BMs Year ${y}`, 1, "w-16")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="flex flex-wrap gap-3 items-center">Per new BM ($M):
            {(["revenue", "cost", "capex"] as const).map((f) => <label key={f} className="flex items-center gap-1">{f === "capex" ? "cap.ex once" : `${f}/yr`} {numIn(c.econ[f], (n) => set({ econ: { ...c.econ, [f]: n } }), `New BM ${f}`, 0.5, "w-16")}</label>)}
          </p>
          <p className="text-xs text-zinc-500">Each Explore BM adds $1B of market cap in the workbook formula. Economics default to today&rsquo;s average Explore BM; tune them.</p>
        </fieldset>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={go} className="rounded-md px-4 py-2 font-semibold bg-[var(--gold)] text-[var(--ink)]">▶ Run the exit scenario</button>
        {run && <button onClick={addToPlan} className="rounded-md px-3 py-2 text-sm font-semibold bg-green-700 text-white">＋ Add to the capital plan</button>}
        {run && <button onClick={async () => {
          const comps = await fetch("/api/comps").then((r) => r.json()).catch(() => []);
          ask(`${summary()}\n\nComparable valuations we hold: ${(Array.isArray(comps) ? comps : []).map((x: { company: string; valuation_usd_b: number | null; basis: string; as_of: string }) => `${x.company} ${x.valuation_usd_b === null ? "n/a" : `$${x.valuation_usd_b}B`} (${x.basis}, ${x.as_of})`).join("; ") || "none yet"}.\n\nWrite the exit-path brief for our primary scenario: who could buy the car + Dragon Nexus business and why (types of buyer, [placeholders] for names we haven't confirmed), how to justify $50-60B, the order of moves (lender consent, sale, debt repayment, space and fintech build), what the simulation says about market cap after the sale (cash only counts up to business models + analysts) and how many space/fintech business models and rating flips it takes to reach $${goal.cap / 1000}B, and the game-rule questions to confirm with the facilitators.`);
        }} className="rounded-md px-3 py-2 text-sm font-semibold bg-amber-600 text-white">✨ Write the exit-path brief</button>}
      </div>
      {msg && <p className={`text-sm font-semibold ${msg.startsWith("⚠") ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{msg}</p>}
      {run && last && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-sm"><b>After the sale, Year {last.year}:</b> market cap {capM(last.mc.total)} vs the ${goal.cap / 1000}B goal. To get there, business models + analyst ratings must reach {capM(goal.cap / 2)} so cash can double it: about <b>{needExplore} Explore BMs</b> in total with today&rsquo;s ratings (we&rsquo;d hold {last.levers.explore}).</p>
          <SimTimeline rows={run} />
        </div>
      )}
    </section>
  );
}
