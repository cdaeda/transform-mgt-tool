"use client";

import { useState } from "react";
import { refreshOverview } from "./overview-store";
import { CardTimeline } from "./simulator";
import { useMyRole } from "./tasks";

type C = { id: number; title: string; type: string; status: string; capex: number; start_year: number; revenue: number[]; cost: number[] };
const BM = ["Core", "Growth", "Explore"];

// Act on a card right where it shows up (Finance screens): choose it, book it (CFO), see its impact
// on market cap year by year, or talk it through with the copilot.
export function CardActions({ card, ask, onChange }: { card: C; ask: (t: string) => void; onChange?: () => void }) {
  const cfo = useMyRole() === "CFO";
  const [status, setStatus] = useState(card.status);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const btn = "rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800";
  const patch = async (st: string) => {
    setStatus(st);
    await fetch("/api/cards", { method: "PATCH", body: JSON.stringify({ id: card.id, status: st }) });
    refreshOverview();
    onChange?.();
  };
  const book = async () => {
    setMsg("Booking… the critic is auditing it");
    const r = await fetch("/api/cards/book", { method: "POST", body: JSON.stringify({ id: card.id }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    setMsg(r.error ? `⚠ ${r.error}` : r.saved ? `✓ Booked into ${r.cells.join(", ")}` : `Not saved: the critic rejected it`);
    if (!r.saved) return;
    setStatus("booked");
    refreshOverview();
    onChange?.();
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {status === "booked" ? <span className="text-xs text-green-700 dark:text-green-400">booked</span> : (
        <select value={status} onChange={(e) => patch(e.target.value)} aria-label={`Status of ${card.title}`} className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs">
          {["candidate", "selected", "passed"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      )}
      {cfo && BM.includes(card.type) && status === "selected" && <button onClick={book} className={`${btn} !border-green-700 text-green-800 dark:text-green-300`}>Book</button>}
      {(BM.includes(card.type)) && <button onClick={() => setOpen(!open)} aria-expanded={open} className={btn}>{open ? "Hide impact" : "Impact"}</button>}
      <button onClick={() => ask(`Card #${card.id} "${card.title}" (${card.type}, ${status}): should we play it this year? Re-check it against our numbers, net profit, borrowing ability, the H1/H2/H3 mix and the $50B path, and tell me exactly what to do with it and how to pay for it.`)} className={btn}>Discuss</button>
      <a href="#cards" className={btn}>Open in Cards</a>
      {msg && <span className="text-xs">{msg}</span>}
      {open && <span className="block w-full mt-1 overflow-x-auto"><CardTimeline card={card} version={0} /></span>}
    </span>
  );
}
