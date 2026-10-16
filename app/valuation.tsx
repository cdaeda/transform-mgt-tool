"use client";

import { ANALYST_NAMES, ANALYST_VALUE, BM_VALUE, marketCap } from "@/lib/marketcap";
import { useOverview } from "./overview-store";

type O = {
  year: number;
  certificate: { caps: number[]; price: number[]; rank: string };
  plan: { units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; cash: number; shares: number };
};
const capM = (m: number, sign = false) => {
  const a = Math.abs(m), s = m < 0 ? "−" : sign && m > 0 ? "+" : "";
  return a < 0.5 ? "$0" : `${s}$${a >= 1000 ? `${(a / 1000).toFixed(a % 1000 ? 2 : 0)}B` : `${a.toFixed(0)}M`}`;
};

// Our valuation as the game scores it (the workbook's market-cap formula), term by term.
export function Valuation({ version }: { version: number }) {
  const o = useOverview<O>(version);
  const d = o?.data?.plan && o.data.certificate ? o.data : null;
  if (!d) return <div className="game-card h-56 animate-pulse" aria-busy="true" />;
  const { units, analysts, cashForCap, cash, shares } = d.plan, y = d.year;
  const mc = marketCap({ ...units, analysts, cash: cashForCap });
  const base = mc.portfolio + mc.analysts;
  const price = (mc.total * 1e6) / (shares || 1e9);
  const next = d.certificate.caps[y]; // the workbook's next year
  const bm = ([["Core", units.core, BM_VALUE.core], ["Growth", units.growth, BM_VALUE.growth], ["Explore", units.explore, BM_VALUE.explore]] as const).filter(([, n]) => n);
  const an = ANALYST_NAMES.map((n, i) => [n, analysts[i] ?? 0, ANALYST_VALUE[i]] as const).filter(([, c]) => c);
  const parts = [
    { k: "Business models", v: mc.portfolio, lines: bm.map(([n, c, v]) => `${c} ${n} × ${capM(v)} = ${capM(c * v)}`), color: "var(--growth)" },
    { k: "Analyst ratings", v: mc.analysts, lines: an.map(([n, c, v]) => `${c} ${n} × ${capM(v, true)} = ${capM(c * v, true)}`), color: "var(--explore)" },
    { k: "Cash counted", v: mc.cashTerm, color: "var(--gold)", lines: [
      `Cell D240: ${capM(cashForCap / 1e6)} × 100`,
      base <= 0 ? `Counts only once models + ratings are above zero (now ${capM(base)}): nothing counts` : mc.cashCapped ? `Capped at models + ratings (${capM(base)})` : "Under the cap: all of it counts",
    ] },
  ];
  const max = Math.max(1, ...parts.map((p) => Math.abs(p.v)), Math.abs(mc.total));
  return (
    <section className="rounded-xl border-2 border-indigo-900/70 dark:border-indigo-300/50 bg-surface p-4 sm:p-5 space-y-4" aria-label="Our valuation">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-zinc-500">Our valuation · Year {y} · as the game scores it</p>
          <p className={`font-display text-5xl sm:text-6xl tabular-nums leading-none ${mc.total < 0 ? "text-red-600" : ""}`}>{capM(mc.total)}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{price < 0 ? "−" : ""}${Math.abs(price).toFixed(2)} a share · rank {d.certificate.rank}{next !== undefined && ` · the workbook shows ${capM(next)} for Year ${y + 1}`}</p>
        </div>
        <p className="text-xs text-zinc-500 max-w-sm">Market cap = business models + analyst ratings + cash × 100 (cash counts only up to models + ratings). Same formula as the workbook&rsquo;s leaderboard.</p>
      </div>

      {/* the equation */}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch">
        {parts.map((p, i) => (
          <div key={p.k} className="contents">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <p className="eyebrow flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />{p.k}</p>
              <p className={`font-display text-3xl tabular-nums ${p.v < 0 ? "text-red-600" : ""}`}>{capM(p.v, i > 0)}</p>
              {p.lines.map((l) => <p key={l} className="text-xs text-zinc-600 dark:text-zinc-400 tabular-nums">{l}</p>)}
            </div>
            <span className="self-center text-center font-display text-2xl text-zinc-400">{i < 2 ? "+" : "="}</span>
          </div>
        ))}
        <div className="rounded-lg bg-indigo-900 text-white p-3">
          <p className="eyebrow text-white/70">Market cap</p>
          <p className="font-display text-3xl tabular-nums">{capM(mc.total)}</p>
          <p className="text-xs text-white/70">{price < 0 ? "−" : ""}${Math.abs(price).toFixed(2)} × {((shares || 1e9) / 1e6).toFixed(0)}M shares</p>
        </div>
      </div>

      {/* the same, as bars around zero */}
      <div className="space-y-1.5" aria-hidden>
        {[...parts, { k: "Market cap", v: mc.total, color: "var(--core)" }].map((p) => {
          const w = (Math.abs(p.v) / max) * 50;
          return (
            <div key={p.k} className="grid grid-cols-[8rem_1fr] items-center gap-2 text-xs">
              <span className="text-right text-zinc-500">{p.k}</span>
              <div className="relative h-4 rounded bg-zinc-100 dark:bg-zinc-800">
                <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-400" />
                <span className="absolute inset-y-0.5 rounded" style={{ width: `${w}%`, left: p.v < 0 ? `${50 - w}%` : "50%", background: p.v < 0 ? "#d2353f" : p.color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-sm">
        <p className="font-semibold">What moves it</p>
        <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2 text-zinc-700 dark:text-zinc-300">
          {(analysts[3] ?? 0) > 0 && <li>Each Sell turned into a Buy: <b>+$2B</b> ({analysts[3]} Sells held)</li>}
          <li>Each new Explore model: <b>+$1B</b> · Growth <b>+$500M</b> · Core <b>+$100M</b></li>
          <li>Each Outperform rating: <b>+$2.5B</b></li>
          <li>Each $1M of cash counted (cell D240): <b>+$100M</b>{base <= 0 ? ", only once models + ratings are above zero" : mc.cashCapped ? ", but we're at the cap" : ""}</li>
          {cash > 0 && cashForCap === 0 && base > 0 && <li>We hold {capM(cash / 1e6)} of cash (N{33 + y}) but D240 counts {capM(0)}: entering it would add up to {capM(Math.min((cash * 100) / 1e6, Math.max(0, base)))}</li>}
        </ul>
      </div>
    </section>
  );
}
