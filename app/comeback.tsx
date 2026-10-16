"use client";

import { useCallback, useEffect, useState } from "react";
import { DragonMark } from "./dragon-mark";

type Round = { id: number; created_at: string; label: string; year: number; data: { cap: number; price: number; rank: string; net: number } };
const capM = (m: number) => { const a = Math.abs(m), s = m < 0 ? "−" : ""; return a < 0.5 ? "$0" : `${s}$${a >= 1000 ? `${(a / 1000).toFixed(2)}B` : `${a.toFixed(0)}M`}`; };

export const useRounds = (version = 0) => {
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const load = useCallback(() => fetch("/api/rounds").then((r) => r.json()).then((x) => Array.isArray(x) && setRounds(x)), []);
  useEffect(() => void load(), [load, version]);
  return { rounds, load };
};

// "Rising from the ashes": market cap at each key round, from the low point up.
export function ComebackChart({ rounds, height = 180 }: { rounds: Round[]; height?: number }) {
  if (!rounds.length) return <p className="text-sm text-zinc-500">No snapshots yet.</p>;
  const caps = rounds.map((r) => r.data.cap);
  const low = Math.min(...caps), lowIdx = caps.indexOf(low), last = caps[caps.length - 1];
  const lo = Math.min(0, low), hi = Math.max(1000, ...caps) * 1.15;
  const W = 640, H = height, padX = 40, x = (k: number) => (rounds.length === 1 ? W / 2 : padX + (k / (rounds.length - 1)) * (W - 2 * padX));
  const y = (v: number) => 16 + (H - 48) * (1 - (v - lo) / (hi - lo));
  const line = rounds.map((r, k) => `${k ? "L" : "M"}${x(k)},${y(r.data.cap)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Market cap by round: from a low of ${capM(low)} to ${capM(last)} now`}>
      <defs><linearGradient id="cb-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--gold)" stopOpacity="0" /></linearGradient></defs>
      <line x1={padX - 20} x2={W - padX + 20} y1={y(0)} y2={y(0)} stroke="var(--color-zinc-300)" strokeDasharray="3 4" />
      <text x={W - padX + 18} y={y(0) - 4} textAnchor="end" fontSize="10" className="fill-zinc-500">$0</text>
      {rounds.length > 1 && <path d={`${line} L${x(rounds.length - 1)},${H - 30} L${x(0)},${H - 30} Z`} fill="url(#cb-fill)" />}
      <path d={line} fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {rounds.map((r, k) => (
        <g key={r.id}>
          <circle cx={x(k)} cy={y(r.data.cap)} r={k === lowIdx || k === rounds.length - 1 ? 6 : 4} fill={r.data.cap < 0 ? "#d2353f" : "var(--gold)"} stroke="var(--surface)" strokeWidth="2" />
          <text x={x(k)} y={H - 12} textAnchor="middle" fontSize="10" className="fill-zinc-500">{r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}</text>
          {(k === lowIdx || k === rounds.length - 1) && (
            <text x={x(k)} y={y(r.data.cap) - 12} textAnchor="middle" fontSize="12" fontWeight="700" className={r.data.cap < 0 ? "fill-red-600" : "fill-current"}>
              {k === lowIdx && k !== rounds.length - 1 ? `Low point ${capM(r.data.cap)}` : capM(r.data.cap)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function Comeback({ version }: { version: number }) {
  const { rounds, load } = useRounds(version);
  const [busy, setBusy] = useState(false);
  if (!rounds) return <div className="game-card h-48 animate-pulse" aria-busy="true" />;
  const caps = rounds.map((r) => r.data.cap);
  const low = caps.length ? Math.min(...caps) : 0, now = caps[caps.length - 1] ?? 0;
  const snap = async () => {
    const label = prompt("Name this snapshot (e.g. 'Year 1 · after Analyst Day'):", `Year ${rounds[rounds.length - 1]?.year ?? 1} · round ${rounds.length + 1}`);
    if (!label) return;
    setBusy(true);
    await fetch("/api/rounds", { method: "POST", body: JSON.stringify({ label }) });
    await load();
    setBusy(false);
  };
  return (
    <section className="game-card space-y-2" aria-label="Rising from the ashes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DragonMark size={84} />
          <div>
          <h3 className="text-lg">Rising from the ashes</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {rounds.length < 2 ? `Our baseline is set at ${capM(low)} — from here, every round is progress.` : now > low ? `Up ${capM(now - low)} from our low point of ${capM(low)}.` : `Holding at ${capM(now)} — the climb starts with the next round.`}
          </p>
          </div>
        </div>
        <button onClick={snap} disabled={busy} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-indigo-900 text-white disabled:opacity-50">📸 Snapshot this round</button>
      </div>
      <ComebackChart rounds={rounds} />
      <p className="text-xs text-zinc-500">Snapshots are taken when you click, and automatically whenever a sync brings new Team 1 numbers. The Shareholder Day deck tells this story.</p>
    </section>
  );
}
