"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRIEFS, type BriefT } from "@/lib/brief";
import { ROLES } from "@/lib/roles";

const who = (id: string) => { const r = ROLES.find((x) => x.id === id); return r?.name ? `${r.name} · ${r.id}` : id; };
const SEV: Record<string, string> = { mild: "#15803d", sharp: "#d97706", severe: "#d2353f" };

// A short briefing deck answering a management task (e.g. the AI Bubble update). Arrows move, N toggles notes.
export function BriefView({ slug, embedded = false }: { slug: string; embedded?: boolean }) {
  const meta = BRIEFS[slug];
  const [brief, setBrief] = useState<{ content: BriefT; created_at: string } | null | undefined>(undefined);
  const [n, setN] = useState(0);
  const [notes, setNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => void fetch(`/api/brief/${slug}`).then((r) => r.json()).then(setBrief, () => setBrief(null)), [slug]);
  const slides = brief?.content.slides ?? [];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " "].includes(e.key)) setN((x) => Math.min(slides.length - 1, x + 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setN((x) => Math.max(0, x - 1));
      if (e.key.toLowerCase() === "n") setNotes((v) => !v);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slides.length]);
  async function write() {
    setBusy(true); setErr("");
    const r = await fetch(`/api/brief/${slug}`, { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setErr(r.error); else { setBrief(r); setN(0); }
    setBusy(false);
  }
  const words = slides.reduce((a, s) => a + s.notes.trim().split(/\s+/).length, 0), secs = Math.round((words / 170) * 60);
  const sc = brief?.content.scenarios ?? [];
  const s = slides[n];
  return (
    <div className={`${embedded ? "rounded-xl overflow-hidden" : "min-h-screen"} flex flex-col bg-zinc-900 print:bg-white`}>
      <header className="board-bar print:hidden flex flex-wrap items-center gap-3 px-4 py-2">
        {embedded ? <Link href={`/brief/${slug}`} className="rounded border border-white/30 px-2 py-0.5 text-sm text-white/90">⛶ Full screen</Link> : <Link href="/#presentation" className="wordmark text-lg">TRANSFORM!</Link>}
        <span className="font-display uppercase tracking-wide text-white/90">{brief?.content.title ?? meta?.label}</span>
        <span className="ml-auto flex items-center gap-2 text-sm text-white/85">
          {slides.length > 0 && <span className="tabular-nums">{n + 1} / {slides.length}</span>}
          {slides.length > 0 && <span className="tabular-nums rounded px-1.5 bg-white/15">⏱ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>}
          <button onClick={() => setNotes(!notes)} className="rounded border border-white/30 px-2 py-0.5">{notes ? "Hide" : "Show"} speaker notes (N)</button>
          <button onClick={() => window.print()} className="rounded border border-white/30 px-2 py-0.5">Print / PDF</button>
          {brief && <a href={`/api/brief/${slug}/pptx`} className="rounded border border-white/30 px-2 py-0.5">Download PowerPoint</a>}
          <button onClick={write} disabled={busy} className="rounded bg-[var(--gold)] text-[var(--ink)] font-semibold px-2 py-0.5 disabled:opacity-60">{busy ? "Writing… (~1–2 min)" : brief ? "Regenerate" : "Write it"}</button>
        </span>
      </header>
      {err && <p className="text-red-300 px-4 py-2">{err}</p>}
      {brief === undefined ? <p className="text-white/70 p-8">Loading…</p> : !brief ? (
        <div className="m-auto text-center text-white space-y-3 p-8">
          <p className="font-display text-3xl uppercase">{meta?.label}</p>
          <p className="text-white/70">Not written yet. Write it from our live numbers, strategy and plan.</p>
          <button onClick={write} disabled={busy} className="rounded-md bg-[var(--gold)] text-[var(--ink)] font-semibold px-4 py-2">{busy ? "Writing… (~1–2 min)" : "Write it"}</button>
        </div>
      ) : (
        <main className="flex-1 flex flex-col items-center justify-center gap-3 p-3 sm:p-6 print:block print:p-0">
          {slides.map((sl, k) => (
            <section key={k} aria-label={`Slide ${k + 1}`} aria-hidden={k !== n}
              className={`${k === n ? "flex" : "hidden"} print:flex print:break-after-page w-full max-w-6xl aspect-video flex-col rounded-xl overflow-hidden shadow-2xl bg-surface text-foreground print:shadow-none print:rounded-none`}>
              {sl.kind === "title" ? (
                <div className="certificate flex-1 !rounded-none p-10 flex flex-col justify-end">
                  <p className="relative eyebrow text-amber-300">{meta?.event}</p>
                  <h1 className="relative figure text-5xl sm:text-7xl mt-2">{brief.content.title}</h1>
                  <p className="relative font-display text-2xl text-white/90 mt-2 normal-case">{sl.headline}</p>
                  <p className="relative text-white/70 mt-4">{brief.content.subtitle}</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 grid grid-rows-[auto_1fr] p-6 sm:p-8 gap-4">
                  <div>
                    <p className="eyebrow text-amber-700 dark:text-amber-300">{sl.kind}</p>
                    <h2 className="text-2xl sm:text-3xl leading-tight normal-case tracking-normal">{sl.headline}</h2>
                  </div>
                  {sl.kind === "valuation" && (brief.content.valuation ?? []).length > 0 ? (
                    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6 items-center">
                      <ul className="space-y-2 text-lg">{sl.bullets.map((b, j) => <li key={j} className="flex gap-3"><span className="text-amber-600">▸</span><span>{b}</span></li>)}</ul>
                      <ValuationBars parts={brief.content.valuation} />
                    </div>
                  ) : sl.kind === "scenarios" || sl.kind === "impact" || sl.kind === "navigate" ? (
                    <div className="min-h-0 grid grid-cols-3 gap-3">
                      {sc.map((x) => (
                        <div key={x.name} className="rounded-lg border-t-4 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1.5 text-sm overflow-hidden" style={{ borderColor: SEV[x.severity] }}>
                          <p className="eyebrow" style={{ color: SEV[x.severity] }}>{x.severity}</p>
                          <p className="font-display text-xl uppercase leading-tight">{x.name}</p>
                          {sl.kind === "scenarios" && (<><p>{x.what_happens}</p><p className="eyebrow text-zinc-500 pt-1">Signals we watch</p><ul className="list-disc pl-4">{x.signals.map((t) => <li key={t}>{t}</li>)}</ul></>)}
                          {sl.kind === "impact" && <ul className="list-disc pl-4 space-y-1">{x.impact_on_us.map((t) => <li key={t}>{t}</li>)}</ul>}
                          {sl.kind === "navigate" && <ul className="list-disc pl-4 space-y-1">{x.our_moves.map((t) => <li key={t}>{t}</li>)}</ul>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-3 text-xl">{sl.bullets.map((b, j) => <li key={j} className="flex gap-3"><span className="text-amber-600">▸</span><span>{b}</span></li>)}</ul>
                  )}
                </div>
              )}
              <footer className="flex justify-between px-8 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
                <span>Flying Dragon · {meta?.label}</span><span>Presenter: {who(sl.speaker)}</span><span>{k + 1}</span>
              </footer>
            </section>
          ))}
          {notes && s && (
            <aside className="w-full max-w-6xl rounded-lg bg-zinc-800 text-zinc-100 p-4 print:hidden">
              <p className="eyebrow text-amber-300">Speaker notes · {who(s.speaker)}</p>
              {s.kind !== "title" && s.bullets.length > 0 && ["scenarios", "impact", "navigate"].includes(s.kind) && <ul className="text-sm text-zinc-300 list-disc pl-5 mt-1">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
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

// The sum of the parts against the price: one bar per part, then the total.
function ValuationBars({ parts }: { parts: { part: string; method: string; basis: string; value_b: number }[] }) {
  const total = parts.reduce((a, p) => a + p.value_b, 0), max = Math.max(total, ...parts.map((p) => p.value_b), 1);
  const colors = ["var(--core)", "var(--growth)", "var(--explore)", "#7c6aa8", "var(--gold)", "#0e7490"];
  return (
    <div className="space-y-2">
      {parts.map((p, i) => (
        <div key={p.part} className="grid grid-cols-[10rem_1fr_5rem] items-center gap-2 text-sm">
          <span className="text-right leading-tight">{p.part}<span className="block text-xs text-zinc-500">{p.method}</span></span>
          <span className="h-6 rounded bg-zinc-100 dark:bg-zinc-800 relative"><span className="absolute inset-y-0 left-0 rounded" style={{ width: `${(p.value_b / max) * 100}%`, background: colors[i % colors.length] }} /></span>
          <span className="tabular-nums font-semibold">${p.value_b.toFixed(1)}B</span>
        </div>
      ))}
      <div className="grid grid-cols-[10rem_1fr_5rem] items-center gap-2 text-sm font-bold border-t border-zinc-300 pt-2">
        <span className="text-right">Total</span>
        <span className="h-6 rounded bg-[var(--ink)]" style={{ width: `${(total / max) * 100}%` }} />
        <span className="tabular-nums">${total.toFixed(1)}B</span>
      </div>
      <p className="text-xs text-zinc-500">{parts.map((p) => `${p.part}: ${p.basis}`).join(" · ")}</p>
    </div>
  );
}
