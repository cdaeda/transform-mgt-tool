"use client";

import { project, requiredPath, type Strat, type Today } from "@/lib/capital";

const capM = (m: number) => {
  const a = Math.abs(m), s = m < 0 ? "−" : "";
  if (a < 0.5) return "$0";
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(a >= 10000 ? 1 : 2)}B` : `${s}$${a.toFixed(0)}M`;
};

// "$50B by Year N": where we are, the straight-line path we need, and what our capital plan projects -
// each projected year split into cash, business models and analyst ratings.
export function GoalPath({ today, strats, goalYear: goalYear0, goalCap, includePitching = false, compact = false, onOpen }: {
  today: Today; strats: Strat[]; goalYear: number; goalCap: number; includePitching?: boolean; compact?: boolean; onOpen?: () => void;
}) {
  const goalYear = Math.max(goalYear0, today.year); // a goal year already passed means "this year"
  const need = requiredPath(project(today, [], goalYear)[0].total, today.year, goalYear, goalCap);
  const plan = project(today, strats, goalYear, (s) => s.status === "locked" || (includePitching && s.status === "pitching"));
  const end = plan[plan.length - 1];
  const gapEnd = goalCap - end.total;
  const nowM = plan[0].total;
  const max = Math.max(goalCap, ...plan.map((p) => p.cashTerm + Math.max(0, p.portfolio) + Math.max(0, p.analysts)));
  const behind = plan.find((p, k) => p.total < need[k].cap - 1);
  const status = gapEnd <= 0 ? { t: "✓ On track for the goal", c: "text-green-700 dark:text-green-400" } : { t: `! Plan ends ${capM(gapEnd)} short`, c: "text-red-600" };
  const lockedN = strats.filter((s) => s.status === "locked" && s.effect).length;

  return (
    <section className={compact ? "" : "rounded-xl border-2 border-[var(--gold)] bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/60 dark:to-zinc-900 p-5"} aria-label={`$${goalCap / 1000}B by Year ${goalYear}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow text-amber-700 dark:text-amber-300">Our biggest strategic initiative</p>
          <h2 className="text-3xl sm:text-4xl leading-none">${goalCap / 1000}B by Year {goalYear}</h2>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl tabular-nums">{capM(nowM)} <span className="text-base text-zinc-500">today</span></p>
          <p className={`text-sm font-semibold ${status.c}`}>{status.t}</p>
        </div>
      </div>

      {/* per year: required (outline) vs projected, projected split into its three parts */}
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
        {plan.map((p, k) => {
          const req = need[k].cap, h = 150;
          const seg = (v: number) => `${(Math.max(0, v) / max) * h}px`;
          return (
            <div key={p.year} className="flex flex-col items-center gap-1">
              <div className="relative w-full max-w-28 flex flex-col-reverse items-stretch" style={{ height: h }} title={`Year ${p.year}: need ${capM(req)}, plan ${capM(p.total)}`}>
                <span className="absolute left-0 right-0 border-t-2 border-dashed border-zinc-500" style={{ bottom: seg(req) }} aria-hidden />
                <span className="rounded-b-sm" style={{ height: seg(p.portfolio), background: "var(--growth)" }} />
                <span style={{ height: seg(p.analysts), background: "var(--explore)" }} />
                <span className="rounded-t-sm" style={{ height: seg(p.cashTerm), background: "var(--gold)" }} />
                {p.total < 0 && <span className="absolute bottom-0 left-0 right-0 h-1 bg-[#d2353f]" />}
              </div>
              <p className="eyebrow text-zinc-500">Year {p.year}</p>
              <p className={`font-display text-xl tabular-nums leading-none ${p.total < req - 1 ? "text-red-600" : ""}`}>{capM(p.total)}</p>
              <p className="text-xs text-zinc-500 tabular-nums">need {capM(req)} · {p.price < 0 ? "−" : ""}${Math.abs(p.price).toFixed(2)}/sh</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {[["var(--growth)", "Business models"], ["var(--explore)", "Analyst ratings"], ["var(--gold)", "Cash × 100"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>)}
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-zinc-500" />Required path</span>
      </div>
      <p className="mt-2 text-sm">
        {lockedN ? `Projection from ${lockedN} locked-in capital strateg${lockedN === 1 ? "y" : "ies"}${includePitching ? " plus those being pitched" : ""}, if nothing else changes.` : "No capital strategy is locked in yet, so the projection is flat."}
        {behind && ` Behind the path from Year ${behind.year}.`}{" "}
        {onOpen && <button onClick={onOpen} className="underline font-semibold">Open Capital to close the gap →</button>}
      </p>
    </section>
  );
}
