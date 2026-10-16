"use client";

import { useOverview } from "./overview-store";

type O = {
  year: number;
  plan: { cash: number; debt: number; sharesIssued: number; lockedCash: number; bmRevenue: number; oneTime: number; net: number; ebitda: number; revenue: number; expenses: number };
};
const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
};

// The four numbers the team asks for first: cash, money raised, this year's revenue and profit.
export function KeyNumbers({ version }: { version: number }) {
  const o = useOverview<O>(version);
  const p = o?.data?.plan;
  if (!p || p.ebitda === undefined) return <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="game-card h-32 animate-pulse" />)}</div>;
  const y = o!.data.year;
  const raised = p.debt + p.lockedCash;
  const cards = [
    { k: "Cash we have", v: money(p.cash), tone: p.cash < 0 ? "neg" : "", lines: [`End of Year ${y} (cell N${33 + y})`, p.cash < 0 ? "Negative: this gap must be funded" : "What we can spend now"] },
    { k: "Raised so far", v: money(raised), tone: "", lines: [`Debt drawn ${money(p.debt)} (local bank loan)`, `New equity ${p.sharesIssued ? `${(p.sharesIssued / 1e6).toFixed(0)}M shares` : "none issued"}`, p.lockedCash ? `Locked capital strategies ${money(p.lockedCash)}` : "No capital strategy locked yet"] },
    { k: `Year ${y} revenue`, v: money(p.bmRevenue), tone: "", lines: ["From our business models (F" + (33 + y) + ")", p.oneTime ? `+ ${money(p.oneTime)} one-time (E${33 + y}; the audit says it's the loan, not revenue)` : "No one-time revenue"] },
    { k: `Year ${y} profit`, v: money(p.net), tone: p.net < 0 ? "neg" : "pos", lines: [`Net profit after interest, tax (M${33 + y})`, `EBITDA ${money(p.ebitda)}: operating profit before interest`, p.net < 0 && p.ebitda > 0 ? "The loss is interest: K" + (33 + y) + " (flagged by the audit)" : `Revenue − expenses ${money(p.revenue - p.expenses)}`] },
  ];
  return (
    <section className="grid gap-3 grid-cols-2 lg:grid-cols-4" aria-label="Key numbers">
      {cards.map((c) => (
        <div key={c.k} className={`rounded-xl border-2 p-4 bg-surface ${c.tone === "neg" ? "border-red-500" : c.tone === "pos" ? "border-green-700" : "border-[var(--gold)]"}`}>
          <p className="eyebrow text-zinc-600 dark:text-zinc-400">{c.k}</p>
          <p className={`font-display text-4xl sm:text-5xl tabular-nums leading-tight ${c.tone === "neg" ? "text-red-600" : c.tone === "pos" ? "text-green-700 dark:text-green-400" : ""}`}>{c.v}</p>
          {c.lines.map((l) => <p key={l} className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">{l}</p>)}
        </div>
      ))}
    </section>
  );
}
