"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card, FinancingIdea, Strategy } from "@/lib/db";
import { n2col, unitsCol } from "@/lib/impact";
import { HorizonKnob } from "./knob";
import { Markdown } from "./markdown";
import { refreshOverview } from "./overview-store";

type Year = {
  year: number; completed: string; costBase: number; capex: number; oneTime: number; revenue: number; bmCost: number;
  bmProfit: number; ebitda: number; tax: number; interest: number; depreciation: number; net: number; cash: number;
  cap: number; shares: number; eps: number; dividend: number; dps: number; price: number;
  capCash: number; capBM: number; capAnalyst: number;
};
type Audit = { verdict: string; summary: string; issues: { cell: string; severity: string; problem: string; fix?: string }[] };
type Option = {
  rank: number; name: string; summary: string; funding_need: string; effect: string; risks: string; board_line: string;
  picks: { idea_id: number | null; name: string; amount: string; why: string }[];
  levers: { cell: string; value: number }[];
};
type Turn = { intent: string; read?: string; options?: Option[]; error?: string };

const input = "rounded-md border border-zinc-300 dark:border-zinc-700 p-1.5 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors";
const $ = (n: number) => (Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : n.toFixed(0));
const capM = (m: number) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${m.toFixed(0)}M`);

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(d?.error ?? r.statusText);
  return d;
}

// Rows of the finance table: label, field, formatter.
const ROWS: [string, keyof Year, (n: number) => string][] = [
  ["Revenue (BMs)", "revenue", $], ["One-time revenue", "oneTime", $], ["BM cost", "bmCost", $], ["Cost base", "costBase", $],
  ["EBITDA", "ebitda", $], ["Interest", "interest", $], ["Depreciation", "depreciation", $], ["Tax (21%)", "tax", $],
  ["Net profit", "net", $], ["Cash balance", "cash", $], ["Cap.ex", "capex", $], ["Dividend", "dividend", $],
  ["Market cap", "cap", capM], ["Share price", "price", (n) => `$${n.toFixed(2)}`], ["EPS", "eps", (n) => `$${n.toFixed(3)}`],
];

// The what-if levers for a year: workbook input cells.
function levers(year: number) {
  const u = unitsCol(year), r = 33 + year;
  return [
    { group: "Market cap", label: "Cash counted for market cap ($)", cell: `${u}240` },
    { group: "Market cap", label: "Active Core BMs", cell: `${u}245` },
    { group: "Market cap", label: "Active Growth BMs", cell: `${u}246` },
    { group: "Market cap", label: "Active Explore BMs", cell: `${u}247` },
    { group: "Analyst cards", label: "Outperform", cell: `${u}252` },
    { group: "Analyst cards", label: "Buy", cell: `${u}253` },
    { group: "Analyst cards", label: "Hold", cell: `${u}254` },
    { group: "Analyst cards", label: "Sell", cell: `${u}255` },
    { group: "Analyst cards", label: "Crash", cell: `${u}256` },
    { group: "P&L / balance", label: "Cost base (opex)", cell: `C${r}` },
    { group: "P&L / balance", label: "Cap.ex", cell: `D${r}` },
    { group: "P&L / balance", label: "One-time revenue", cell: `E${r}` },
    { group: "P&L / balance", label: "Interest", cell: `K${r}` },
    { group: "P&L / balance", label: "Depreciation", cell: `L${r}` },
    { group: "P&L / balance", label: "Cash balance", cell: `N${r}` },
    { group: "P&L / balance", label: "Shares outstanding", cell: `P${r}` },
    { group: "P&L / balance", label: "Dividend paid", cell: `R${r}` },
  ];
}

// Workbook input cells behind the table rows (row 33 + year); everything else is a formula.
const INPUT_COL: Partial<Record<keyof Year, string>> = { costBase: "C", capex: "D", oneTime: "E", interest: "K", depreciation: "L", cash: "N", dividend: "R" };

function FinanceTable({ base, scen, focus, editable, onSaved }: { base: Year[]; scen?: Year[]; focus: number; editable?: boolean; onSaved?: () => void }) {
  const [err, setErr] = useState("");
  const save = async (cell: string, value: string) => {
    const r = await fetch("/api/sheet", { method: "POST", body: JSON.stringify({ range: cell, values: [[value]] }) }).then((x) => x.json());
    setErr(r.error ?? r.pushError ?? "");
    if (!r.error) onSaved?.();
  };
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left pr-2"></th>
            {base.map((y) => (
              <th key={y.year} className={`px-2 ${y.year === focus ? "bg-amber-100 dark:bg-amber-950" : ""}`}>
                Y{y.year}{y.completed.toLowerCase() === "yes" ? " ✓" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, k, f]) => (
            <tr key={k}>
              <td className="pr-2 text-zinc-500 whitespace-nowrap">{label}</td>
              {base.map((y, i) => {
                const a = y[k] as number, b = scen?.[i][k] as number | undefined;
                const changed = b !== undefined && Math.abs(b - a) > 1e-9;
                const col = INPUT_COL[k];
                if (editable && col)
                  return (
                    <td key={y.year} className="px-1 text-right">
                      <input key={`${col}${33 + y.year}:${a}`} defaultValue={a || ""} aria-label={`${label} Y${y.year} (${col}${33 + y.year})`} inputMode="decimal"
                        onBlur={(e) => e.target.value !== String(a || "") && save(`${col}${33 + y.year}`, e.target.value)}
                        className="w-24 rounded border border-green-700/40 bg-green-50/60 dark:bg-green-950/30 px-1 py-0.5 text-right tabular-nums" />
                    </td>
                  );
                return (
                  <td key={y.year} className={`px-2 text-right whitespace-nowrap ${y.year === focus ? "bg-amber-50 dark:bg-amber-950/40" : ""} ${a < 0 ? "text-red-600" : ""}`}>
                    {f(a)}
                    {changed && <div className={b! > a ? "text-green-700 dark:text-green-400" : "text-red-600"}>→ {f(b!)}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600 mt-1">{err}</p>}
    </div>
  );
}

export function FinancesPanel({ version, onApplied, editable = false, cfo = false }: { version: number; onApplied: () => void; editable?: boolean; cfo?: boolean }) {
  const [base, setBase] = useState<Year[] | null>(null);
  const [focus, setFocus] = useState(1);
  const [current, setCurrent] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [cards, setCards] = useState<Card[]>([]);
  const [include, setInclude] = useState<number[]>([]);
  const [scen, setScen] = useState<Year[] | null>(null);
  const [intent, setIntent] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [ideas, setIdeas] = useState<FinancingIdea[]>([]);
  const [strategy, setStrategy] = useState<Strategy | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ baseline: Year[] }>("/api/whatif"),
      api<Strategy>("/api/strategy"),
      api<Card[]>("/api/cards"),
      api<FinancingIdea[]>("/api/financing"),
    ]).then(([w, s, c, f]) => {
      setBase(w.baseline);
      setStrategy(s);
      setFocus(s.current_year);
      setCards(c.filter((x) => ["Core", "Growth", "Explore"].includes(x.type) && x.status !== "booked" && x.status !== "passed"));
      setIdeas(f);
    }, (e) => setMsg(e.message));
  }, [version]);

  const lv = useMemo(() => levers(focus), [focus]);
  // Current values of the lever cells, so the inputs start from what the workbook says.
  useEffect(() => {
    const u = unitsCol(focus);
    Promise.all([
      api<{ values: (string | number | null)[][] }>(`/api/sheet?range=${u}240:${u}256`),
      api<{ values: (string | number | null)[][] }>(`/api/sheet?range=A${33 + focus}:S${33 + focus}`),
    ]).then(([block, row]) => {
      const cur: Record<string, string> = {};
      for (const l of lv) {
        const m = l.cell.match(/^([A-Z]+)(\d+)$/)!;
        cur[l.cell] = m[1] === u
          ? String(block.values[+m[2] - 240]?.[0] ?? "")
          : String(row.values[0]?.[m[1].charCodeAt(0) - 65] ?? "");
      }
      setCurrent(cur);
    }, () => {});
  }, [focus, lv, version]);

  const changeFocus = (y: number) => (setFocus(y), setEdits({}), setScen(null));
  const writesOf = (e: Record<string, string>) =>
    Object.entries(e).filter(([cell, v]) => v.trim() !== "" && v !== current[cell]).map(([range, value]) => ({ range, value }));
  const writes = writesOf(edits);

  async function run(e = edits) {
    setBusy("Recalculating the workbook with your scenario…");
    setMsg("");
    try {
      const r = await api<{ scenario: Year[] }>("/api/whatif", "POST", { writes: writesOf(e), cardIds: include });
      setScen(r.scenario);
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy("");
  }

  async function applyLevers(label: string) {
    if (!confirm(`Write these ${writes.length} value(s) into the Team 1 workbook? The critic audits them first. (Cards are booked from the Cards tab, not here.)`)) return;
    setBusy("Writing to a scratch copy; the critic is auditing it…");
    try {
      const r = await api<{ saved: boolean; audit: Audit | null; pushed?: number; pushError?: string }>("/api/whatif", "POST", { writes, apply: true, label });
      const a = r.audit;
      setMsg(`${r.saved ? (r.pushError ? `Saved in the app. ⚠ ${r.pushError}` : `Saved and written to the class sheet (${r.pushed} cells).`) : "NOT saved — the critic rejected it."}${a ? ` Critic: ${a.verdict} — ${a.summary}${a.issues.map((i) => `\n• ${i.cell} ${i.problem}${i.fix ? ` → ${i.fix}` : ""}`).join("")}` : ""}`);
      if (r.saved) onApplied();
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy("");
  }

  async function ask() {
    const text = intent.trim();
    if (!text || busy) return;
    const turn: Turn = { intent: text };
    setTurns((t) => [...t, turn]);
    setIntent("");
    setBusy("Designing three financing strategies against our numbers and covenants… (~1 min)");
    const history = turns.map((t) => ({ intent: t.intent, options: t.options?.map((o) => `${o.rank}. ${o.name}: ${o.summary}`) }));
    const chosen = cards.filter((c) => include.includes(c.id)).map((c) => ({ id: c.id, type: c.type, title: c.title, capex: c.capex, start_year: c.start_year }));
    try {
      const r = await api<{ read_of_intent: string; options: Option[] }>("/api/finance-plan", "POST", {
        intent: text, history, levers: writes, leverCells: lv.map((l) => `${l.cell} (${l.label})`), cards: chosen,
        baseline: base, scenario: scen ?? base, year: focus,
      });
      setTurns((t) => t.map((x) => (x === turn ? { ...x, read: r.read_of_intent, options: [...r.options].sort((p, q) => p.rank - q.rank) } : x)));
    } catch (err) {
      setTurns((t) => t.map((x) => (x === turn ? { ...x, error: (err as Error).message } : x)));
    }
    setBusy("");
  }

  function preview(o: Option) {
    const e = Object.fromEntries(o.levers.filter((l) => lv.some((x) => x.cell === l.cell)).map((l) => [l.cell, String(l.value)]));
    setEdits(e);
    run(e);
  }

  async function pick(o: Option) {
    const ids = o.picks.map((p) => p.idea_id).filter((x): x is number => x !== null);
    await Promise.all(ids.map((id) => api("/api/financing", "PATCH", { id, status: "locked", our_notes: `Option "${o.name}": ${o.picks.find((p) => p.idea_id === id)?.amount ?? ""}` })));
    setIdeas((xs) => xs.map((x) => (ids.includes(x.id) ? { ...x, status: "locked" } : x)));
    setMsg(`Picked "${o.name}" — ${ids.length} financing option(s) are now part of our strategy.${o.levers.length ? " Preview it, then use \"Apply levers to workbook\" to book its numbers." : ""}`);
  }

  if (!base) return <p className="text-sm text-zinc-500">{msg || "Loading finances…"}</p>;
  const groups = [...new Set(lv.map((l) => l.group))];
  const ideaName = (id: number | null) => ideas.find((i) => i.id === id)?.name;

  return (
    <section className="space-y-4">
      {strategy && (
        <section className="rounded-xl border-2 border-amber-500/60 bg-amber-50/60 dark:bg-amber-950/30 p-4" aria-label="Strategy knob">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
            <h2 className="text-xl">Strategy knob · H1 / H2 / H3 mix</h2>
            <span className="text-xs text-zinc-500">Turn toward Defend to protect the legacy business, toward Transform to bet on satellite data and the ecosystem. Card evaluations, the financing chat and the critic all use this target.</span>
          </div>
          <HorizonKnob editable value={strategy.knob} target={{ h1: strategy.h1_pct, h2: strategy.h2_pct, h3: strategy.h3_pct }}
            onCommit={(knob, m) => api("/api/strategy", "PUT", { knob, h1_pct: m.h1, h2_pct: m.h2, h3_pct: m.h3 }).then(() => { setStrategy({ ...strategy, knob, h1_pct: m.h1, h2_pct: m.h2, h3_pct: m.h3 }); refreshOverview(); })} />
        </section>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">1 · Where we are</h2>
        <label className="text-sm">Focus year{" "}
          <select value={focus} onChange={(e) => changeFocus(Number(e.target.value))} className={input}>
            {base.map((y) => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
        </label>
        <span className="text-xs text-zinc-500">
          Y{focus} market cap {capM(base[focus - 1].cap)} = cash {capM(base[focus - 1].capCash)} + BMs {capM(base[focus - 1].capBM)} + analysts {capM(base[focus - 1].capAnalyst)}
        </span>
      </div>
      <FinanceTable base={base} scen={scen ?? undefined} focus={focus} editable={editable && !scen} onSaved={onApplied} />
      {scen && (
        <div className="flex gap-2 items-center flex-wrap text-sm">
          <span className="text-amber-700 dark:text-amber-400">Showing a what-if (→ values). Nothing is saved.</span>
          <button onClick={() => (setScen(null), setEdits({}), setInclude([]))} className={`${btn} border border-zinc-400`}>Reset</button>
          {writes.length > 0 && cfo && <button onClick={() => applyLevers("what-if")} disabled={!!busy} className={`${btn} border border-green-700`}>Apply levers to workbook (audited)</button>}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">2 · What do we want to do? → three ranked financing strategies</h2>
        <div className="space-y-3">
          {turns.map((t, i) => (
            <div key={i} className="space-y-2">
              <div className="rounded bg-indigo-50 dark:bg-indigo-950 p-2 text-sm whitespace-pre-wrap">{t.intent}</div>
              {t.error && <p className="text-sm text-red-600">{t.error}</p>}
              {t.read && <p className="text-xs text-zinc-500">Understood: {t.read}</p>}
              {t.options && (
                <ol className="grid gap-2 md:grid-cols-3">
                  {t.options.map((o) => (
                    <li key={o.rank} className={`game-card text-sm space-y-1.5 ${o.rank === 1 ? "ring-2 ring-amber-500" : ""}`}>
                      <div className="flex items-baseline gap-2"><span className="font-display text-3xl text-amber-600 leading-none">#{o.rank}</span><span className="font-display uppercase tracking-wide text-base leading-tight">{o.name}</span></div>
                      <p>{o.summary}</p>
                      <p className="text-xs"><b>Need:</b> {o.funding_need}</p>
                      <ul className="text-xs list-disc ml-4">
                        {o.picks.map((p, j) => <li key={j}><b>{p.idea_id ? ideaName(p.idea_id) ?? p.name : p.name}</b>{p.idea_id ? ` (#${p.idea_id})` : " (new)"} — {p.amount}. {p.why}</li>)}
                      </ul>
                      <p className="text-xs"><b>Effect:</b> {o.effect}</p>
                      <details className="text-xs"><summary className="cursor-pointer text-zinc-500">Risks · board line · workbook changes</summary>
                        <Markdown>{o.risks}</Markdown>
                        <p className="italic mt-1">&ldquo;{o.board_line}&rdquo;</p>
                        <p className="mt-1">{o.levers.map((l) => `${l.cell} = ${l.value.toLocaleString("en-US")}`).join(" · ") || "No workbook changes."}</p>
                      </details>
                      <div className="flex gap-2 pt-1">
                        {o.levers.length > 0 && <button onClick={() => preview(o)} disabled={!!busy} className={`${btn} border border-indigo-900`}>Preview</button>}
                        <button onClick={() => pick(o)} disabled={!!busy} className={`${btn} bg-green-700 text-white`}>Pick</button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={(e) => (e.preventDefault(), ask())} className="flex gap-2">
          <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={2} aria-label="What we want to do"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask())}
            placeholder={turns.length ? "Refine: e.g. 'less dilution', 'what if the lender says no?'" : "e.g. Fund the hydrogen STBU and two Explore bets in Y1 without breaching the lender covenants, and reach $1/share by Y2"}
            className={`${input} flex-1 p-2`} />
          <button disabled={!!busy || !intent.trim()} className={`${btn} bg-amber-600 text-white`}>Ask</button>
        </form>
      </div>

      <details className="space-y-2">
        <summary className="text-lg font-semibold cursor-pointer">3 · Try it yourself: what-if levers (Y{focus})</summary>
        <div className="grid gap-3 md:grid-cols-3 mt-2">
          {groups.map((g) => (
            <fieldset key={g} className="border border-zinc-200 dark:border-zinc-800 rounded p-2">
              <legend className="text-xs uppercase text-zinc-500 px-1">{g}</legend>
              {lv.filter((l) => l.group === g).map((l) => (
                <label key={l.cell} className="flex items-center justify-between gap-2 text-sm py-0.5">
                  <span>{l.label} <span className="text-xs text-zinc-400">{l.cell}</span></span>
                  <input value={edits[l.cell] ?? current[l.cell] ?? ""} onChange={(e) => setEdits({ ...edits, [l.cell]: e.target.value })}
                    aria-label={l.label} className={`${input} w-28 text-right ${edits[l.cell] !== undefined && edits[l.cell] !== current[l.cell] ? "border-amber-500" : ""}`} />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {cards.length > 0 && (
          <fieldset className="border border-zinc-200 dark:border-zinc-800 rounded p-2">
            <legend className="text-xs uppercase text-zinc-500 px-1">Add candidate cards to the scenario</legend>
            {cards.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={include.includes(c.id)}
                  onChange={(e) => setInclude(e.target.checked ? [...include, c.id] : include.filter((x) => x !== c.id))} />
                {c.type}: {c.title} <span className="text-xs text-zinc-500">capex {$(c.capex)} Y{c.start_year} · {c.status}</span>
              </label>
            ))}
          </fieldset>
        )}
        <button onClick={() => run()} disabled={!!busy || (!writes.length && !include.length)} className={`${btn} bg-indigo-900 text-white`}>Run what-if</button>
      </details>

      {busy && <p className="text-sm text-zinc-500">{busy}</p>}
      {msg && <p className="text-sm whitespace-pre-wrap">{msg}</p>}
      <p className="text-xs text-zinc-400">All figures come from the workbook&rsquo;s own formulas (rows 34–43 and the market cap block {n2col(4)}240:AF260).</p>
    </section>
  );
}
