"use client";

import { useCallback, useEffect, useState } from "react";
import type { Strat, Today } from "@/lib/capital";
import type { FinancingIdea } from "@/lib/db";
import { ANALYST_NAMES } from "@/lib/marketcap";
import { GoalPath } from "./goal";
import { Markdown } from "./markdown";
import { refreshOverview, useOverview } from "./overview-store";

type Overview = {
  year: number; goal: { year: number; cap: number };
  plan: { units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number; shares: number };
};
const COLS = [
  { id: "idea", label: "Ideas", hint: "Suggested levers" },
  { id: "pitching", label: "Pitching", hint: "We're asking someone to say yes" },
  { id: "locked", label: "Locked in", hint: "Committed in our plan" },
] as const;
const REC: Record<string, string> = { USE: "text-green-700 dark:text-green-400", CONSIDER: "text-amber-600", AVOID: "text-red-600" };
const btn = "rounded-md px-2.5 py-1 text-xs font-semibold";

function effectText(f: FinancingIdea["effect"]) {
  if (!f) return "Not sized yet";
  const parts = [
    f.cash_m && `${f.cash_m > 0 ? "+" : ""}$${f.cash_m}M cash`,
    f.explore && `${f.explore > 0 ? "+" : ""}${f.explore} Explore`, f.growth && `${f.growth > 0 ? "+" : ""}${f.growth} Growth`, f.core && `${f.core > 0 ? "+" : ""}${f.core} Core`,
    ...ANALYST_NAMES.map((n, i) => (f.analysts?.[i] ? `${f.analysts[i] > 0 ? "+" : ""}${f.analysts[i]} ${n}` : "")),
    f.shares_m && `${f.shares_m > 0 ? "+" : ""}${f.shares_m}M shares`, f.interest_m && `$${f.interest_m}M/yr interest`,
  ].filter(Boolean);
  return parts.join(" · ") || "No direct effect on market cap";
}

export function CapitalPanel({ version, ask }: { version: number; ask: (t: string) => void }) {
  const o = useOverview<Overview>(version);
  const [ideas, setIdeas] = useState<FinancingIdea[] | null>(null);
  const [dial, setDial] = useState(8);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [withPitching, setWithPitching] = useState(true);
  const [showRejected, setShowRejected] = useState(false);

  const load = useCallback(() => fetch("/api/financing").then((r) => r.json()).then((x) => Array.isArray(x) && setIdeas(x)), []);
  useEffect(() => void load(), [load, version]);
  const patch = async (id: number, p: Partial<FinancingIdea>) => {
    setIdeas((xs) => xs?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);
    await fetch("/api/financing", { method: "PATCH", body: JSON.stringify({ id, ...p }) });
    refreshOverview();
  };
  const run = async (label: string, url: string, body?: unknown) => {
    setBusy(label);
    setErr("");
    const r = await fetch(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setErr(r.error);
    await load();
    refreshOverview();
    setBusy("");
  };

  const d = o?.data?.plan ? o.data : null;
  if (!d || !ideas) return <div className="game-card h-64 animate-pulse" aria-busy="true" />;
  const today: Today = { ...d.plan.units, analysts: d.plan.analysts, cash: d.plan.cashForCap, shares: d.plan.shares, year: d.year };
  const strats: Strat[] = ideas.map((i) => ({ id: i.id, name: i.name, status: i.status, year: i.year, scale: i.scale ?? 1, effect: i.effect }));
  const unsized = ideas.filter((i) => !i.effect && i.status !== "rejected").length;
  const years = Array.from({ length: d.goal.year - d.year + 1 }, (_, k) => d.year + k);

  return (
    <div className="space-y-5">
      <GoalPath today={today} strats={strats} goalYear={d.goal.year} goalCap={d.goal.cap} includePitching={withPitching} />
      <label className="flex items-center gap-2 text-sm -mt-2">
        <input type="checkbox" checked={withPitching} onChange={(e) => setWithPitching(e.target.checked)} className="accent-amber-600" />
        Include strategies we&rsquo;re still pitching in the projection
      </label>

      {/* the aggressiveness dial */}
      <section className="game-card space-y-3" aria-label="Generate strategies">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl">Capital playbook</h2>
          {dial >= 8 && <span className="text-xs text-zinc-500 italic">&ldquo;Be aggressive to the point where it almost feels illegal — but is completely legal.&rdquo;</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <label className="block">
            <span className="flex justify-between text-sm"><span>Aggressiveness</span><span className="font-display text-xl tabular-nums">{dial}/10 · {dial <= 3 ? "Conservative" : dial <= 6 ? "Bold" : dial <= 8 ? "Aggressive" : "Edge of legal"}</span></span>
            <input type="range" min={1} max={10} value={dial} onChange={(e) => setDial(Number(e.target.value))} aria-label="Aggressiveness, 1 to 10" className="w-full accent-amber-600" />
            <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional focus, e.g. 'turn the Sell ratings', 'fund H2 satellite data', 'no new debt'"
              aria-label="Focus" className="mt-2 w-full rounded-md border border-zinc-300 dark:border-zinc-700 p-1.5 text-sm" />
          </label>
          <div className="flex flex-col gap-2">
            <button onClick={() => run("Designing strategies… (~2 min)", "/api/capital/generate", { aggressiveness: dial, focus })} disabled={!!busy}
              className="rounded-md px-4 py-2 text-sm font-bold bg-[var(--gold)] text-[var(--ink)] disabled:opacity-50">✨ Generate 6 strategies</button>
            {unsized > 0 && <button onClick={() => run("Sizing strategies… (~1 min)", "/api/capital/size")} disabled={!!busy} className="rounded-md px-3 py-1.5 text-sm border border-zinc-400">Size {unsized} unsized idea{unsized === 1 ? "" : "s"}</button>}
          </div>
        </div>
        {busy && <p className="text-sm text-zinc-500 animate-pulse">{busy}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </section>

      {/* the board: ideas -> pitching -> locked */}
      <div className="grid gap-3 lg:grid-cols-3">
        {COLS.map((col) => {
          const items = ideas.filter((i) => i.status === col.id).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.aggressiveness ?? 0) - (a.aggressiveness ?? 0));
          return (
            <section key={col.id} aria-label={col.label} className="rounded-xl bg-zinc-100/70 dark:bg-zinc-900/60 p-2 space-y-2">
              <h3 className="text-base px-1 flex justify-between"><span>{col.label} <span className="text-xs normal-case tracking-normal text-zinc-500 font-sans">· {col.hint}</span></span><span className="tabular-nums text-zinc-500">{items.length}</span></h3>
              {items.map((i) => (
                <article key={i.id} className={`game-card !p-3 space-y-1.5 ${col.id === "locked" ? "ring-2 ring-green-700" : ""}`}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {i.rank && <span className="font-display text-amber-600">#{i.rank}</span>}
                    <b className="text-sm">{i.name}</b>
                    <span className={`eyebrow ${REC[i.recommendation] ?? ""}`}>{i.recommendation}</span>
                    {i.aggressiveness && <span className="eyebrow text-zinc-500">· {i.aggressiveness}/10</span>}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{effectText(i.effect)}</p>
                  {i.effect && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <label className="flex items-center gap-1">Size
                        <input type="range" min={0} max={2} step={0.25} value={i.scale ?? 1} onChange={(e) => patch(i.id, { scale: Number(e.target.value) })} aria-label={`Size of ${i.name}`} className="w-20 accent-amber-600" />
                        <span className="tabular-nums w-9">{Math.round((i.scale ?? 1) * 100)}%</span>
                      </label>
                      <label className="flex items-center gap-1">Lands
                        <select value={i.year ?? d.year} onChange={(e) => patch(i.id, { year: Number(e.target.value) })} aria-label={`Year ${i.name} lands`} className="rounded border border-zinc-300 dark:border-zinc-700">
                          {years.map((y) => <option key={y} value={y}>Y{y}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-zinc-500">How · legal basis · red lines · who decides</summary>
                    <div className="space-y-1 mt-1">
                      <Markdown>{i.how_it_works}</Markdown>
                      {i.legal_basis && <p><b className="text-green-700 dark:text-green-400">Legal because: </b>{i.legal_basis}</p>}
                      {i.red_lines && <p><b className="text-red-600">Red lines: </b>{i.red_lines}</p>}
                      {i.pitch_to && <p><b>Who must say yes: </b>{i.pitch_to}</p>}
                      {i.fit && <p><b>Fit: </b>{i.fit}</p>}
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-1.5">
                    {col.id === "idea" && <button onClick={() => (patch(i.id, { status: "pitching" }), ask(`Draft the pitch for capital strategy #${i.id} "${i.name}" to ${i.pitch_to || "whoever must say yes"}: the ask, what's in it for them, the numbers, the legal basis, and the objections we'll hear with answers. Then tell me what has to be true to lock it in.`))} className={`${btn} bg-indigo-900 text-white`}>🎤 Pitch it</button>}
                    {col.id !== "locked" && <button onClick={() => patch(i.id, { status: "locked" })} className={`${btn} bg-green-700 text-white`}>🔒 Lock in</button>}
                    {col.id === "locked" && <button onClick={() => patch(i.id, { status: "pitching" })} className={`${btn} border border-zinc-400`}>Unlock</button>}
                    <button onClick={() => patch(i.id, { status: "rejected" })} className={`${btn} border border-zinc-300 text-zinc-500`}>Reject</button>
                  </div>
                </article>
              ))}
              {!items.length && <p className="text-xs text-zinc-500 px-1">{col.id === "idea" ? "Generate strategies above." : col.id === "pitching" ? "Pitch an idea to start." : "Lock in the strategies you'll commit to — the $50B projection uses them."}</p>}
            </section>
          );
        })}
      </div>
      <button onClick={() => setShowRejected(!showRejected)} className="text-xs underline">{showRejected ? "Hide" : "Show"} rejected ({ideas.filter((i) => i.status === "rejected").length})</button>
      {showRejected && (
        <ul className="text-xs space-y-1">{ideas.filter((i) => i.status === "rejected").map((i) => <li key={i.id}>{i.name} <button onClick={() => patch(i.id, { status: "idea" })} className="underline ml-1">restore</button></li>)}</ul>
      )}
    </div>
  );
}
