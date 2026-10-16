"use client";

import { useEffect, useState } from "react";
import { refreshOverview } from "./overview-store";

// The game year and round we're in: shown in the header, set by anyone. New cards are tagged with it,
// and every tab reads the current year from it.
export function YearRound({ version, onChange }: { version: number; onChange: () => void }) {
  const [s, setS] = useState<{ current_year: number; current_round: number } | null>(null);
  useEffect(() => void fetch("/api/strategy").then((r) => r.json()).then((x) => x?.current_year && setS(x), () => {}), [version]);
  if (!s) return null;
  const set = (k: "current_year" | "current_round", v: number) => {
    setS({ ...s, [k]: v });
    fetch("/api/strategy", { method: "PUT", body: JSON.stringify({ [k]: v }) }).then(() => (refreshOverview(), onChange()));
  };
  const sel = "bg-transparent font-display text-base text-[var(--gold)] cursor-pointer focus:outline-none [&>option]:text-black";
  return (
    <span className="flex items-center gap-1 rounded-full border border-[var(--gold)]/70 px-2.5 py-0.5" title="The game year and round we're in. New cards are tagged with it.">
      <select value={s.current_year} onChange={(e) => set("current_year", +e.target.value)} aria-label="Game year" className={sel}>
        {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>Year {i + 1}</option>)}
      </select>
      <span className="text-white/50">·</span>
      <select value={s.current_round} onChange={(e) => set("current_round", +e.target.value)} aria-label="Round" className={sel}>
        {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}
      </select>
    </span>
  );
}
