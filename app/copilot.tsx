"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Markdown } from "./markdown";

export type Chip = { label: string; mode: "evaluate_card" | "chat" | "create_tasks"; prompt: string };
export type Msg = { role: "user" | "assistant"; content: string; image?: string; chips?: Chip[]; note?: boolean };
export type Seed = { title: string; image?: string; text?: string; opening: string; chips: Chip[] };

const PITCH_PROMPT =
  "Read our current numbers (summary, BM portfolio, market cap, leaderboard) and draft our Round 3 '$50B Finish Line' 3-minute board pitch. Fill all six boxes (01 What changed, 02 Core, 03 Growth, 04 Explore, 05 Reallocate, 06 Path to $50B / board ask) with specific figures from the sheet, then a 30s/2min/30s spoken script. Don't write to the sheet.";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(d?.error ?? r.statusText);
  return d;
}

// The CFO copilot. Threads can start from the capture modal (photo or text) with option chips;
// any action taken is turned into tasks for every role.
export function Copilot({ onReply, askRef, threadRef, noteRef, onTasks }: {
  onReply: () => void;
  askRef: RefObject<(text: string) => void>;
  threadRef: RefObject<(seed: Seed) => void>;
  noteRef: RefObject<(text: string) => void>;
  onTasks: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, busy]);

  const seed = msgs.find((m) => m.role === "user");
  const threadSummary = (list: Msg[]) =>
    list.filter((m) => !m.note).map((m) => `${m.role === "user" ? "Team" : "Copilot"}: ${m.content}`).join("\n").slice(-6000);

  async function planTasks(list: Msg[], why: string) {
    setBusy("Creating tasks for each role…");
    try {
      const tasks = await post<{ role: string; title: string }[]>("/api/tasks/plan", { context: `${why}\n\n${threadSummary(list)}`, source: title || "copilot" });
      const roles = [...new Set(tasks.map((t) => t.role))].join(", ");
      setMsgs((m) => [...m, { role: "assistant", note: true, content: `📋 ${tasks.length} tasks created for ${roles}. See the Tasks tab.` }]);
      onTasks();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", note: true, content: `Couldn't create tasks: ${(e as Error).message}` }]);
    }
    setBusy("");
  }

  async function send(text: string, base = msgs) {
    if (!text.trim() || busy) return base;
    const next: Msg[] = [...base, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setBusy("Thinking & checking the workbook…");
    const payload = next.filter((m) => !m.note).map(({ role, content, image }) => ({ role, content, image }));
    const r = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: payload }) });
    const { text: reply } = await r.json();
    const done: Msg[] = [...next, { role: "assistant", content: reply }];
    setMsgs(done);
    setBusy("");
    onReply(); // the copilot may have written cells
    return done;
  }

  async function runChip(chip: Chip) {
    // Chips are one-shot: clear them once one is chosen.
    const base = msgs.map((m) => ({ ...m, chips: undefined }));
    setMsgs(base);
    if (chip.mode === "create_tasks") return planTasks(base, `Action chosen: ${chip.label}. ${chip.prompt}`);
    if (chip.mode === "chat") {
      const done = await send(chip.prompt, base);
      return planTasks(done, `Action chosen: ${chip.label}`);
    }
    // evaluate_card: run the full card evaluation and log it in our cards list.
    setBusy("Evaluating the card and adding it to our cards… (~1 min)");
    try {
      const c = await post<{ id: number; title: string; type: string; recommendation: string; primary_horizon: string; horizon_fit: Record<string, { score: number }>; partner_verdict: string }>(
        "/api/cards", seed?.image ? { image: seed.image } : { text: seed?.content ?? "" },
      );
      const fit = ["H1", "H2", "H3"].map((h) => `${h} ${c.horizon_fit?.[h]?.score ?? "–"}`).join(" · ");
      const done: Msg[] = [...base, { role: "assistant", content: `Logged card #${c.id} · ${c.type}: ${c.title}\nRecommendation: ${c.recommendation} · primary ${c.primary_horizon || "—"} (${fit}) · ${c.partner_verdict}\nFull evaluation is on the Cards tab.` }];
      setMsgs(done);
      onReply();
      setBusy("");
      return planTasks(done, `Card evaluated and logged: ${c.title} (${c.recommendation})`);
    } catch (e) {
      setMsgs([...base, { role: "assistant", note: true, content: `Couldn't evaluate it: ${(e as Error).message}` }]);
      setBusy("");
    }
  }

  useEffect(() => {
    askRef.current = (t: string) => void send(t); // panels hand questions to the copilot
    noteRef.current = (text: string) => {
      setMsgs((m) => [...m, { role: "assistant", note: true, content: text }]);
      onReply();
    };
    threadRef.current = (s: Seed) => {
      setTitle(s.title);
      setMsgs([
        { role: "user", content: s.text || (s.image ? "(photo)" : ""), image: s.image },
        { role: "assistant", content: s.opening, chips: s.chips },
      ]);
    };
  });

  return (
    <div className="flex flex-col h-full gap-2">
      {title && (
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow text-zinc-500 truncate">Thread · {title}</p>
          <button onClick={() => (setMsgs([]), setTitle(""))} className="text-xs underline shrink-0">New chat</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-3 text-sm">
        {msgs.length === 0 && (
          <p className="text-zinc-500">
            Ask your AI CFO anything, or use <b>＋ Capture</b> to snap a card or handout. Try &ldquo;What happens to market cap if we draw the 25M bank loan?&rdquo;
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.note ? "text-xs text-zinc-600 dark:text-zinc-400 px-1" : `rounded-lg p-2.5 ${m.role === "user" ? "bg-indigo-50 dark:bg-indigo-950 ml-6" : "bg-zinc-100 dark:bg-zinc-900 mr-6"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local capture preview */}
            {m.image && <img src={`data:image/jpeg;base64,${m.image}`} alt="Captured" className="rounded-md mb-2 max-h-48 w-auto" />}
            {m.role === "assistant" && !m.note ? <Markdown>{m.content}</Markdown> : <div className="whitespace-pre-wrap">{m.content}</div>}
            {m.chips && m.chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="What should I do?">
                {m.chips.map((c) => (
                  <button key={c.label} onClick={() => runChip(c)} disabled={!!busy}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border disabled:opacity-50 ${c.mode === "create_tasks" ? "border-green-700 text-green-800 dark:text-green-300" : "border-indigo-900 text-indigo-900 dark:border-indigo-300 dark:text-indigo-200"} hover:bg-white dark:hover:bg-zinc-800`}>
                    {c.mode === "create_tasks" ? "📋 " : c.mode === "evaluate_card" ? "🃏 " : "💬 "}{c.label}
                  </button>
                ))}
              </div>
            )}
            {m.role === "assistant" && !m.note && !m.chips && i === msgs.length - 1 && !busy && (
              <button onClick={() => planTasks(msgs, "Turn this into tasks")} className="mt-2 text-xs underline">📋 Turn into tasks</button>
            )}
          </div>
        ))}
        {busy && <p className="text-zinc-500 animate-pulse">{busy}</p>}
        <div ref={end} />
      </div>
      <button onClick={() => send(PITCH_PROMPT)} disabled={!!busy} className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
        Draft Round 3 board pitch ($50B Finish Line)
      </button>
      <form onSubmit={(e) => (e.preventDefault(), send(input))} className="flex gap-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Message"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 p-2 text-sm" />
        <button disabled={!!busy} className="rounded-md bg-indigo-900 text-white px-3 text-sm font-semibold disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}
