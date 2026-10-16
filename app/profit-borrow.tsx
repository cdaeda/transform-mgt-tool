"use client";

import { useOverview } from "./overview-store";

type O = { year: number; plan: { revenue: number; expenses: number; net: number; debt: number; bmProfit10y: number } };
const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
};

// The team's two headline numbers (from the notes): what we make, revenue − expenses, and what we can
// borrow, 10 × revenue ÷ 2, less what's already drawn. Shown on Dashboard, Capital and Finance.
export function ProfitBorrow({ version }: { version: number }) {
  const o = useOverview<O>(version);
  const p = o?.data?.plan;
  if (!p || p.net === undefined) return <div className="game-card h-28 animate-pulse" aria-busy="true" />;
  const profit = p.revenue - p.expenses;
  const ability = (10 * p.revenue) / 2, room = ability - p.debt;
  return (
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
  );
}
