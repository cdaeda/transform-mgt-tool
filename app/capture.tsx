"use client";

import { useEffect, useRef, useState } from "react";
import { SQUARES } from "@/lib/squares";
import type { Seed } from "./copilot";

// Shrink phone photos so the upload stays far under Vercel's 4.5 MB body limit.
export async function toJpegBase64(file: File) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

// One way in for everything: a card photo, a handout, or a typed thought. Claude works out the
// intent and opens a new copilot thread with options.
// preset: what a mobile quick action already captured (a photo) or asked for (the dice squares).
export function CaptureModal({ open, onClose, onSeed, onNote, preset = {} }: { open: boolean; onClose: () => void; onSeed: (s: Seed) => void; onNote: (text: string) => void; preset?: { image?: string; roll?: boolean } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<string | null>(preset.image ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [square, setSquare] = useState<string | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const reset = () => (setImage(null), setText(""), setErr(""), setBusy(false), setSquare(null));
  async function go() {
    if (!image && !text.trim() && !square) return;
    setBusy(true);
    setErr("");
    try {
      const sq = SQUARES.find((x) => x.name === square);
      const said = sq ? `We paid $100k to roll the dice and landed on "${sq.name}" (${sq.effect}). ${text}`.trim() : text;
      if (sq) {
        // Log the roll and book its $100k (critic-checked) in the background; report back in the chat.
        fetch("/api/rolls", { method: "POST", body: JSON.stringify({ square: sq.name, note: text }) })
          .then((x) => x.json())
          .then((d) => onNote(d.error ? `🎲 ${d.error}` : `🎲 Roll #${d.rollsThisYear} logged. ${d.roll.booked ? `+$100k booked to this year's cost base${d.pushError ? ` (⚠ ${d.pushError})` : " and written to the class sheet"}.` : `Cost NOT booked — the critic rejected it: ${d.audit?.summary ?? ""}`}`))
          .catch(() => onNote("🎲 Couldn't log the roll."));
      }
      const r = await fetch("/api/intake", { method: "POST", body: JSON.stringify({ image, text: said }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? r.statusText);
      onSeed({ title: d.title, image: image ?? undefined, text: said.trim() || undefined, opening: d.opening, chips: d.chips });
      reset();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="capture-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/50 bg-surface text-foreground">
      <div className="game-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="capture-title" className="text-xl">Capture</h2>
          <button onClick={onClose} className="rounded-md border border-zinc-300 px-2 py-0.5 text-sm" aria-label="Close">✕</button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Snap a card, a handout or a whiteboard — or just type. The copilot works out what it is and asks what to do.</p>
        <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2" open={!!square || preset.roll}>
          <summary className="cursor-pointer font-semibold text-sm">🎲 We rolled the dice ($100k) — where did we land?</summary>
          <div className="mt-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto" role="radiogroup" aria-label="Square we landed on">
            {SQUARES.map((q) => (
              <button key={q.name} type="button" role="radio" aria-checked={square === q.name} title={q.effect} onClick={() => setSquare(square === q.name ? null : q.name)}
                className={`rounded-full px-2.5 py-1 text-xs border ${square === q.name ? "bg-amber-500 border-amber-600 text-[var(--ink)] font-semibold" : "border-zinc-300 dark:border-zinc-700"}`}>
                {q.name}
              </button>
            ))}
          </div>
          {square && <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2">{SQUARES.find((q) => q.name === square)?.effect} · logs the roll and adds $100k to this year&rsquo;s cost base.</p>}
        </details>
        <div className="grid gap-2 sm:grid-cols-[auto_1fr] items-start">
          <label className="rounded-lg border-2 border-dashed border-amber-500 w-full sm:w-36 h-28 grid place-items-center text-center text-sm cursor-pointer overflow-hidden bg-amber-50 dark:bg-amber-950/30">
            {image
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              ? <img src={`data:image/jpeg;base64,${image}`} alt="Captured" className="w-full h-full object-cover" />
              : <span>📷<br />Take or choose a photo</span>}
            <input type="file" accept="image/*" capture="environment" className="sr-only"
              onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setImage(await toJpegBase64(f)); }} />
          </label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or type: a card's text, a question, “we drew a BUST, -250M”, “what should the CFO say about our 5 Sell ratings?”"
            aria-label="What happened or what you want" className="w-full h-28 rounded-md border border-zinc-300 dark:border-zinc-700 p-2 text-sm"
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && go()} />
        </div>
        {image && <button onClick={() => setImage(null)} className="text-xs underline">Remove photo</button>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm border border-zinc-300">Cancel</button>
          <button onClick={go} disabled={busy || (!image && !text.trim() && !square)} className="rounded-md px-4 py-1.5 text-sm font-semibold bg-indigo-900 text-white disabled:opacity-50">
            {busy ? "Reading it…" : "Figure it out →"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
