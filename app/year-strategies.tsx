"use client";

import { useState } from "react";
import type { Strat } from "@/lib/capital";
import { refreshOverview, useOverview } from "./overview-store";

type O = { year: number; goal: { year: number }; capital: (Strat & { category: string })[] };

// Finance (tactical) view of the capital plan: what lands this year, placed and locked right here.
export function YearStrategies({ version }: { version: number }) {
  const o = useOverview<O>(version);
  const [busy, setBusy] = useState(0);
  if (!o?.data?.capital) return null;
  const { year, goal } = o.data;
  const live = o.data.capital.filter((s) => s.status !== "rejected");
  const now = live.filter((s) => s.year === year && s.status !== "idea");
  const ideas = live.filter((s) => s.year === year && s.status === "idea").length;
  const patch = async (id: number, body: object) => {
    setBusy(id);
    await fetch("/api/financing", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
    refreshOverview();
    setBusy(0);
  };
  const sel = "rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs";
  return (
    <section className="game-card space-y-2" aria-label="Capital strategies this year">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">Capital strategies landing in Year {year}</h3>
        <span className="text-sm flex gap-3"><a href="#capital/lever-planner" className="underline">Year-by-year plan →</a><a href="#finance/simulator" className="underline">Simulate →</a></span>
      </div>
      {now.length ? (
        <ul className="space-y-1.5">
          {now.map((s) => (
            <li key={s.id} className={`flex flex-wrap items-center gap-2 text-sm ${busy === s.id ? "opacity-50" : ""}`}>
              <span className="flex-1 min-w-48">{s.name} <span className="text-xs text-zinc-500">· {s.category}</span></span>
              <select value={s.status} onChange={(e) => patch(s.id, { status: e.target.value })} aria-label={`Status of ${s.name}`} className={sel}>
                {["idea", "pitching", "locked", "rejected"].map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={s.year ?? ""} onChange={(e) => patch(s.id, { year: e.target.value ? +e.target.value : null })} aria-label={`Year for ${s.name}`} className={sel}>
                <option value="">No year</option>{Array.from({ length: Math.max(goal.year, year + 2) - year + 1 }, (_, j) => year + j).map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-zinc-500">Nothing pitching or locked for this year yet.</p>}
      {ideas > 0 && <p className="text-xs text-zinc-500">{ideas} more idea{ideas === 1 ? "" : "s"} for Year {year} on the <a href="#capital/plan-strategies" className="underline">capital board</a>.</p>}
    </section>
  );
}
