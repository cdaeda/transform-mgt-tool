"use client";

import { useEffect, useState } from "react";
import type { FinancingIdea } from "@/lib/db";
import { refreshOverview, useOverview } from "./overview-store";

type O = { year: number; plan: { revenue: number; expenses: number; net: number; debt: number; bmProfit10y: number } };
const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
};

// The team's two headline numbers (from the notes): what we make, revenue − expenses, and what we can
// borrow, 10 × revenue ÷ 2, less what's already drawn. Shown on Dashboard, Capital and Finance.
export function ProfitBorrow({ version, plans = false }: { version: number; plans?: boolean }) {
  const o = useOverview<O>(version);
  const p = o?.data?.plan;
  if (!p || p.net === undefined) return <div className="game-card h-28 animate-pulse" aria-busy="true" />;
  const profit = p.revenue - p.expenses;
  const ability = (10 * p.revenue) / 2, room = ability - p.debt;
  return (
    <div className="space-y-3">
    <section className="grid gap-3 sm:grid-cols-2" aria-label="Net profit and borrowing ability">
      <div className={`rounded-xl border-2 p-4 ${profit < 0 ? "border-red-500 bg-red-50/60 dark:bg-red-950/20" : "border-green-700 bg-green-50/60 dark:bg-green-950/20"}`}>
        <p className="eyebrow text-zinc-600 dark:text-zinc-400">Net profit · Year {o!.data.year} · revenue − expenses</p>
        <p className={`font-display text-5xl tabular-nums leading-tight ${profit < 0 ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{money(profit)}</p>
        <p className="text-sm">{money(p.revenue)} revenue − {money(p.expenses)} expenses (BM costs + cost base + interest)</p>
        <p className="text-xs text-zinc-500 mt-1">Workbook net profit after tax &amp; depreciation: {money(p.net)}</p>
      </div>
      <div className={`rounded-xl border-2 p-4 ${room < 0 ? "border-red-500" : "border-[var(--gold)]"} bg-amber-50/50 dark:bg-amber-950/10`}>
        <p className="eyebrow text-zinc-600 dark:text-zinc-400">Borrowing ability · 10 × revenue ÷ 2</p>
        <p className="font-display text-5xl tabular-nums leading-tight">{money(ability)}</p>
        <p className="text-sm">
          Already borrowed {money(p.debt)} → <b className={room < 0 ? "text-red-600" : ""}>{money(room)} {room < 0 ? "over the limit" : "still available"}</b>
        </p>
        <p className="text-xs text-zinc-500 mt-1">The workbook&rsquo;s own cap (L227, 10-year BM profit ÷ 2) is {money(p.bmProfit10y / 2)}. Confirm which rule the facilitator applies. New debt also needs the lead lender&rsquo;s consent.</p>
      </div>
    </section>
    {plans ? <BorrowPlans version={version} /> : <a href="#finance/borrowing" className="inline-block text-sm font-semibold underline">What to borrow, and where it goes →</a>}
    </div>
  );
}

const HZ: Record<string, string> = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)", Finance: "var(--gold)" };

// Act on the borrowing ability: generated plans (how much, from whom, and where every dollar goes),
// saved to the capital board so the year plan and the simulator can use them.
function BorrowPlans({ version }: { version: number }) {
  const [plans, setPlans] = useState<FinancingIdea[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/financing").then((r) => r.json()).then((x) => Array.isArray(x) && setPlans(x.filter((f: FinancingIdea) => f.category === "Borrowing" && f.status !== "rejected").reverse()));
  useEffect(() => void load(), [version]);
  const generate = async () => {
    setBusy(`Designing borrowing plans from our numbers and goals… (about 2–3 min, started ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`);
    setMsg("");
    const r = await fetch("/api/capital/borrow", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setMsg(r.error ? `⚠ ${r.error}` : `✓ Added ${r.length} borrowing plans to the capital board.`);
    await load();
    refreshOverview();
    setBusy("");
  };
  const status = async (id: number, st: string) => {
    await fetch("/api/financing", { method: "PATCH", body: JSON.stringify({ id, status: st }) });
    await load();
    refreshOverview();
  };
  return (
    <section className="game-card space-y-3" aria-label="Borrowing plans">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg">What to borrow, and where it goes</h3>
          <p className="text-xs text-zinc-500">Plans sized to our borrowing ability, current profit and the $50B goal. Lock one to put it in the year-by-year plan and the simulator.</p>
        </div>
        <button onClick={generate} disabled={!!busy} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-[var(--gold)] text-[var(--ink)] disabled:opacity-50">✨ Suggest borrowing plans</button>
      </div>
      {busy && <p className="text-sm text-zinc-500 animate-pulse">{busy}</p>}
      {msg && !busy && <p className={`text-sm font-semibold ${msg.startsWith("⚠") ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{msg}</p>}
      {plans === null ? null : !plans.length ? <p className="text-sm text-zinc-500">No borrowing plans yet. Click &ldquo;Suggest borrowing plans&rdquo;.</p> : (
        <ul className="grid gap-3 lg:grid-cols-3">
          {plans.slice(0, 6).map((p) => (
            <li key={p.id} className={`rounded-lg border p-3 space-y-2 text-sm ${p.status === "locked" ? "border-green-700 bg-green-50/50 dark:bg-green-950/20" : p.status === "pitching" ? "border-amber-500" : "border-zinc-200 dark:border-zinc-800"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold leading-snug">{p.name}</p>
                <select value={p.status} onChange={(e) => status(p.id, e.target.value)} aria-label={`Status of ${p.name}`} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs">
                  {["idea", "pitching", "locked", "rejected"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <p className="text-xs text-zinc-500">{p.amount} · {p.cost} · Year {p.year ?? "?"} · AI: {p.recommendation} · ask: {p.pitch_to}</p>
              <p>{p.how_it_works}</p>
              {p.uses?.length > 0 && (
                <div>
                  <p className="eyebrow text-zinc-500">Where it goes</p>
                  <ul className="space-y-1 mt-1">
                    {p.uses.map((u, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="chip !text-[10px] shrink-0 self-start w-16 justify-center text-center mt-0.5" style={{ background: HZ[u.horizon] ?? "var(--gold)" }}>{u.horizon}</span>
                        <span><b className="tabular-nums">${u.amount_m}M</b> {u.what}<span className="block text-xs text-zinc-500">{u.why}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="text-xs"><summary className="cursor-pointer text-zinc-500">Fit, risks, why it&rsquo;s legal</summary>
                <p className="mt-1"><b>Fit:</b> {p.fit}</p><p><b>Risks:</b> {p.risks}</p><p><b>Legal basis:</b> {p.legal_basis}</p><p><b>Red lines:</b> {p.red_lines}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
