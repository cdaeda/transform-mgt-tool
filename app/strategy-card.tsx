"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Strategy } from "@/lib/db";
import type { StrategyDocT } from "@/lib/strategy-doc";

const HUE = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)" } as const;
const btn = "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50";

// Progressive disclosure: each block fades up as it scrolls into the panel.
function Reveal({ root, children }: { root: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { root: root.current, rootMargin: "0px 0px -8% 0px" });
    io.observe(el.current);
    return () => io.disconnect();
  }, [root]);
  return <div ref={el} className={`transition-all duration-700 motion-reduce:transition-none ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0"}`}>{children}</div>;
}

// The first thing on the dashboard: what Dragon Drive is, as of the latest strategy document,
// expanding into the full strategy and the H1 -> H3 roadmap as a vertical lineage.
export function StrategyCard({ version }: { version: number }) {
  const [doc, setDoc] = useState<{ content: StrategyDocT; created_at: string } | null>(null);
  const [st, setSt] = useState<(Strategy & { updated_at?: string }) | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const onScroll = () => {
    const p = panel.current;
    if (p) setProgress(p.scrollHeight > p.clientHeight ? p.scrollTop / (p.scrollHeight - p.clientHeight) : 1);
  };

  useEffect(() => {
    fetch("/api/strategy-doc").then((r) => r.json()).then(setDoc, () => {});
    fetch("/api/strategy").then((r) => r.json()).then(setSt, () => {});
  }, [version]);

  async function regenerate() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/strategy-doc", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setErr(r.error);
    else setDoc(r);
    setBusy(false);
  }

  const d = doc?.content;
  const asOf = doc?.created_at ?? st?.updated_at;
  const stale = doc && st?.updated_at && new Date(st.updated_at) > new Date(doc.created_at);

  return (
    <section className="relative rounded-xl border-2 border-amber-500/70 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/50 dark:to-zinc-900 p-5 sm:p-6 shadow-sm" aria-label="Our core strategy">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-amber-700 dark:text-amber-300">Our core strategy</p>
        {asOf && <p className="eyebrow text-zinc-500 text-right whitespace-nowrap">As of {new Date(asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>
      <h2 className="text-4xl sm:text-5xl leading-none mt-1">Dragon Drive</h2>
      <p className="font-display text-lg sm:text-xl text-zinc-700 dark:text-zinc-300 mt-1">{d?.tagline ?? st?.ambition}</p>
      <p className="mt-3 max-w-4xl">{d?.summary ?? st?.core_strategy}</p>

      {/* the three horizons at a glance */}
      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {(d?.roadmap ?? []).map((r) => (
          <li key={r.horizon} className="rounded-lg bg-white/70 dark:bg-zinc-900/60 border-l-4 px-3 py-2" style={{ borderColor: HUE[r.horizon] }}>
            <span className="eyebrow" style={{ color: HUE[r.horizon] }}>{r.horizon} · {r.when}</span>
            <p className="font-display uppercase tracking-wide leading-tight">{r.name}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        {d && <button onClick={() => (setProgress(0), setOpen(true))} aria-expanded={open} className={`${btn} bg-indigo-900 text-white`}>More ▾</button>}
        {d && <a href="/api/strategy-doc?download=doc" className={`${btn} border border-zinc-400 bg-white dark:bg-zinc-900`}>Download (Word)</a>}
        {d && <a href="/api/strategy-doc?download=html" target="_blank" rel="noopener" className={`${btn} border border-zinc-400 bg-white dark:bg-zinc-900`}>Open printable (save as PDF)</a>}
        <button onClick={regenerate} disabled={busy} className={`${btn} ${d ? "border border-amber-600 text-amber-800 dark:text-amber-300" : "bg-amber-600 text-white"}`}>
          {busy ? "Writing the latest version… (~2 min)" : d ? "Regenerate from latest" : "Write the strategy document"}
        </button>
        {stale && !busy && <span className="text-xs text-amber-800 dark:text-amber-300">! Strategy changed since this version — regenerate to update.</span>}
        {err && <span className="text-sm text-red-600">{err}</span>}
      </div>

      {open && d && (
        <>
          {/* reading progress across the top of the window */}
          <div className="fixed top-0 inset-x-0 h-1 z-[70] bg-zinc-200/60" aria-hidden>
            <div className="h-full bg-[var(--gold)] transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {/* floating panel: ends ~100px above the window bottom so the page underneath stays visible */}
          <div ref={panel} onScroll={onScroll} role="dialog" aria-label="Dragon Drive strategy in full"
            className="fixed z-[65] inset-x-2 sm:inset-x-8 lg:inset-x-[max(2rem,calc((100vw-72rem)/2))] top-3 bottom-[100px] overflow-y-auto overscroll-contain rounded-2xl border-2 border-amber-500/70 bg-surface shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center gap-2 px-4 sm:px-6 py-3 bg-surface/95 backdrop-blur border-b border-amber-500/30">
              <div className="min-w-0">
                <p className="eyebrow text-amber-700 dark:text-amber-300">Dragon Drive · strategy in full{asOf && ` · as of ${new Date(asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}</p>
                <p className="font-display uppercase tracking-wide truncate">{d.title}</p>
              </div>
              <span className="ml-auto eyebrow text-zinc-500 tabular-nums hidden sm:inline">{Math.round(progress * 100)}%</span>
              <a href="/api/strategy-doc?download=doc" className="hidden sm:inline rounded-md border border-zinc-300 px-2.5 py-1 text-sm">Word</a>
              <button onClick={() => setOpen(false)} className="rounded-md bg-indigo-900 text-white px-3 py-1 text-sm font-semibold" aria-label="Close the full strategy">✕ Close</button>
            </div>
            <div className="px-4 sm:px-6 py-5 space-y-6">
          <Reveal root={panel}><div className="space-y-3 max-w-4xl">
            {d.executive_summary.map((p, i) => <p key={i}>{p}</p>)}
          </div></Reveal>

          <div>
            <h3 className="text-xl mb-3">Roadmap · how we get there</h3>
            <ol className="relative">
              {d.roadmap.map((r, i) => (
                <Reveal key={r.horizon} root={panel}><li className="relative grid grid-cols-[2.5rem_1fr] sm:grid-cols-[8rem_2.5rem_1fr] gap-x-3 pb-8 last:pb-0">
                  {/* when (left column on wider screens) */}
                  <div className="hidden sm:block text-right pt-1">
                    <p className="eyebrow" style={{ color: HUE[r.horizon] }}>{r.horizon}</p>
                    <p className="font-display text-lg leading-tight">{r.when}</p>
                  </div>
                  {/* the lineage rail */}
                  <div className="relative flex justify-center">
                    {i < d.roadmap.length - 1 && <span className="absolute top-9 bottom-[-2rem] w-1 rounded-full" style={{ background: `linear-gradient(${HUE[r.horizon]}, ${HUE[d.roadmap[i + 1].horizon]})` }} aria-hidden />}
                    <span className="relative z-10 grid place-items-center w-9 h-9 rounded-full text-white font-display text-sm shadow" style={{ background: HUE[r.horizon] }}>{r.horizon}</span>
                  </div>
                  {/* what it entails (right) */}
                  <div className="game-card !p-4 space-y-2 min-w-0">
                    <p className="sm:hidden eyebrow" style={{ color: HUE[r.horizon] }}>{r.when}</p>
                    <h4 className="font-display text-xl uppercase tracking-wide leading-tight">{r.name}</h4>
                    <p><span className="font-semibold">Goal: </span>{r.goal}</p>
                    <div className="grid gap-3 md:grid-cols-2 text-sm">
                      <div><p className="eyebrow text-zinc-500 mb-1">What it entails</p><ul className="list-disc ml-4 space-y-0.5">{r.entails.map((x, j) => <li key={j}>{x}</li>)}</ul></div>
                      <div><p className="eyebrow text-zinc-500 mb-1">Milestones</p><ul className="list-disc ml-4 space-y-0.5">{r.milestones.map((x, j) => <li key={j}>{x}</li>)}</ul></div>
                    </div>
                    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3 text-sm border-t border-zinc-200 dark:border-zinc-800 pt-2">
                      <div><dt className="eyebrow text-zinc-500">Funded by</dt><dd>{r.funded_by}</dd></div>
                      <div><dt className="eyebrow text-zinc-500">KPI</dt><dd>{r.kpi}</dd></div>
                      <div><dt className="eyebrow text-zinc-500">Today</dt><dd>{r.status}</dd></div>
                    </dl>
                  </div>
                </li></Reveal>
              ))}
            </ol>
          </div>

          {d.sections.map((s) => (
            <Reveal key={s.heading} root={panel}><section className="max-w-4xl space-y-2">
              <h3 className="text-xl">{s.heading}</h3>
              {s.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              {s.bullets.length > 0 && <ul className="list-disc ml-5 space-y-0.5">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            </section></Reveal>
          ))}
          <Reveal root={panel}><div className="grid gap-4 md:grid-cols-2 max-w-5xl">
            <section><h3 className="text-xl mb-1">Risk factors</h3><ul className="list-disc ml-5 space-y-0.5 text-sm">{d.risks.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
            <section><h3 className="text-xl mb-1">Assumptions to confirm</h3><ul className="list-disc ml-5 space-y-0.5 text-sm">{d.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
          </div></Reveal>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
