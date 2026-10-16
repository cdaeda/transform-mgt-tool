"use client";

import { useEffect, useState } from "react";
import type { Card } from "@/lib/db";
import { unitsCol } from "@/lib/impact";
import { Comeback } from "./comeback";
import { useOverview } from "./overview-store";

type TeamFin = { team: number; company: string; location: string; years: { completed: boolean; revenue: number; ebitda: number; net: number; cash: number; cap: number; eps: number }[] };
type Overview = { year: number; certificate: { caps: number[]; price: number[]; eps: number[]; rank: string }; teams: TeamFin[] };

const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(0)}k` : `${s}$${a.toFixed(0)}`;
};
const capM = (m: number) => money(m * 1e6);
const per = (n: number, d: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(d)}`;
const btn = "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50";

// Every team's finances, read from their own tab in the class sheet (cached snapshot).
export function RivalFinances({ version }: { version: number }) {
  const o = useOverview<Overview>(version);
  const d = o?.data?.teams ? o.data : null;
  if (!d) return <div className="game-card h-40 animate-pulse" aria-busy="true" />;
  const i = d.year - 1;
  const rows = [...d.teams].sort((a, b) => (b.years[i]?.cap ?? 0) - (a.years[i]?.cap ?? 0));
  const max = Math.max(1, ...d.teams.flatMap((t) => t.years.map((y) => Math.abs(y.cap))));
  return (
    <section className="space-y-2" aria-label="All teams' finances">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg">All six teams · Year {d.year}</h2>
        <span className="text-xs text-zinc-500">From each team&rsquo;s tab in the class sheet · ranked by market cap</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left eyebrow text-zinc-500">
              <th className="py-1 pr-2">#</th><th className="pr-2">Team</th><th className="pr-2 text-right">Market cap</th><th className="pr-2 text-right">Revenue</th>
              <th className="pr-2 text-right">EBITDA</th><th className="pr-2 text-right">Net profit</th><th className="pr-2 text-right">Cash</th><th className="pr-2 text-right">EPS</th><th className="pl-2">Market cap Y1–10</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, r) => {
              const y = t.years[i];
              return (
                <tr key={t.team} className={`border-t border-zinc-200 dark:border-zinc-800 ${t.team === 1 ? "bg-amber-50 dark:bg-amber-950/40 font-semibold" : ""}`}>
                  <td className="py-1.5 pr-2 tabular-nums">{r + 1}</td>
                  <td className="pr-2 whitespace-nowrap">Team {t.team}{t.company && ` · ${t.company}`}{t.team === 1 && " (us)"}</td>
                  {[capM(y.cap), money(y.revenue), money(y.ebitda), money(y.net), money(y.cash), per(y.eps, 3)].map((v, j) => (
                    <td key={j} className={`pr-2 text-right tabular-nums whitespace-nowrap ${v.startsWith("−") ? "text-red-600" : ""}`}>{v}</td>
                  ))}
                  <td className="pl-2">
                    <div className="flex items-end gap-[2px] h-6" role="img" aria-label={`Team ${t.team} market cap by year`}>
                      {t.years.map((yy, j) => (
                        <span key={j} title={`Y${j + 1}: ${capM(yy.cap)}`} className={`w-2 rounded-sm ${yy.cap < 0 ? "bg-[#d2353f]" : j === i ? "bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                          style={{ height: `${Math.max(2, (Math.abs(yy.cap) / max) * 24)}px` }} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// The five innovation strategies, our innovation cards and the CVC portfolio.
const STRATEGIES = ["Build", "Buy", "Partner", "Co-Invest", "Co-Develop"] as const;
const strategyOf = (c: Card) => STRATEGIES.find((s) => new RegExp(`\\b${s}\\b`, "i").test(`${c.title} ${c.card_text}`)) ?? "Build";

export function InnovationPanel({ ask, version }: { ask: (t: string) => void; version: number }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [cvc, setCvc] = useState<(string | number | null)[][]>([]);
  useEffect(() => {
    fetch("/api/cards").then((r) => r.json()).then((c) => Array.isArray(c) && setCards(c), () => {});
    fetch(`/api/sheet?range=${encodeURIComponent("A298:D313")}`).then((r) => r.json()).then((d) => setCvc((d.values ?? []).filter((r: unknown[]) => r[0])), () => {});
  }, [version]);
  const inno = cards.filter((c) => c.type === "Innovation Strategy");
  const explore = cards.filter((c) => c.type === "Explore");
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-xl">Innovation strategy pipeline</h2>
        <button onClick={() => ask("Propose our innovation plan for this year across Build, Buy, Partner, Co-Invest and Co-Develop: which innovation strategies to activate (they need cash), how each feeds H2 satellite data or H3 ecosystem partners, what it costs and how we fund it. Be specific and use our cards and numbers.")}
          className={`${btn} bg-amber-600 text-white`}>Ask the CFO for our innovation plan</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STRATEGIES.map((s) => {
          const mine = inno.filter((c) => strategyOf(c) === s);
          return (
            <section key={s} className="game-card !p-3 space-y-2">
              <h3 className="text-lg leading-none">{s}</h3>
              {mine.length ? (
                <ul className="space-y-1 text-sm">{mine.map((c) => <li key={c.id}><b>{c.title}</b> <span className="text-xs text-zinc-500">· {c.status}{c.primary_horizon && ` · ${c.primary_horizon}`}</span></li>)}</ul>
              ) : <p className="text-sm text-zinc-500">No cards yet. Photograph one on the Cards tab.</p>}
            </section>
          );
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="game-card space-y-2">
          <h3 className="text-lg">Explore business models</h3>
          {explore.length ? (
            <ul className="space-y-1 text-sm">{explore.map((c) => <li key={c.id}><b>{c.title}</b> <span className="text-xs text-zinc-500">· {c.status} · AI {c.recommendation}</span></li>)}</ul>
          ) : <p className="text-sm text-zinc-500">No Explore cards logged in the app yet.</p>}
        </section>
        <section className="game-card space-y-2">
          <h3 className="text-lg">CVC portfolio <span className="eyebrow text-zinc-500">workbook A298:D313</span></h3>
          {cvc.length ? (
            <table className="w-full text-sm"><thead><tr className="eyebrow text-zinc-500 text-left"><th>Investment</th><th className="text-right">Invested</th><th className="text-right">Last valuation</th><th className="text-right">Realized</th></tr></thead>
              <tbody>{cvc.map((r, j) => <tr key={j} className="border-t border-zinc-200 dark:border-zinc-800"><td>{String(r[0])}</td>{[1, 2, 3].map((k) => <td key={k} className="text-right tabular-nums">{typeof r[k] === "number" ? money(r[k] as number) : String(r[k] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-zinc-500">No CVC investments in the workbook yet. Co-Invest cards and hydrogen bolt-ons land here.</p>}
        </section>
      </div>
    </div>
  );
}

// Investor relations: what the market sees, the analyst cards we hold, and investor moments.
export function InvestorRelationsPanel({ ask, version }: { ask: (t: string) => void; version: number }) {
  const o = useOverview<Overview>(version);
  const d = o?.data?.certificate ? o.data : null;
  const [analysts, setAnalysts] = useState<number[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(() => {
    if (!d) return;
    const u = unitsCol(d.year);
    fetch(`/api/sheet?range=${u}252:${u}256`).then((r) => r.json()).then((x) => setAnalysts((x.values ?? []).map((r: unknown[]) => Number(r[0]) || 0)), () => {});
    fetch("/api/cards").then((r) => r.json()).then((c) => Array.isArray(c) && setCards(c), () => {});
  }, [d?.year, version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="game-card h-40 animate-pulse" aria-busy="true" />;
  const i = d.year - 1;
  const events = cards.filter((c) => /^Management/.test(c.type) || c.type === "Analyst");
  const ratings = ["Outperform", "Buy", "Hold", "Sell", "Crash"];
  const peers = [...d.teams].sort((a, b) => b.years[i].cap - a.years[i].cap);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-xl">Investor relations</h2>
        <div className="flex gap-2 flex-wrap">
          <a href="#presentation" className={`${btn} bg-indigo-900 text-white`}>▶ Open the presentation</a>
          <button onClick={() => ask("Draft our equity story for investors in 150 words: Dragon Drive, the three horizons, how we pay for it, and what turns our analyst ratings around. Use live numbers; [placeholders] where unconfirmed.")} className={`${btn} bg-amber-600 text-white`}>Draft our equity story</button>
          <button onClick={() => ask("Which analyst cards are hurting our market cap this year, and the fastest legitimate moves (board squares, Management Events, cards) to earn Buy or Outperform ratings? Rank them.")} className={`${btn} border border-zinc-400`}>How do we fix our ratings?</button>
        </div>
      </div>
      <Comeback version={version} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="game-card"><p className="eyebrow text-zinc-500">Share price · Y{d.year}</p><p className="font-display text-3xl">{per(d.certificate.price[i], 2)}</p></div>
        <div className="game-card"><p className="eyebrow text-zinc-500">EPS · Y{d.year}</p><p className="font-display text-3xl">{per(d.certificate.eps[i], 3)}</p></div>
        <div className="game-card"><p className="eyebrow text-zinc-500">Leaderboard</p><p className="font-display text-3xl">{d.certificate.rank || "—"}</p></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="game-card space-y-2">
          <h3 className="text-lg">Analyst ratings we hold · Y{d.year}</h3>
          <dl className="grid grid-cols-5 text-center">
            {ratings.map((r, j) => (
              <div key={r}><dd className={`font-display text-3xl tabular-nums ${j >= 3 && analysts[j] ? "text-red-600" : j <= 1 && analysts[j] ? "text-green-700" : ""}`}>{analysts[j] ?? 0}</dd><dt className="eyebrow text-zinc-500">{r}</dt></div>
            ))}
          </dl>
          <p className="text-xs text-zinc-500">Per share: Outperform +$2.50 · Buy +$1.00 · Hold +$0.01 · Sell −$1.00 · Crash −$2.50.</p>
        </section>
        <section className="game-card space-y-2">
          <h3 className="text-lg">Where we stand vs peers</h3>
          <ol className="space-y-1 text-sm">
            {peers.map((t, r) => (
              <li key={t.team} className={`flex justify-between ${t.team === 1 ? "font-semibold" : ""}`}>
                <span>{r + 1}. Team {t.team}{t.company && ` · ${t.company}`}{t.team === 1 && " (us)"}</span>
                <span className={`tabular-nums ${t.years[i].cap < 0 ? "text-red-600" : ""}`}>{capM(t.years[i].cap)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="game-card space-y-2">
        <h3 className="text-lg">Investor moments</h3>
        {events.length ? (
          <ul className="space-y-1 text-sm">{events.map((c) => <li key={c.id}><span className="chip mr-2" data-type={c.type}>{c.type}</span><b>{c.title}</b> <span className="text-xs text-zinc-500">· AI {c.recommendation} · {c.status}</span></li>)}</ul>
        ) : <p className="text-sm text-zinc-500">No shareholder meetings, capital markets updates or analyst cards logged yet. Photograph them on the Cards tab and they appear here with a draft response.</p>}
      </section>
    </div>
  );
}
