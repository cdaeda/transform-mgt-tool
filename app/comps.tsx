"use client";

import { useEffect, useState } from "react";

type Comp = {
  id: number; batch: string; grp: string; horizon: string; company: string; ticker: string; valuation_usd_b: number | null; basis: string;
  as_of: string; revenue_usd_b: number | null; revenue_period: string; ev_revenue: number | null; source_name: string; source_url: string; why: string; caveat: string;
};
const HUE: Record<string, string> = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)" };
const b = (n: number | null) => (n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}B` : `$${(n * 1000).toFixed(0)}M`);

// Comparable valuations for investors: what the market pays today for businesses like the ones we're
// building. Researched live (each figure dated and sourced); refresh before any investor meeting.
export function Comps({ ask }: { ask: (t: string) => void }) {
  const [rows, setRows] = useState<Comp[] | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/comps").then((r) => r.json()).then((x) => setRows(Array.isArray(x) ? x : []), () => setRows([]));
  useEffect(() => void load(), []);
  const refresh = async () => {
    setBusy(`Researching current valuations on the web… (about 2–4 min, started ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`);
    setMsg("");
    const r = await fetch("/api/comps", { method: "POST", body: JSON.stringify({ extra }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setMsg(r.error ? `⚠ ${r.error}` : `✓ Updated ${r.length} comparables.`);
    await load();
    setBusy("");
  };
  const groups = [...new Set((rows ?? []).map((r) => r.grp))];
  const asOf = rows?.[0]?.batch ? new Date(rows[0].batch).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <section className="game-card space-y-4" aria-label="Comparable valuations">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Comparable valuations</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">What the market pays today for businesses like the ones we&rsquo;re building. Each figure carries its date and source{asOf && ` · researched ${asOf}`}. Token and crypto values move daily, so refresh before an investor meeting.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Add companies, e.g. Planet Labs, Stripe" aria-label="Add companies"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-sm w-60" />
          <button onClick={refresh} disabled={!!busy} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-[var(--gold)] text-[var(--ink)] disabled:opacity-50">↻ Refresh with live research</button>
        </div>
      </div>
      {busy && <p className="text-sm text-zinc-500 animate-pulse">{busy}</p>}
      {msg && !busy && <p className={`text-sm font-semibold ${msg.startsWith("⚠") ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{msg}</p>}
      {rows === null ? <div className="h-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" aria-busy="true" /> : !rows.length ? (
        <p className="text-sm text-zinc-500">No comparables yet. Click &ldquo;Refresh with live research&rdquo;.</p>
      ) : groups.map((g) => {
        const items = rows.filter((r) => r.grp === g);
        return (
          <div key={g} className="space-y-2">
            <h3 className="text-base flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: HUE[items[0].horizon] ?? "var(--gold)" }} />{g}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[44rem]">
                <thead><tr className="text-left eyebrow text-zinc-500">
                  <th className="py-1 pr-2">Company</th><th className="pr-2 text-right">Valuation</th><th className="pr-2">Basis · date</th><th className="pr-2 text-right">Revenue</th><th className="pr-2 text-right">× revenue</th><th>Why investors compare / caveat</th>
                </tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800 align-top">
                      <td className="py-2 pr-2"><b>{r.company}</b><span className="block text-xs text-zinc-500">{r.ticker}</span></td>
                      <td className="py-2 pr-2 text-right font-display text-lg tabular-nums">{b(r.valuation_usd_b)}</td>
                      <td className="py-2 pr-2 text-xs">{r.basis}<span className="block text-zinc-500">{r.as_of}</span>
                        {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline text-zinc-500">{r.source_name || "source"} ↗</a>}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{b(r.revenue_usd_b)}<span className="block text-xs text-zinc-500">{r.revenue_period}</span></td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.ev_revenue === null ? "—" : `${r.ev_revenue.toFixed(1)}×`}</td>
                      <td className="py-2 text-xs">{r.why}<span className="block text-zinc-500 mt-0.5">⚠ {r.caveat}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {rows && rows.length > 0 && (
        <button onClick={() => ask(`Using our comparable valuations (${rows.map((r) => `${r.company} ${r.ticker}: ${b(r.valuation_usd_b)} ${r.basis} as of ${r.as_of}${r.revenue_usd_b !== null ? `, revenue ${b(r.revenue_usd_b)}` : ""}`).join("; ")}), write the investor read-out for Flying Dragon: which comparable fits each horizon (H2 Dragon Nexus, H3 network, Dragon Credits and settlement), what milestone would make each comparison credible for us, and what we must NOT claim. No invented numbers; [placeholders] for anything we haven't shown.`)}
          className="rounded-md px-3 py-1.5 text-sm font-semibold bg-amber-600 text-white">✨ Draft the investor read-out</button>
      )}
    </section>
  );
}
