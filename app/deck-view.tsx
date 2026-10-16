"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DeckT } from "@/lib/deck";
import { ANALYST_NAMES, marketCap } from "@/lib/marketcap";
import { ROLES } from "@/lib/roles";
import { TOOL_SLIDES, type ToolShot, type ToolSlide } from "@/lib/tool-slides";
import { ComebackChart, useRounds } from "./comeback";
import { DragonMark } from "./dragon-mark";
import { useOverview } from "./overview-store";
import { Infusion, Ladder, WhyPrice, useCards, useInvestorCase } from "./outlook";
import { infusionSlide, whyPriceSlide } from "@/lib/outlook";

type Year = { revenue: number; ebitda: number; net: number; cash: number };
type Overview = {
  year: number;
  certificate: { caps: number[]; price: number[]; rank: string };
  kpis: { revenue: number; ebitda: number; net: number; cash: number };
  sim?: { net: number[] };
  health?: { workbookUpdated: string | null };
  plan: { units: { core: number; growth: number; explore: number }; analysts: number[]; cashForCap: number };
  teams: { team: number; years: Year[] }[];
};
type Doc = { content: { roadmap: { horizon: "H1" | "H2" | "H3"; name: string; when: string; goal: string }[] } } | null;

const HUE = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)" } as const;
const money = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : `${s}$${(a / 1e3).toFixed(0)}k`;
};
const capM = (m: number) => money(m * 1e6);
const who = (id: string) => { const r = ROLES.find((x) => x.id === id); return r?.name ? `${r.name} · ${r.id}` : id; };

// Horizontal bars around a zero line (handles losses), labelled directly.
function Bars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const hasNeg = items.some((i) => i.value < 0);
  return (
    <div className="space-y-3">
      {items.map((i) => {
        const w = (Math.abs(i.value) / max) * (hasNeg ? 50 : 100);
        return (
          <div key={i.label} className="grid grid-cols-[9rem_1fr_7rem] items-center gap-3">
            <span className="text-right text-lg">{i.label}</span>
            <div className="relative h-8 rounded bg-zinc-100 dark:bg-zinc-800">
              {hasNeg && <span className="absolute inset-y-0 left-1/2 w-px bg-zinc-400" />}
              <span className="absolute inset-y-1 rounded" style={{ width: `${w}%`, left: hasNeg ? (i.value < 0 ? `${50 - w}%` : "50%") : 0, background: i.value < 0 ? "#d2353f" : i.color }} />
            </div>
            <span className={`tabular-nums text-xl font-semibold ${i.value < 0 ? "text-red-600" : ""}`}>{money(i.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Visual({ kind, o, doc, rounds }: { kind: string; o: Overview; doc: Doc; rounds: Parameters<typeof ComebackChart>[0]["rounds"] }) {
  const i = o.year - 1;
  const ic = useInvestorCase(0);
  if (kind === "turnaround") {
    // Year 1 -> Year 2 -> entering Year 3: the workbook's market cap and net profit, the snapshots in between.
    const years = Array.from({ length: Math.max(3, o.year + 1) }, (_, j) => j + 1).slice(0, Math.max(3, o.year + 1));
    return (
      <ol className="grid gap-3 relative" style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))` }}>
        <span className="absolute top-5 left-[12%] right-[12%] h-1 rounded bg-gradient-to-r from-red-500 via-[var(--gold)] to-green-600" aria-hidden />
        {years.map((y) => {
          const cap = o.certificate.caps[y - 1], net = o.sim?.net?.[y - 1], ahead = y > o.year;
          const snaps = rounds.filter((r) => r.year === y);
          return (
            <li key={y} className="relative text-center space-y-1">
              <span className={`mx-auto grid place-items-center w-11 h-11 rounded-full font-display text-white shadow ${ahead ? "bg-indigo-700" : cap !== undefined && cap < 0 ? "bg-red-600" : "bg-green-700"}`}>Y{y}</span>
              <p className="eyebrow text-zinc-500">{y === 1 ? "The low point" : ahead ? "Entering now" : "The recovery"}</p>
              {!ahead && cap !== undefined && <p className={`font-display text-2xl tabular-nums ${cap < 0 ? "text-red-600" : "text-green-700"}`}>{capM(cap)}</p>}
              {ahead && <p className="font-display text-2xl text-indigo-700">The dragon sheds</p>}
              {!ahead && net !== undefined && <p className="text-sm text-zinc-600">net profit {money(net)}</p>}
              {snaps.length > 0 && <p className="text-xs text-zinc-500">{snaps.map((r) => r.label).join(" · ")}</p>}
            </li>
          );
        })}
      </ol>
    );
  }
  if (kind === "infusion" && ic?.sim) return <InfusionVisual />;
  if (kind === "why_price" && ic) return <WhyPrice rows={ic.run(ic.saved).rows} o={ic.saved} />;
  if ((kind === "earnings" || kind === "acquisition") && ic) {
    const { rows, roi } = ic.run(ic.saved);
    const ps = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
    if (kind === "earnings")
      return (
        <div className="space-y-3">
          <Bars items={rows.map((r) => ({ label: `Y${r.year} ${r.company === "Flying Dragon" ? "" : r.company}${r.year === ic.base.now ? "" : "*"}`, value: r.net, color: r.company === "Flying Dragon" ? "var(--growth)" : "var(--explore)" }))} />
          <table className="w-full text-lg tabular-nums"><tbody>
            <tr><th className="text-left font-normal text-zinc-500">EPS</th>{rows.map((r) => <td key={r.year} className={`text-right ${r.eps < 0 ? "text-red-600" : ""}`}>{ps(r.eps)}</td>)}</tr>
            <tr><th className="text-left font-normal text-zinc-500">Share price</th>{rows.map((r) => <td key={r.year} className="text-right">{ps(r.price)}</td>)}</tr>
            <tr><th className="text-left font-normal text-zinc-500">DPS</th>{rows.map((r) => <td key={r.year} className="text-right">{ps(r.dps)}</td>)}</tr>
          </tbody></table>
          <p className="text-xs text-zinc-500 text-center">Net profit by year · * team assumptions, not forecasts</p>
        </div>
      );
    return <Ladder r={rows[rows.length - 1]} roi={roi} o={ic.saved} className="grid gap-1.5 grid-cols-2 text-sm" />;
  }
  if (kind === "progress") return <div className="space-y-2"><DragonMark size={110} className="mx-auto" /><ComebackChart rounds={rounds} height={220} /></div>;
  if (kind === "results")
    return <Bars items={[
      { label: "Revenue", value: o.kpis.revenue, color: "var(--core)" },
      { label: "EBITDA", value: o.kpis.ebitda, color: "var(--growth)" },
      { label: "Net profit", value: o.kpis.net, color: "var(--explore)" },
      { label: "Cash", value: o.kpis.cash, color: "var(--gold)" },
    ]} />;
  if (kind === "market_cap") {
    const mc = marketCap({ ...o.plan.units, analysts: o.plan.analysts, cash: o.plan.cashForCap });
    return (
      <div className="space-y-3">
        <Bars items={[
          { label: "Business models", value: mc.portfolio * 1e6, color: "var(--growth)" },
          { label: "Analyst ratings", value: mc.analysts * 1e6, color: "var(--explore)" },
          { label: "Cash × 100", value: mc.cashTerm * 1e6, color: "var(--gold)" },
          { label: "Market cap", value: mc.total * 1e6, color: "var(--core)" },
        ]} />
        <p className="text-base text-zinc-500 text-center">{o.plan.units.core} Core · {o.plan.units.growth} Growth · {o.plan.units.explore} Explore · analysts: {ANALYST_NAMES.map((n, j) => (o.plan.analysts[j] ? `${o.plan.analysts[j]} ${n}` : "")).filter(Boolean).join(", ") || "none"}</p>
      </div>
    );
  }
  if (kind === "roadmap" && doc?.content.roadmap?.length)
    return (
      <ol className="grid grid-cols-3 gap-4 relative">
        <span className="absolute top-6 left-[16%] right-[16%] h-1 rounded" style={{ background: "linear-gradient(90deg, var(--core), var(--growth), var(--explore))" }} aria-hidden />
        {doc.content.roadmap.map((r) => (
          <li key={r.horizon} className="relative text-center space-y-2">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full text-white font-display text-lg shadow" style={{ background: HUE[r.horizon] }}>{r.horizon}</span>
            <p className="eyebrow" style={{ color: HUE[r.horizon] }}>{r.when}</p>
            <p className="font-display text-xl uppercase leading-tight">{r.name}</p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">{r.goal}</p>
          </li>
        ))}
      </ol>
    );
  if (kind === "ask") {
    const now = o.certificate.caps[i] ?? 0, pct = Math.max(0, Math.min(100, (now / 50000) * 100));
    return (
      <div className="space-y-3">
        <div className="flex justify-between text-lg"><span>Today {capM(now)}</span><span className="text-amber-600 font-semibold">$50B</span></div>
        <div className="h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"><div className="h-full bg-[var(--gold)]" style={{ width: `${Math.max(pct, 1)}%` }} /></div>
      </div>
    );
  }
  return null;
}

// Where each slide's story lives in the tool: "Show in the tool" jumps there and highlights it.
type Jump = { label: string; hash: string; sel: string };
const LINKS: Record<string, Jump[]> = {
  title: [{ label: "Share certificate", hash: "dashboard", sel: '[aria-label="Market cap"]' }, { label: "Our core strategy", hash: "dashboard", sel: '[aria-label="Our core strategy"]' }],
  turnaround: [{ label: "Turnaround in snapshots", hash: "capital/investor-relations", sel: '[aria-label="Rising from the ashes"]' }, { label: "Our valuation now", hash: "finance/what-if", sel: '[aria-label="Our valuation"]' }],
  progress: [{ label: "Rising from the ashes", hash: "capital/investor-relations", sel: '[aria-label="Rising from the ashes"]' }],
  achievements: [{ label: "Decisions by team member", hash: "activity", sel: '[aria-label="Major decisions by team member"]' }, { label: "Our cards", hash: "cards", sel: '[aria-label="Sections"] + .tab-panel' }],
  results: [{ label: "Net profit & borrowing ability", hash: "dashboard", sel: '[aria-label="Net profit and borrowing ability"]' }],
  market_cap: [{ label: "Market cap thermometer", hash: "dashboard", sel: '[aria-label="Market cap thermometer"]' }, { label: "Rating goal", hash: "capital/analyst-ratings", sel: '[aria-label="Rating goal"]' }],
  roadmap: [{ label: "Horizon tuner", hash: "dashboard", sel: '[aria-label="Horizon tuner"]' }, { label: "Strategy knob", hash: "finance/what-if", sel: '[aria-label="Strategy knob"]' }],
  deliver: [{ label: "Year-by-year plan", hash: "capital/lever-planner", sel: '[aria-label="Year-by-year plan"]' }, { label: "Simulator", hash: "finance/simulator", sel: '[aria-label="Simulator"]' }],
  earnings: [{ label: "Earnings outlook", hash: "capital/investor-case", sel: '[aria-label="Investor case"]' }],
  infusion: [{ label: "What your capital does", hash: "capital/investor-case", sel: '[aria-label="What your capital does"]' }],
  why_price: [{ label: "Why the sale price", hash: "capital/investor-case", sel: '[aria-label="Why the sale price"]' }],
  acquisition: [{ label: "Investor case", hash: "capital/investor-case", sel: '[aria-label="From revenue to return"]' }, { label: "Exit scenario", hash: "finance/simulator", sel: '[aria-label="Exit scenario"]' }],
  ask: [{ label: "$50B goal path", hash: "dashboard", sel: '[aria-label*="B by Year"]' }, { label: "Borrowing plans", hash: "finance/borrowing", sel: '[aria-label="Borrowing plans"]' }, { label: "Comparable valuations", hash: "capital/comparables", sel: '[aria-label="Comparable valuations"]' }],
};
const SHOT_LINKS: Record<string, Jump> = {
  "copilot-workbook-audit": { label: "Copilot", hash: "dashboard", sel: '[aria-label="Copilot"]' },
  "strategy-knob": { label: "Strategy knob", hash: "finance/what-if", sel: '[aria-label="Strategy knob"]' },
  "analyst-rating-goal": { label: "Rating goal", hash: "capital/analyst-ratings", sel: '[aria-label="Rating goal"]' },
  "capital-playbook-dial": { label: "Capital playbook", hash: "capital/plan-strategies", sel: '[aria-label="Generate strategies"]' },
  "top-funding-plays": { label: "Top funding plays", hash: "capital/research", sel: '[aria-label="Top funding plays"]' },
  "vendor-partner-financing": { label: "Financing research", hash: "capital/research", sel: '[aria-label="Top funding plays"]' },
  "year-by-year-plan": { label: "Year-by-year plan", hash: "capital/lever-planner", sel: '[aria-label="Year-by-year plan"]' },
  "lever-planner-how-we-pay-for-it": { label: "Lever planner", hash: "capital/lever-planner", sel: '[aria-label="Paths"]' },
};
const shotLink = (src: string) => SHOT_LINKS[src.split("/").pop()!.replace(/\.\w+$/, "")];

function Links({ links, jump }: { links: Jump[]; jump: (j: Jump) => void }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2 print:hidden" aria-label="Show in the tool">
      <span className="eyebrow text-zinc-400 self-center">Show in the tool</span>
      {links.map((l) => <button key={l.label} onClick={() => jump(l)} className="rounded-full border border-[var(--gold)] text-amber-300 px-3 py-1 text-sm hover:bg-white/10">↗ {l.label}</button>)}
    </div>
  );
}

// The Shareholder Day presentation: Claude's narrative over live workbook visuals. A tab in the tool
// (embedded) and full screen at /deck. Arrow keys move, N toggles speaker notes (hidden by default).
export function DeckView({ embedded = false }: { embedded?: boolean }) {
  const o = useOverview<Overview>(0);
  const { rounds } = useRounds();
  const [deck, setDeck] = useState<{ content: DeckT; created_at: string } | null | undefined>(undefined);
  const [doc, setDoc] = useState<Doc>(null);
  const [n, setN] = useState(0);
  const [notes, setNotes] = useState(false);
  const router = useRouter();
  const jump = (j: Jump) => {
    try {
      sessionStorage.setItem("deck.slide", String(n)); // come back to this slide
      sessionStorage.setItem("present.hl", j.sel);
      sessionStorage.setItem("present.return", embedded ? "#presentation" : "/deck");
    } catch { /* ignore */ }
    if (embedded) window.location.hash = j.hash;
    else router.push(`/#${j.hash}`);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/deck").then((r) => r.json()).then((d) => {
      setDeck(d);
      // Back from a "Show in the tool" jump: reopen the slide we left from.
      try {
        const k = Number(sessionStorage.getItem("deck.slide"));
        if (k) setN(k);
        sessionStorage.removeItem("deck.slide");
      } catch { /* storage blocked: start at slide 1 */ }
    }, () => setDeck(null));
    fetch("/api/strategy-doc").then((r) => r.json()).then(setDoc, () => {});
  }, []);
  // The deck's own slides, plus the built-in "Why $60B" slide right after the acquisition slide.
  const icDeck = useInvestorCase(0);
  const why = icDeck && icDeck.saved.saleYear ? whyPriceSlide(icDeck.run(icDeck.saved).rows, icDeck.saved) : null;
  const deckCards = useCards();
  const inf = icDeck?.sim ? infusionSlide(icDeck.sim, icDeck.saved, deckCards) : null;
  const slides = (deck?.content.slides ?? []).flatMap((sl) =>
    sl.kind === "acquisition" && why ? [sl, { ...why, speaker: sl.speaker } as unknown as typeof sl]
      : sl.kind === "deliver" && inf ? [sl, { ...inf, speaker: sl.speaker } as unknown as typeof sl] : [sl]);
  const count = slides.length ? slides.length + TOOL_SLIDES.length : 0; // appendix: how we use the tool
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) setN((x) => Math.min(count - 1, x + 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setN((x) => Math.max(0, x - 1));
      if (e.key.toLowerCase() === "n") setNotes((v) => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [count]);

  async function generate() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/deck", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setErr(r.error);
    else {
      setDeck(r);
      setN(0);
    }
    setBusy(false);
  }

  const data = o?.data?.plan ? o.data : null;
  // 3-minute limit: speaking time from the notes at ~170 words a minute.
  const secs = (t: string) => Math.round((t.trim().split(/\s+/).length / 170) * 60);
  const total = slides.reduce((s2, x) => s2 + secs(x.notes), 0);
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  const s = slides[n];
  return (
    <div className={`${embedded ? "rounded-xl overflow-hidden" : "min-h-screen"} flex flex-col bg-zinc-900 print:bg-white`}>
      <header className="board-bar print:hidden flex flex-wrap items-center gap-3 px-4 py-2">
        {embedded ? <Link href="/deck" className="rounded border border-white/30 px-2 py-0.5 text-sm text-white/90">⛶ Full screen</Link> : <Link href="/#presentation" className="wordmark text-lg">TRANSFORM!</Link>}
        <span className="font-display uppercase tracking-wide text-white/90">{deck?.content.title ?? "Annual Shareholder Meeting & Analyst Day"}</span>
        <span className="ml-auto flex items-center gap-2 text-sm text-white/85">
          {slides.length > 0 && <span className="tabular-nums">{n + 1} / {count}</span>}
          {slides.length > 0 && <span className={`tabular-nums rounded px-1.5 ${total > 180 ? "bg-red-600 text-white" : "bg-white/15"}`} title="Speaking time at ~170 words a minute">⏱ {mmss(total)} / 3:00</span>}
          <button onClick={() => setNotes(!notes)} className="rounded border border-white/30 px-2 py-0.5">{notes ? "Hide" : "Show"} speaker notes (N)</button>
          <button onClick={() => window.print()} className="rounded border border-white/30 px-2 py-0.5">Print / PDF</button>
          {deck && <a href="/api/deck/pptx" className="rounded border border-white/30 px-2 py-0.5">Download PowerPoint</a>}
          <button onClick={generate} disabled={busy} className="rounded bg-[var(--gold)] text-[var(--ink)] font-semibold px-2 py-0.5 disabled:opacity-60">{busy ? "Writing… (~2 min)" : deck ? "Regenerate" : "Write the deck"}</button>
        </span>
      </header>
      {err && <p className="text-red-300 px-4 py-2 print:hidden">{err}</p>}
      {/* The workbook moved on after this deck was written: its narrative numbers may be out of date. */}
      {deck && o?.data?.health?.workbookUpdated && new Date(o.data.health.workbookUpdated) > new Date(deck.created_at) && !busy && (
        <p className="print:hidden bg-amber-500 text-[var(--ink)] px-4 py-2 text-sm font-semibold flex flex-wrap items-center gap-3">
          ⚠ The workbook changed since this deck was written ({new Date(deck.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}): the charts are live, but the text may quote old numbers.
          <button onClick={generate} className="rounded bg-[var(--ink)] text-white px-2 py-0.5">Regenerate now</button>
        </p>
      )}
      {deck === undefined ? <p className="text-white/70 p-8">Loading…</p> : !deck ? (
        <div className="m-auto text-center text-white space-y-3 p-8">
          <p className="font-display text-3xl uppercase">Annual Shareholder Meeting & Analyst Day</p>
          <p className="text-white/70">No deck yet. Write one from our live numbers, strategy and cards.</p>
          <button onClick={generate} disabled={busy} className="rounded-md bg-[var(--gold)] text-[var(--ink)] font-semibold px-4 py-2">{busy ? "Writing… (~2 min)" : "Write the deck"}</button>
        </div>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center gap-3 p-3 sm:p-6 print:block print:p-0">
          {slides.map((sl, k) => (
            <section key={k} aria-label={`Slide ${k + 1}`} aria-hidden={k !== n}
              className={`${k === n ? "flex" : "hidden"} print:flex print:break-after-page w-full max-w-6xl aspect-video flex-col rounded-xl overflow-hidden shadow-2xl bg-surface text-foreground print:shadow-none print:rounded-none`}>
              {sl.kind === "title" ? (
                <div className="certificate flex-1 !rounded-none p-10 flex flex-col justify-end">
                  <p className="relative eyebrow text-amber-300">{DECK_LABEL} · Year {data?.year ?? ""}</p>
                  <DragonMark size={150} className="absolute right-10 top-10 opacity-90" />
                  <h1 className="relative figure text-6xl sm:text-8xl mt-2">Terralink</h1>
                  <p className="relative font-display text-2xl sm:text-3xl text-white/90 mt-2 normal-case">{sl.headline}</p>
                  <p className="relative text-white/70 mt-4">{deck.content.subtitle}</p>
                </div>
              ) : (
                <div className="flex-1 grid grid-rows-[auto_1fr] p-8 sm:p-10 gap-6">
                  <div>
                    <p className="eyebrow text-amber-700 dark:text-amber-300">{sl.kind.replace("_", " ")}</p>
                    <h2 className="text-3xl sm:text-4xl leading-tight normal-case tracking-normal">{sl.headline}</h2>
                  </div>
                  <div className={`grid gap-8 items-center ${data && ["turnaround", "progress", "results", "earnings", "market_cap", "roadmap", "acquisition", "ask"].includes(sl.kind) ? "lg:grid-cols-[1fr_1.3fr]" : ["why_price", "infusion"].includes(sl.kind as string) ? "lg:grid-cols-[1fr_2fr]" : ""}`}>
                    <ul className="space-y-3 text-xl">
                      {sl.bullets.map((b, j) => <li key={j} className="flex gap-3"><span className="text-amber-600">▸</span><span>{b}</span></li>)}
                    </ul>
                    {data && <Visual kind={sl.kind} o={data} doc={doc} rounds={rounds ?? []} />}
                  </div>
                </div>
              )}
              <footer className="flex justify-between px-8 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
                <span>Flying Dragon · {DECK_LABEL}</span><span>Presenter: {who(sl.speaker)}</span><span>{k + 1}</span>
              </footer>
            </section>
          ))}
          {TOOL_SLIDES.map((t, j) => <ToolSlideView key={`tool-${j}`} t={t} k={slides.length + j} n={n} />)}
          <div className="w-full max-w-6xl"><Links jump={jump} links={s ? LINKS[s.kind] ?? [] : (TOOL_SLIDES[n - slides.length]?.shots ?? []).map((x) => shotLink(x.src)).filter((x, i, a) => x && a.findIndex((y) => y?.label === x.label) === i)} /></div>
          {notes && !s && n >= slides.length && (
            <aside className="w-full max-w-6xl rounded-lg bg-zinc-800 text-zinc-100 p-4 print:hidden">
              <p className="eyebrow text-amber-300">Appendix · not part of the 3:00 · show if asked how we run the company</p>
            </aside>
          )}
          {notes && s && (
            <aside className="w-full max-w-6xl rounded-lg bg-zinc-800 text-zinc-100 p-4 print:hidden">
              <p className="eyebrow text-amber-300">Speaker notes · {who(s.speaker)} · ⏱ {mmss(secs(s.notes))}</p>
              <p className="mt-1 text-base leading-relaxed">{s.notes}</p>
            </aside>
          )}
          <nav className="flex gap-2 print:hidden" aria-label="Slides">
            {Array.from({ length: count }, (_, k) => <button key={k} onClick={() => setN(k)} aria-label={`Go to slide ${k + 1}`} aria-current={k === n} className={`w-2.5 h-2.5 rounded-full ${k === n ? "bg-[var(--gold)]" : "bg-white/30"}`} />)}
          </nav>
        </main>
      )}
    </div>
  );
}

const DECK_LABEL = "Annual Shareholder Meeting & Analyst Day";

function Shot({ s }: { s: ToolShot }) {
  return (
    <figure className="min-h-0 flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- static screenshots */}
      <img src={s.src} width={s.w} height={s.h} alt={s.caption} className="min-h-0 flex-1 w-full object-contain object-top rounded-md border border-zinc-200 dark:border-zinc-700 bg-white" />
      <figcaption className="text-xs text-zinc-500 leading-snug">{s.caption}</figcaption>
    </figure>
  );
}

// Appendix: real screenshots of the Mgt Tool in use. A tall shot (the copilot) gets its own column.
function ToolSlideView({ t, k, n }: { t: ToolSlide; k: number; n: number }) {
  return (
    <section aria-label={`Slide ${k + 1}`} aria-hidden={k !== n}
      className={`${k === n ? "flex" : "hidden"} print:flex print:break-after-page w-full max-w-6xl aspect-video flex-col rounded-xl overflow-hidden shadow-2xl bg-surface text-foreground print:shadow-none print:rounded-none`}>
      <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] p-6 sm:p-8 gap-4">
        <div>
          <p className="eyebrow text-amber-700 dark:text-amber-300">Appendix · how we use the Mgt Tool</p>
          <h2 className="text-2xl sm:text-3xl leading-tight normal-case tracking-normal">{t.headline}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{t.lede}</p>
        </div>
        {t.tall ? (
          <div className="min-h-0 grid grid-cols-[1fr_2.4fr] gap-4">
            <Shot s={t.shots[0]} />
            <div className="min-h-0 grid grid-rows-3 gap-3">{t.shots.slice(1).map((x) => <Shot key={x.src} s={x} />)}</div>
          </div>
        ) : (
          <div className="min-h-0 grid grid-cols-2 grid-rows-2 gap-3">{t.shots.map((x) => <Shot key={x.src} s={x} />)}</div>
        )}
      </div>
      <footer className="flex justify-between px-8 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
        <span>Flying Dragon · {DECK_LABEL}</span><span>Appendix</span><span>{k + 1}</span>
      </footer>
    </section>
  );
}

// The infusion slide's visual: the same table as Capital > Investor case, read-only.
function InfusionVisual() {
  const ic = useInvestorCase(0), cards = useCards();
  if (!ic?.sim) return null;
  return <Infusion sim={ic.sim} o={ic.saved} cards={cards} />;
}
