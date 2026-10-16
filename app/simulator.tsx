"use client";

import { useEffect, useState } from "react";
import type { Strat } from "@/lib/capital";
import { ANALYST_NAMES } from "@/lib/marketcap";
import { emptyKnobs, explain, SEGS, simulate, type Base, type Knobs, type Seg, type SimCard, type SimYear } from "@/lib/simulate";
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
              {r.events.map((e, j) => (
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
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
              <span>{c.title} <span className="text-xs text-zinc-500">· {c.type} · from Year {c.start_year} · {c.status}</span></span>
            </label>
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
