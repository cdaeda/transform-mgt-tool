"use client";

import { useEffect, useState } from "react";
import type { Strategy } from "@/lib/db";
import { ANALYST_NAMES, ANALYST_VALUE, marketCap } from "@/lib/marketcap";
import { refreshOverview, useOverview } from "./overview-store";

type Overview = {
  year: number; goal: { year: number; cap: number };
  plan: { units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; cash: number; shares: number };
};

const capM = (m: number) => {
  const a = Math.abs(m), s = m < 0 ? "−" : "+";
  if (a < 0.5) return "$0";
  return `${s}$${a >= 1000 ? `${(a / 1000).toFixed(a % 1000 ? 2 : 0)}B` : `${a.toFixed(0)}M`}`;
};
const plain = (m: number) => capM(m).replace(/^\+/, "");

// The moves that matter, valued by the workbook's analyst values.
const MOVES = [
  { from: 3, to: 1, label: "Sell → Buy" },
  { from: 3, to: 2, label: "Sell → Hold" },
  { from: 4, to: 3, label: "Crash → Sell" },
  { from: 1, to: 0, label: "Buy → Outperform" },
  { from: -1, to: 1, label: "New Buy" },
  { from: -1, to: 0, label: "New Outperform" },
  { from: -1, to: 3, label: "New Sell (lose)" },
];

// What earns or costs ratings in Transform! (official board/card material; our team notes).
const FACTORS: { t: string; e: string; good: boolean }[] = [
  { t: "Capital Markets Day square", e: "Count your cash: over 20M earns 1 Buy card.", good: true },
  { t: "Transformation Awards square", e: "A Buy card for every Explore model you hold — Explore models pay twice.", good: true },
  { t: "First Analyst Introduction square", e: "Get 1 analyst card; 1 business model required per analyst rating level (1–5).", good: true },
  { t: "Management events & tasks", e: "Best presentation wins rewards — the Shareholder Meeting & Analyst Day is the obvious rating lever.", good: true },
  { t: "BOOM! cards", e: "e.g. 'Biden Boom' gives every team a Buy card.", good: true },
  { t: "Innovation strategy cards", e: "e.g. Partner: build an ecosystem, then acquire a related model to earn a Buy card.", good: true },
  { t: "Market News cards", e: "Hit every team: e.g. two Sells if under 100M invested in defense, or under 1BN in AI cap.ex.", good: false },
  { t: "BUST! cards", e: "e.g. 'Tesla Hits Targets' hands Sell cards to mobility and energy companies; 'Apple iCar' — press release in 60s or two Crash cards.", good: false },
  { t: "Strategic dilemmas", e: "e.g. SPAC or face 8 Sell cards; regulation — four Crash cards.", good: false },
];

export function AnalystRatings({ version, ask }: { version: number; ask: (t: string) => void }) {
  const o = useOverview<Overview>(version);
  const [target, setTarget] = useState<number[] | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => void fetch("/api/strategy").then((r) => r.json()).then((s: Strategy) => setTarget(s.analyst_target?.length === 5 ? s.analyst_target : [0, 0, 0, 0, 0])), [version]);

  const d = o?.data?.plan ? o.data : null;
  if (!d || !target) return <div className="game-card h-64 animate-pulse" aria-busy="true" />;
  const now = d.plan.analysts;
  const val = (a: number[]) => a.reduce((s, n, i) => s + n * ANALYST_VALUE[i], 0);
  const nowV = val(now), tgtV = val(target);
  const portfolio = marketCap({ ...d.plan.units, analysts: [0, 0, 0, 0, 0], cash: 0 }).portfolio;
  const half = d.goal.cap / 2; // models + analysts must reach half the goal; cash doubles it
  const modelsNeeded = Math.max(0, half - tgtV);
  const goalYear = year ?? d.goal.year;
  const cashHeadroom = Math.max(0, d.plan.cash * 100 / 1e6 - Math.max(0, portfolio + nowV)); // cash that would count if the base grew
  const totalLevel = target.reduce((a, b) => a + b, 0);
  const allModels = d.plan.units.core + d.plan.units.growth + d.plan.units.explore;

  const save = (t: number[]) => {
    setTarget(t);
    void fetch("/api/strategy", { method: "PUT", body: JSON.stringify({ analyst_target: t }) });
  };
  const addToPlan = async () => {
    const delta = target.map((t, i) => t - (now[i] ?? 0));
    const r = await fetch("/api/capital/add", { method: "POST", body: JSON.stringify({
      name: `Analyst rating campaign to ${ANALYST_NAMES.map((n, i) => (target[i] ? `${target[i]} ${n}` : "")).filter(Boolean).join(", ") || "neutral"}`,
      how_it_works: `Move our analyst cards from ${ANALYST_NAMES.map((n, i) => `${now[i] ?? 0} ${n}`).join(", ")} to the target by Year ${goalYear}: Capital Markets Day (cash > 20M), Transformation Awards (Explore models), winning the Shareholder Meeting & Analyst Day, and avoiding Market News / BUST Sell triggers.`,
      year: goalYear, effect: { cash_m: 0, core: 0, growth: 0, explore: 0, analysts: delta, shares_m: 0, interest_m: 0 },
      fit: `Analyst contribution ${plain(nowV)} → ${plain(tgtV)} (${capM(tgtV - nowV)}).`, pitch_to: "Capital markets: analysts, investors and the facilitators",
      legal_basis: "Earned through the game's own events and squares and honest investor communication.", red_lines: "No selective disclosure, no misleading guidance, no promises we can't evidence.",
    }) }).then((x) => x.json());
    setMsg(r.error ? r.error : "Added to the capital board as an idea — lock it in on Plan & strategies.");
    refreshOverview();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">Analyst ratings</h2>
        <span className="text-xs text-zinc-500">Part 3 of market cap · today {plain(nowV)} · ratings can be worth up to twice their face value when cash is waiting to count</span>
      </div>

      {/* impact of each move */}
      <section className="game-card space-y-2" aria-label="Impact of a rating change">
        <h3 className="text-lg">What one rating change is worth</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MOVES.map((m) => {
            const v = ANALYST_VALUE[m.to] - (m.from >= 0 ? ANALYST_VALUE[m.from] : 0);
            return (
              <div key={m.label} className={`rounded-lg p-3 border ${v >= 0 ? "border-green-700/40 bg-green-50 dark:bg-green-950/30" : "border-red-500/40 bg-red-50 dark:bg-red-950/30"}`}>
                <p className="eyebrow text-zinc-600 dark:text-zinc-400">{m.label}</p>
                <p className={`font-display text-3xl tabular-nums ${v < 0 ? "text-red-600" : ""}`}>{capM(v)}</p>
                <p className="text-xs text-zinc-500">{v < 0 ? "−" : "+"}${Math.abs(v / 1000).toFixed(2)} a share{v > 0 && cashHeadroom > 0 ? ` · up to ${capM(Math.min(2 * v, v + cashHeadroom))} with cash unlocked` : ""}</p>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">Values from the workbook: {ANALYST_NAMES.map((n, i) => `${n} ${capM(ANALYST_VALUE[i])}`).join(" · ")}. Cash counts ×100 only up to models + analysts, so a better rating also lets more of our cash count.</p>
      </section>

      {/* goal */}
      <section className="game-card space-y-3" aria-label="Rating goal">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg">Our rating goal for Year {goalYear}</h3>
          <label className="text-sm">Year <select value={goalYear} onChange={(e) => setYear(Number(e.target.value))} className="rounded border border-zinc-300 dark:border-zinc-700">
            {Array.from({ length: d.goal.year - d.year + 1 }, (_, k) => d.year + k).map((y) => <option key={y}>{y}</option>)}
          </select></label>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center">
          {ANALYST_NAMES.map((n, i) => (
            <div key={n} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
              <p className="eyebrow text-zinc-500">{n}</p>
              <p className="text-xs text-zinc-500">today {now[i] ?? 0}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <button onClick={() => save(target.map((t, j) => (j === i ? Math.max(0, t - 1) : t)))} aria-label={`Fewer ${n}`} className="w-7 rounded border border-zinc-300 dark:border-zinc-700">−</button>
                <span className="font-display text-2xl tabular-nums w-7">{target[i]}</span>
                <button onClick={() => save(target.map((t, j) => (j === i ? t + 1 : t)))} aria-label={`More ${n}`} className="w-7 rounded border border-zinc-300 dark:border-zinc-700">+</button>
              </div>
            </div>
          ))}
        </div>
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><dt className="eyebrow text-zinc-500">Analyst contribution</dt><dd className="font-display text-2xl">{plain(nowV)} → {plain(tgtV)}</dd><dd className="text-xs text-zinc-500">{capM(tgtV - nowV)} from today</dd></div>
          <div><dt className="eyebrow text-zinc-500">Share of the ${half / 1000}B base</dt><dd className="font-display text-2xl">{Math.max(0, Math.round((tgtV / half) * 100))}%</dd><dd className="text-xs text-zinc-500">models + analysts must reach ${half / 1000}B; ${(half / 100 / 1000).toFixed(2)}B of cash doubles it to ${d.goal.cap / 1000}B</dd></div>
          <div><dt className="eyebrow text-zinc-500">Business models still needed</dt><dd className="font-display text-2xl">{plain(modelsNeeded)}</dd><dd className="text-xs text-zinc-500">today {plain(portfolio)} · ≈{Math.ceil(Math.max(0, modelsNeeded - portfolio) / 1000)} more Explore models</dd></div>
        </dl>
        {totalLevel > allModels && <p className="text-xs text-amber-700 dark:text-amber-300">! The board says &ldquo;1 business model required per analyst rating level&rdquo; — {totalLevel} ratings may need at least {totalLevel} active models (we have {allModels}). Confirm the rule with the facilitator.</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={addToPlan} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-green-700 text-white">➕ Add this campaign to the capital plan</button>
          <button onClick={() => ask(`Plan our analyst rating campaign: today we hold ${ANALYST_NAMES.map((n, i) => `${now[i] ?? 0} ${n}`).join(", ")} (${plain(nowV)}). Target by Year ${goalYear}: ${ANALYST_NAMES.map((n, i) => `${target[i]} ${n}`).join(", ")} (${plain(tgtV)}). Which board squares, events, cards and investor moves earn each rating fastest, which risks (Market News, BUST, dilemmas) could cost us ratings, the sequence by year, and what the CFO/IRM should say to analysts. Rank by $ of market cap per $ and per roll.`)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Plan the campaign</button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </section>

      {/* factors */}
      <section className="game-card space-y-2" aria-label="What moves ratings">
        <h3 className="text-lg">What earns and costs ratings</h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {FACTORS.map((f) => (
            <li key={f.t} className="flex gap-2 text-sm">
              <span className={`shrink-0 font-bold ${f.good ? "text-green-700 dark:text-green-400" : "text-red-600"}`} aria-label={f.good ? "Earns ratings" : "Costs ratings"}>{f.good ? "▲" : "▼"}</span>
              <span><b>{f.t}.</b> {f.e}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">From the official Transform! board and card material (v1 board; the Duke v2 board may differ) — log real squares with 🎲 in Capture so the copilot learns which apply.</p>
      </section>
    </div>
  );
}
