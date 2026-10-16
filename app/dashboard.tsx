"use client";

import { useState } from "react";
import { refreshOverview, useOverview } from "./overview-store";
import { HorizonKnob } from "./knob";
import { MarketCapThermometer } from "./thermometer";
import { GoalPath } from "./goal";
import { NextMove, type Go } from "./next-move";
import { ProfitBorrow } from "./profit-borrow";
import type { Strat } from "@/lib/capital";

type Status = "on-track" | "at-risk" | "off-track" | "no-target";
type Fact = { label: string; value: number | null; unit: "$" | "#" | "x"; extra?: number };
type Horizon = { id: "H1" | "H2" | "H3"; name: string; portfolio: string; metric: string; actual: number; target: number | null; unit: "$" | "#"; status: Status; facts: Fact[] };
type Dash = {
  year: number;
  kpis: {
    revenue: number; revenuePrev: number | null; ebitda: number; ebitdaPrev: number | null; margin: number | null;
    net: number; netPrev: number | null; cash: number; fundingGap: number; interestShare: number | null; capex: number;
  };
  horizons: Horizon[];
  pipeline: { drawn: number; candidate: number; selected: number; booked: number; financingPicked: string[] };
  health: { unpushed: number; workbookUpdated: string | null; lastAudit: { verdict: string; summary: string; created_at: string } | null };
  targets: { h1: number | null; h2: number | null; h3: number | null; h3_partners: number };
  knob: { value: number; target: { h1: number; h2: number; h3: number }; actual: { pct: { h1: number; h2: number; h3: number }; spend: { h1: number; h2: number; h3: number }; total: number } };
  plan: { units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; cash: number; shares: number };
  goal: { year: number; cap: number };
  capital: Strat[];
};

const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(0)}k` : `${s}$${a.toFixed(0)}`;
};
const fmt = (v: number | null, unit: Fact["unit"]) => (v === null ? "—" : unit === "$" ? money(v) : unit === "x" ? `${v.toFixed(2)}×` : v.toLocaleString("en-US"));

// Status always carries an icon + label, never colour alone.
const STATUS: Record<Status, { icon: string; label: string; cls: string }> = {
  "on-track": { icon: "✓", label: "On track", cls: "text-[#1f7a3a] bg-[#e3f4e8] dark:bg-[#12301c] dark:text-[#7ad69a]" },
  "at-risk": { icon: "!", label: "At risk", cls: "text-[#8a5a00] bg-[#fdf1d6] dark:bg-[#3a2a06] dark:text-[#f0c35a]" },
  "off-track": { icon: "✕", label: "Off track", cls: "text-[#b3261e] bg-[#fbe4e2] dark:bg-[#3b1210] dark:text-[#ff9a92]" },
  "no-target": { icon: "—", label: "No target set", cls: "text-zinc-600 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300" },
};
const HUE = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)" };

function Badge({ s }: { s: Status }) {
  const x = STATUS[s];
  return <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap self-start rounded-full px-2 py-0.5 text-xs font-semibold ${x.cls}`}><span aria-hidden>{x.icon}</span>{x.label}</span>;
}

function Tile({ label, value, sub, delta, tone }: { label: string; value: string; sub?: string; delta?: string | null; tone?: Status }) {
  return (
    <div className="game-card !p-4 flex flex-col gap-1">
      <span className="eyebrow text-zinc-500">{label}</span>
      <span className="font-display text-[1.75rem] font-semibold leading-none whitespace-nowrap tabular-nums">{value}</span>
      <span className="text-xs text-zinc-500 min-h-4">{sub}{delta && <span className="ml-1">{delta}</span>}</span>
      {tone && tone !== "on-track" && <Badge s={tone} />}
    </div>
  );
}

const vsPrev = (now: number, prev: number | null) => (prev === null ? null : `${now >= prev ? "▲" : "▼"} ${money(Math.abs(now - prev))} vs last year`);

function HorizonCard({ h, onTarget, partners, onPartners }: { h: Horizon; onTarget: (v: number | null) => void; partners?: number; onPartners?: (n: number) => void }) {
  const [edit, setEdit] = useState<string | null>(null);
  const pct = h.target ? Math.max(0, Math.min(100, (h.actual / h.target) * 100)) : 0;
  const parse = (s: string) => {
    const t = s.trim().toUpperCase().replace(/[$,\s]/g, "");
    if (!t) return null;
    const m = t.match(/^(-?\d*\.?\d+)([KMB]?)$/);
    return m ? Number(m[1]) * ({ "": 1, K: 1e3, M: 1e6, B: 1e9 } as Record<string, number>)[m[2]] : NaN;
  };
  // The colored top edge replaces the card's inset frame, which otherwise left the stripe sticking out past it.
  return (
    <section className="game-card !p-0 ![outline:none] border-t-[6px] overflow-hidden flex flex-col" style={{ borderTopColor: HUE[h.id] }} aria-label={`${h.id} ${h.name}`}>
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="eyebrow" style={{ color: HUE[h.id] }}>{h.id} · {h.portfolio}</p>
            <h3 className="text-xl leading-tight">{h.name}</h3>
          </div>
          <Badge s={h.status} />
        </div>
        <div>
          <p className="eyebrow text-zinc-500">{h.metric}</p>
          <p className="font-display text-4xl font-semibold tabular-nums leading-none mt-1">
            {fmt(h.actual, h.unit)}
            <span className="font-sans text-sm text-zinc-500 font-normal"> / {h.target === null ? "no target" : fmt(h.target, h.unit)}</span>
          </p>
          <div className="mt-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-label={`${h.id} progress to target`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: HUE[h.id] }} />
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            {edit === null ? (
              <button className="underline text-zinc-600" onClick={() => setEdit(h.target === null ? "" : String(h.target))}>{h.target === null ? "Set target" : "Change target"}</button>
            ) : (
              <form className="flex gap-1 items-center" onSubmit={(e) => { e.preventDefault(); const v = parse(edit); if (Number.isNaN(v)) return; onTarget(v); setEdit(null); }}>
                <input autoFocus value={edit} onChange={(e) => setEdit(e.target.value)} placeholder={h.unit === "$" ? "e.g. 60M" : "e.g. 3"} aria-label={`${h.id} target`}
                  className="w-24 rounded-md border border-zinc-300 px-1.5 py-0.5" />
                <button className="rounded-md bg-indigo-900 text-white px-2 py-0.5">Save</button>
                <button type="button" className="underline" onClick={() => setEdit(null)}>Cancel</button>
              </form>
            )}
            {onPartners && (
              <span className="ml-auto flex items-center gap-1">
                Partners signed
                <button aria-label="One fewer partner" className="rounded border border-zinc-300 w-6" onClick={() => onPartners(Math.max(0, (partners ?? 0) - 1))}>−</button>
                <span className="num w-5 text-center">{partners}</span>
                <button aria-label="One more partner" className="rounded border border-zinc-300 w-6" onClick={() => onPartners((partners ?? 0) + 1)}>+</button>
              </span>
            )}
          </div>
        </div>
        <dl className="mt-auto divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
          {h.facts.map((f) => (
            <div key={f.label} className="flex justify-between gap-3 py-1.5">
              <dt className="text-zinc-600 dark:text-zinc-400">{f.label}</dt>
              <dd className="num">{fmt(f.value, f.unit)}{f.extra !== undefined && <span className="text-zinc-500"> / {money(f.extra)}</span>}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function DashboardPanel({ version, onChanged, onTune, onPlan, go }: { version: number; onChanged: () => void; onTune: () => void; onPlan: () => void; go: Go }) {
  const o = useOverview<Dash>(version);
  const d = o?.data?.horizons ? o.data : null;
  const err = d ? "" : o?.error ?? "";
  const save = (patch: Record<string, number | null>) =>
    fetch("/api/strategy", { method: "PUT", body: JSON.stringify(patch) }).then(() => (refreshOverview(), onChanged()));

  if (err) return <p className="text-sm text-red-600">Dashboard: {err}</p>;
  if (!d) return <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="game-card h-24 animate-pulse" />)}</div>;
  const k = d.kpis;
  const interestTone: Status | undefined = k.interestShare === null ? undefined : k.interestShare > 0.5 ? "off-track" : k.interestShare > 0.2 ? "at-risk" : "on-track";

  // Things the team should act on, most serious first.
  const alerts: { s: Status; text: string }[] = [];
  if (k.fundingGap > 0) alerts.push({ s: "off-track", text: `Cash is ${money(k.cash)}: a ${money(k.fundingGap)} funding gap. Ask the Finances tab for ranked options.` });
  if (k.interestShare !== null && k.interestShare > 0.5) alerts.push({ s: "off-track", text: `Interest is ${(k.interestShare * 100).toFixed(0)}% of revenue in Year ${d.year} — check column K for a units slip (the 25M loan at 5% is 1.25M a year).` });
  if (k.net < 0) alerts.push({ s: "at-risk", text: `Year ${d.year} net profit is ${money(k.net)}.` });
  if (d.health.lastAudit && d.health.lastAudit.verdict !== "PASS") alerts.push({ s: d.health.lastAudit.verdict === "FAIL" ? "off-track" : "at-risk", text: `Last critic audit: ${d.health.lastAudit.verdict}. Run "Audit workbook now" on the Workbook tab after recent edits.` });
  if (d.health.unpushed > 0) alerts.push({ s: "at-risk", text: `${d.health.unpushed} Team 1 cell(s) are saved in the app but not yet in the class sheet.` });
  const missing = d.horizons.filter((h) => h.target === null).map((h) => h.id);
  if (missing.length) alerts.push({ s: "no-target", text: `Set targets for ${missing.join(", ")} so the scorecard can tell on-track from off-track.` });
  if (!d.pipeline.financingPicked.length) alerts.push({ s: "no-target", text: "No financing option picked yet — see the top 5 funding plays on the Financing tab." });

  return (
    <div className="space-y-5">
      <NextMove go={go} version={version} />
      <ProfitBorrow version={version} />
      {d.plan && d.goal && (
        <GoalPath today={{ ...d.plan.units, analysts: d.plan.analysts, cash: d.plan.cashForCap, shares: d.plan.shares || 1e9, year: d.year }}
          strats={d.capital ?? []} goalYear={d.goal.year} goalCap={d.goal.cap} onOpen={onPlan} />
      )}
      {d.plan && <MarketCapThermometer year={d.year} units={d.plan.units} analysts={d.plan.analysts} cashForCap={d.plan.cashForCap} cash={d.plan.cash} onPlan={onPlan} />}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-2xl">Year {d.year} scorecard</h2>
        <span className="text-xs text-zinc-500">From the workbook{d.health.workbookUpdated && `, updated ${new Date(d.health.workbookUpdated).toLocaleString()}`}</span>
      </div>

      <section className="game-card" aria-label="Horizon tuner">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-lg">Horizon tuner</h2>
          <span className="text-xs text-zinc-500">Turn to preview a mix live · set it to make it our strategy</span>
        </div>
        <HorizonKnob key={`${d.knob.value}-${d.knob.target.h1}-${d.knob.target.h2}`} editable value={d.knob.value} target={d.knob.target} actual={d.knob.actual} onTune={onTune}
          onCommit={(knob, m) => save({ knob, h1_pct: m.h1, h2_pct: m.h2, h3_pct: m.h3 })} />
      </section>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Revenue" value={money(k.revenue)} delta={vsPrev(k.revenue, k.revenuePrev)} />
        <Tile label="EBITDA" value={money(k.ebitda)} sub={k.margin === null ? undefined : `${(k.margin * 100).toFixed(0)}% of BM revenue`} delta={vsPrev(k.ebitda, k.ebitdaPrev)} />
        <Tile label="Net profit" value={money(k.net)} delta={vsPrev(k.net, k.netPrev)} tone={k.net < 0 ? "at-risk" : undefined} />
        <Tile label="Cash" value={money(k.cash)} sub={k.fundingGap ? `${money(k.fundingGap)} to fund` : "No funding gap"} tone={k.fundingGap ? "off-track" : undefined} />
        <Tile label="Interest burden" value={k.interestShare === null ? "—" : `${(k.interestShare * 100).toFixed(1)}%`} sub="of BM revenue" tone={interestTone} />
        <Tile label="Cap.ex" value={money(k.capex)} sub={`Year ${d.year}`} />
      </div>

      <div>
        <h2 className="text-lg mb-2">Three horizons</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {d.horizons.map((h) => (
            <HorizonCard key={h.id} h={h}
              onTarget={(v) => save({ [`${h.id.toLowerCase()}_target`]: v })}
              partners={h.id === "H3" ? d.targets.h3_partners : undefined}
              onPartners={h.id === "H3" ? (n) => save({ h3_partners: n }) : undefined} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <section className="game-card space-y-2" aria-label="Needs attention">
          <h2 className="text-lg">Needs attention</h2>
          {alerts.length ? (
            <ul className="space-y-2">{alerts.map((a, i) => <li key={i} className="flex gap-2 items-start text-sm"><Badge s={a.s} /><span>{a.text}</span></li>)}</ul>
          ) : <p className="text-sm text-zinc-500">Nothing flagged.</p>}
        </section>
        <section className="game-card space-y-2" aria-label="Pipeline">
          <h2 className="text-lg">Pipeline</h2>
          <dl className="grid grid-cols-4 text-center">
            {([["Drawn", d.pipeline.drawn], ["Candidate", d.pipeline.candidate], ["Selected", d.pipeline.selected], ["Booked", d.pipeline.booked]] as const).map(([l, v]) => (
              <div key={l}><dd className="font-display text-3xl tabular-nums">{v}</dd><dt className="eyebrow text-zinc-500">{l}</dt></div>
            ))}
          </dl>
          <p className="text-sm"><span className="eyebrow text-zinc-500">Financing picked: </span>{d.pipeline.financingPicked.join(" · ") || "none yet"}</p>
        </section>
      </div>
    </div>
  );
}
