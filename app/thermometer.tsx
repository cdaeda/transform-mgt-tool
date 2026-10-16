"use client";

import { ANALYST_NAMES, ANALYST_VALUE, BM_VALUE, marketCap } from "@/lib/marketcap";

type Props = {
  year: number;
  units: { core: number; growth: number; explore: number };
  analysts: number[];
  cashForCap: number; // D240-style cash counted for market cap ($)
  cash: number; // cash balance on hand ($)
  onPlan?: () => void;
};

const capM = (m: number) => {
  const a = Math.abs(m), s = m < 0 ? "−" : "";
  if (a === 0) return "$0";
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(a >= 10000 ? 1 : 2)}B` : `${s}$${a.toFixed(a < 10 ? 1 : 0)}M`;
};
const TICKS = [-2500, 0, 10000, 25000, 50000];

// Market cap as a thermometer: the workbook's three parts, each explained with its own numbers.
export function MarketCapThermometer({ year, units, analysts, cashForCap, cash, onPlan }: Props) {
  const mc = marketCap({ ...units, analysts, cash: cashForCap });
  const lo = Math.min(-2500, mc.total, mc.analysts), hi = 50000;
  const H = 260, top = 14, y = (v: number) => top + H - ((v - lo) / (hi - lo)) * H;
  const base = mc.portfolio + mc.analysts;
  const sells = analysts[3] ?? 0, crashes = analysts[4] ?? 0;

  const parts = [
    {
      n: 1, name: "Cash × 100", value: mc.cashTerm, color: "var(--gold)",
      formula: "cash counted for market cap × 100, but never more than parts 2 + 3 (and nothing while they're below zero)",
      now: `${capM(cash / 1e6)} cash on hand · ${capM(cashForCap / 1e6)} entered as cash for market cap${!cashForCap ? " (cell blank)" : ""} → ${capM(mc.cashTerm)} counted${base <= 0 ? ", because parts 2 + 3 are below zero" : mc.cashCapped ? " (capped at parts 2 + 3)" : ""}`,
      move: base <= 0 ? "Fix parts 2 and 3 first: until they're above zero, cash adds nothing." : `Each $1M of cash adds $100M, up to ${capM(base)} — about ${capM(base / 100)} of cash is all that counts.`,
    },
    {
      n: 2, name: "Business model portfolio", value: mc.portfolio, color: "var(--growth)",
      formula: `Core ${capM(BM_VALUE.core)} · Growth ${capM(BM_VALUE.growth)} · Explore ${capM(BM_VALUE.explore)} for each active model`,
      now: `${units.core} Core + ${units.growth} Growth + ${units.explore} Explore = ${capM(mc.portfolio)}`,
      move: "Activate more models — one Explore model is worth ten Core models. Book them, then count them as active units.",
    },
    {
      n: 3, name: "Financial analyst rating", value: mc.analysts, color: "var(--explore)",
      formula: ANALYST_NAMES.map((a, i) => `${a} ${ANALYST_VALUE[i] > 0 ? "+" : "−"}${capM(Math.abs(ANALYST_VALUE[i]))}`).join(" · "),
      now: ANALYST_NAMES.map((a, i) => (analysts[i] ? `${analysts[i]} ${a}` : "")).filter(Boolean).join(" + ") + ` = ${capM(mc.analysts)}` || "No ratings yet",
      move: sells || crashes ? `Turning each Sell into a Buy is worth +$2B. Shareholder meetings, Capital Markets Day (cash over 20M) and Transformation Awards (a Buy per Explore model) earn ratings.` : "Earn Buy and Outperform ratings through investor events and Explore models.",
    },
  ];

  return (
    <section className="game-card" aria-label="Market cap thermometer">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-xl">Market cap · Year {year}</h2>
        <span className="text-xs text-zinc-500">How the workbook values us: 1 + 2 + 3 = market cap · goal $50B</span>
      </div>
      <div className="grid gap-5 md:grid-cols-[12rem_1fr] items-start">
        {/* the thermometer */}
        <svg viewBox="0 0 200 320" className="w-48 mx-auto" role="img" aria-label={`Market cap ${capM(mc.total)} on a scale to $50B`}>
          <rect x="102" y={top - 6} width="26" height={H + 12} rx="13" fill="var(--color-zinc-100)" stroke="var(--frame)" strokeOpacity="0.5" />
          <circle cx="115" cy={top + H + 22} r="22" fill={mc.total < 0 ? "#d2353f" : "var(--gold)"} stroke="var(--frame)" strokeOpacity="0.5" />
          <rect x="108" y={Math.min(y(mc.total), y(lo))} width="14" height={Math.max(4, y(lo) - y(mc.total)) + 12} rx="7" fill={mc.total < 0 ? "#d2353f" : "var(--gold)"} />
          {TICKS.map((t) => (
            <g key={t}>
              <line x1="130" x2={t === 0 ? 144 : 138} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-zinc-500" strokeWidth={t === 0 ? 2 : 1} />
              <text x="148" y={y(t) + 4} fontSize="11" className="fill-zinc-600 dark:fill-zinc-400" fontFamily="var(--font-figures)">{t === 0 ? "$0" : capM(t)}</text>
            </g>
          ))}
          <text x="148" y={top - 6} fontSize="10" className="fill-amber-700 dark:fill-amber-300" fontFamily="var(--font-display-face)" letterSpacing="1">GOAL</text>
          <line x1="62" x2="106" y1={y(mc.total)} y2={y(mc.total)} stroke="var(--ink)" strokeWidth="1.5" className="dark:stroke-white" />
          <text x="60" y={y(mc.total) + 4} fontSize="13" textAnchor="end" fontWeight="700" className={mc.total < 0 ? "fill-red-600" : "fill-current"}>{capM(mc.total)}</text>
        </svg>

        {/* explainability, part by part */}
        <div className="space-y-2">
          {parts.map((p) => (
            <div key={p.n} className="grid grid-cols-[2rem_1fr_auto] gap-x-3 items-start rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <span className="grid place-items-center w-8 h-8 rounded-full text-white font-display" style={{ background: p.color }}>{p.n}</span>
              <div className="min-w-0 space-y-0.5">
                <p className="font-display uppercase tracking-wide">{p.name}</p>
                <p className="text-xs text-zinc-500">{p.formula}</p>
                <p className="text-sm">{p.now}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400"><span className="font-semibold">To move it: </span>{p.move}</p>
              </div>
              <span className={`font-display text-2xl tabular-nums ${p.value < 0 ? "text-red-600" : ""}`}>{capM(p.value)}</span>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 px-3 py-2">
            <span className="font-display uppercase tracking-wide">= Market cap</span>
            <span className={`font-display text-3xl tabular-nums ${mc.total < 0 ? "text-red-600" : ""}`}>{capM(mc.total)}</span>
            <span className="w-full text-xs text-zinc-500">{capM(Math.max(0, 50000 - mc.total))} to the $50B goal — $50 a share at 1BN shares.{" "}
              {onPlan && <button onClick={onPlan} className="underline">Plan the path to $50B →</button>}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
