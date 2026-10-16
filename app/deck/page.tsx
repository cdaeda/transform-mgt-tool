"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeckT } from "@/lib/deck";
import { ANALYST_NAMES, marketCap } from "@/lib/marketcap";
import { ROLES } from "@/lib/roles";
import { useOverview } from "../overview-store";

type Year = { revenue: number; ebitda: number; net: number; cash: number };
type Overview = {
  year: number;
  certificate: { caps: number[]; price: number[]; rank: string };
  kpis: { revenue: number; ebitda: number; net: number; cash: number };
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

function Visual({ kind, o, doc }: { kind: string; o: Overview; doc: Doc }) {
  const i = o.year - 1;
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

// Shareholder Day deck: Claude's narrative over live workbook visuals. Arrow keys to move, N for notes.
export default function DeckPage() {
  const o = useOverview<Overview>(0);
  const [deck, setDeck] = useState<{ content: DeckT; created_at: string } | null | undefined>(undefined);
  const [doc, setDoc] = useState<Doc>(null);
  const [n, setN] = useState(0);
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/deck").then((r) => r.json()).then(setDeck, () => setDeck(null));
    fetch("/api/strategy-doc").then((r) => r.json()).then(setDoc, () => {});
  }, []);
  const slides = deck?.content.slides ?? [];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) setN((x) => Math.min(slides.length - 1, x + 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setN((x) => Math.max(0, x - 1));
      if (e.key.toLowerCase() === "n") setNotes((v) => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slides.length]);

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
  const s = slides[n];
  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 print:bg-white">
      <header className="board-bar print:hidden flex flex-wrap items-center gap-3 px-4 py-2">
        <Link href="/#finance/investor-relations" className="wordmark text-lg">TRANSFORM!</Link>
        <span className="font-display uppercase tracking-wide text-white/90">{deck?.content.title ?? "Annual Shareholder Meeting & Analyst Day"}</span>
        <span className="ml-auto flex items-center gap-2 text-sm text-white/85">
          {slides.length > 0 && <span className="tabular-nums">{n + 1} / {slides.length}</span>}
          <button onClick={() => setNotes(!notes)} className="rounded border border-white/30 px-2 py-0.5">{notes ? "Hide" : "Show"} notes (N)</button>
          <button onClick={() => window.print()} className="rounded border border-white/30 px-2 py-0.5">Print / PDF</button>
          <button onClick={generate} disabled={busy} className="rounded bg-[var(--gold)] text-[var(--ink)] font-semibold px-2 py-0.5 disabled:opacity-60">{busy ? "Writing… (~2 min)" : deck ? "Regenerate" : "Write the deck"}</button>
        </span>
      </header>
      {err && <p className="text-red-300 px-4 py-2 print:hidden">{err}</p>}
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
                  <h1 className="relative figure text-6xl sm:text-8xl mt-2">Dragon Drive</h1>
                  <p className="relative font-display text-2xl sm:text-3xl text-white/90 mt-2 normal-case">{sl.headline}</p>
                  <p className="relative text-white/70 mt-4">{deck.content.subtitle}</p>
                </div>
              ) : (
                <div className="flex-1 grid grid-rows-[auto_1fr] p-8 sm:p-10 gap-6">
                  <div>
                    <p className="eyebrow text-amber-700 dark:text-amber-300">{sl.kind.replace("_", " ")}</p>
                    <h2 className="text-3xl sm:text-4xl leading-tight normal-case tracking-normal">{sl.headline}</h2>
                  </div>
                  <div className={`grid gap-8 items-center ${data && ["results", "market_cap", "roadmap", "ask"].includes(sl.kind) ? "lg:grid-cols-[1fr_1.3fr]" : ""}`}>
                    <ul className="space-y-3 text-xl">
                      {sl.bullets.map((b, j) => <li key={j} className="flex gap-3"><span className="text-amber-600">▸</span><span>{b}</span></li>)}
                    </ul>
                    {data && <Visual kind={sl.kind} o={data} doc={doc} />}
                  </div>
                </div>
              )}
              <footer className="flex justify-between px-8 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
                <span>Flying Dragon · {DECK_LABEL}</span><span>Presenter: {who(sl.speaker)}</span><span>{k + 1}</span>
              </footer>
            </section>
          ))}
          {notes && s && (
            <aside className="w-full max-w-6xl rounded-lg bg-zinc-800 text-zinc-100 p-4 print:hidden">
              <p className="eyebrow text-amber-300">Speaker notes · {who(s.speaker)}</p>
              <p className="mt-1 text-base leading-relaxed">{s.notes}</p>
            </aside>
          )}
          <nav className="flex gap-2 print:hidden" aria-label="Slides">
            {slides.map((_, k) => <button key={k} onClick={() => setN(k)} aria-label={`Go to slide ${k + 1}`} aria-current={k === n} className={`w-2.5 h-2.5 rounded-full ${k === n ? "bg-[var(--gold)]" : "bg-white/30"}`} />)}
          </nav>
        </main>
      )}
    </div>
  );
}

const DECK_LABEL = "Annual Shareholder Meeting & Analyst Day";
