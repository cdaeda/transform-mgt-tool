"use client";

import { useEffect, useState } from "react";

type Action = { label: string; kind: "roll" | "capture" | "task" | "chat" | "deck" | "path" | "capital"; task_id: number | null; prompt: string };
type Move = { headline: string; why: string; action: Action; alternatives: { headline: string; action: Action }[]; roll_advice: string };
export type Go = (a: Action) => void;

const ICON: Record<Action["kind"], string> = { roll: "🎲", capture: "📷", task: "⚡", chat: "💬", deck: "▶", path: "🎯", capital: "💰" };

// The single most prominent thing on the dashboard: what to do next, and a button that does it.
export function NextMove({ go, version }: { go: Go; version: number }) {
  const [m, setM] = useState<{ content: Move; created_at: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const think = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/next-move", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    if (r.error) setErr(r.error);
    else setM(r);
    setBusy(false);
  };
  useEffect(() => {
    fetch("/api/next-move").then((r) => r.json()).then((d) => {
      setM(d);
      // Stale after 20 minutes: think again in the background.
      if (!d || Date.now() - new Date(d.created_at).getTime() > 20 * 60_000) void think();
    }, () => setM(null));
  }, [version]);

  const c = m?.content;
  return (
    <section className="rounded-xl bg-[var(--ink)] text-white p-5 shadow-lg relative overflow-hidden" aria-label="Next move" aria-busy={busy}>
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--gold)]" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow text-amber-300">Next move{m?.created_at && ` · ${new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</p>
        <button onClick={think} disabled={busy} className="text-xs text-white/70 hover:text-white disabled:opacity-50">{busy ? "Thinking…" : "↻ Think again"}</button>
      </div>
      {!c ? (
        <p className="mt-2 text-white/70">{m === undefined || busy ? "Working out the best next move from our numbers, cards and tasks…" : err || "No suggestion yet."}</p>
      ) : (
        <>
          <h2 className="mt-1 text-2xl sm:text-3xl leading-tight normal-case tracking-normal">{c.headline}</h2>
          <p className="mt-1 text-white/80 max-w-3xl">{c.why}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => go(c.action)} className="rounded-lg bg-[var(--gold)] text-[var(--ink)] px-4 py-2 font-bold shadow hover:brightness-110">{ICON[c.action.kind]} {c.action.label}</button>
            {c.alternatives.map((a) => (
              <button key={a.headline} onClick={() => go(a.action)} title={a.headline} className="rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10">{ICON[a.action.kind]} {a.action.label}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-white/75"><span className="font-semibold text-amber-300">🎲 Roll? </span>{c.roll_advice}</p>
        </>
      )}
      {err && c && <p className="mt-2 text-sm text-red-300">{err}</p>}
    </section>
  );
}
