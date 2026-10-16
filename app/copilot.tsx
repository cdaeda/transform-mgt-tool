"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Markdown } from "./markdown";

export type Chip = { label: string; mode: "evaluate_card" | "chat" | "create_tasks"; prompt: string };
type Proposal = { kind: string; summary: string; [k: string]: unknown };
type Decided = Proposal & { state?: "accepted" | "rejected" | "error" | "past"; info?: string };
export type Msg = {
  role: "user" | "assistant"; content: string; image?: string; chips?: Chip[]; note?: boolean; by?: string;
  proposals?: Decided[]; choices?: { question: string; options: string[] }[];
};
export type ActTask = { id: number; role: string; title: string; detail: string; due: string };
const KIND: Record<string, string> = { workbook: "Workbook", strategy: "Strategy", task: "New task", task_status: "Task status", card: "Card", financing: "Financing", knowledge: "Remember" };
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
export type Seed = { title: string; image?: string; text?: string; opening: string; chips: Chip[] };

const PITCH_PROMPT =
  "Read our current numbers (summary, BM portfolio, market cap, leaderboard) and draft our Round 3 '$50B Finish Line' 3-minute board pitch. Fill all six boxes (01 What changed, 02 Core, 03 Growth, 04 Explore, 05 Reallocate, 06 Path to $50B / board ask) with specific figures from the sheet, then a 30s/2min/30s spoken script. Don't write to the sheet.";

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(d?.error ?? r.statusText);
  return d;
}

const myRole = () => (typeof document === "undefined" ? "" : document.cookie.match(/(?:^|;\s*)transform_role=([A-Z]+)/)?.[1] ?? "");
export type Pending = { tab: string; title: string; text: string } | null;

// One copilot per tab, each with its own thread (the latest one is reloaded on open). Only the active
// tab's copilot answers the page's refs. Threads can start from the capture modal (photo or text) with
// option chips; any action taken is turned into tasks for every role.
export function Copilot({ tab, active, pendingRef, onReply, askRef, threadRef, noteRef, actRef, onTasks }: {
  tab: string;
  active: boolean;
  pendingRef: RefObject<Pending>;
  actRef: RefObject<(task: ActTask) => void>;
  onReply: () => void;
  askRef: RefObject<(text: string) => void>;
  threadRef: RefObject<(seed: Seed) => void>;
  noteRef: RefObject<(text: string) => void>;
  onTasks: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [title, setTitle] = useState("");
  // The id is minted on first send (never during render), so prerendering stays deterministic.
  const [thread, setThread] = useState<{ id: string; mode: "chat" | "act"; taskId: number | null }>({ id: "", mode: "chat", taskId: null });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // void: newer Chrome returns a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => void end.current?.scrollIntoView({ block: "end" }), [msgs, busy]);
  // Reopen this tab's latest thread (decided proposals show as past; the Activity tab has the outcome).
  // Loaded the first time the tab is opened, not all eight at once (the DB pooler caps connections).
  const touched = useRef(false);
  const sent = useRef(false);
  useEffect(() => {
    if (!active || touched.current) return;
    touched.current = true; // one load per tab per page view
    fetch(`/api/chat?tab=${encodeURIComponent(tab)}`).then((r) => r.json()).then((t) => {
      if (!t || sent.current) return;
      setThread({ id: t.id, mode: t.task_id ? "act" : "chat", taskId: t.task_id });
      setTitle(t.title);
      setMsgs((t.messages as Msg[]).map((m) => ({ ...m, proposals: m.proposals?.map((p) => ({ ...p, state: "past" as const })) })));
    }).catch(() => {});
  }, [tab, active]);

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

  async function send(text: string, base = msgs, threadOverride?: typeof thread, titleOverride?: string) {
    if (!text.trim() || busy) return base;
    touched.current = sent.current = true;
    const next: Msg[] = [...base, { role: "user", content: text, by: myRole() }];
    setMsgs(next);
    setInput("");
    setBusy("Thinking & checking the workbook…");
    const payload = next.filter((m) => !m.note).map(({ role, content, image, by }) => ({ role, content, image, by }));
    let t = threadOverride ?? thread;
    if (!t.id) {
      t = { ...t, id: newId() };
      setThread(t);
    }
    const r = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: payload, mode: t.mode, threadId: t.id, taskId: t.taskId, title: titleOverride ?? title, tab }) });
    const { text: reply, proposals = [], choices = [] } = await r.json();
    const done: Msg[] = [...next, { role: "assistant", content: reply, proposals, choices }];
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

  // Accept / reject one proposal; every decision lands in organizational memory.
  async function decide(mi: number, pi: number, decision: "accept" | "reject") {
    const p = msgs[mi].proposals![pi];
    const note = decision === "reject" ? prompt("Why reject it? (optional — the copilot learns from this)") ?? "" : "";
    const r = await fetch("/api/proposals", { method: "POST", body: JSON.stringify({ proposal: p, decision, note, source: title || "copilot", threadId: thread.id || null }) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
    const state: Decided["state"] = r.error ? "error" : decision === "accept" ? "accepted" : "rejected";
    setMsgs((all) => all.map((m, i) => (i !== mi ? m : { ...m, proposals: m.proposals!.map((q, j) => (j !== pi ? q : { ...q, state, info: r.error ?? r.detail })) })));
    if (r.error || decision !== "accept") return;
    onReply();
    if (["task", "task_status"].includes(p.kind)) onTasks();
  }

  // Runs every render on purpose (refs must point at the live closures); the pending start is consumed once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    // A fresh, titled thread that starts working immediately (Next-move buttons), once its tab is open.
    const p = pendingRef.current;
    if (p && p.tab === tab) {
      pendingRef.current = null;
      touched.current = sent.current = true;
      const th = { id: newId(), mode: "chat" as const, taskId: null };
      setThread(th);
      setTitle(p.title);
      setMsgs([]);
      void send(p.text, [], th, p.title);
    }
    askRef.current = (t: string) => void send(t); // panels hand questions to the copilot
    actRef.current = (task: ActTask) => {
      touched.current = sent.current = true;
      const t = { id: newId(), mode: "act" as const, taskId: task.id };
      setThread(t);
      setTitle(task.title);
      setMsgs([]);
      void send(`Let's act on task #${task.id} for the ${task.role}: "${task.title}". ${task.detail}${task.due ? ` Due: ${task.due}.` : ""} Help me get it done.`, [], t, task.title);
    };
    noteRef.current = (text: string) => {
      setMsgs((m) => [...m, { role: "assistant", note: true, content: text }]);
      onReply();
    };
    threadRef.current = (s: Seed) => {
      touched.current = sent.current = true;
      setThread({ id: "", mode: "chat", taskId: null });
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
          <p className="eyebrow text-zinc-500 truncate">{thread.mode === "act" ? "⚡ Working task" : "Thread"} · {title}</p>
          <button onClick={() => (touched.current = sent.current = true, setMsgs([]), setTitle(""), setThread({ id: "", mode: "chat", taskId: null }))} className="text-xs underline shrink-0">New chat</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-3 text-sm">
        {msgs.length === 0 && (
          <p className="text-zinc-500">
            Ask the {tab} copilot about this tab, or use <b>＋ Capture</b> to snap a card or handout. Everyone on the team shares this thread, and each message shows who sent it.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.note ? "text-xs text-zinc-600 dark:text-zinc-400 px-1" : `rounded-lg p-2.5 ${m.role === "user" ? "bg-indigo-50 dark:bg-indigo-950 ml-6" : "bg-zinc-100 dark:bg-zinc-900 mr-6"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local capture preview */}
            {m.image && <img src={`data:image/jpeg;base64,${m.image}`} alt="Captured" className="rounded-md mb-2 max-h-48 w-auto" />}
            {m.role === "user" && m.by && <p className="eyebrow text-indigo-700 dark:text-indigo-300 mb-0.5">{m.by}</p>}
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
            {m.choices?.map((c, ci) => (
              <div key={ci} className="mt-2">
                <p className="font-semibold">{c.question}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {c.options.map((op) => (
                    <button key={op} onClick={() => send(op)} disabled={!!busy || i !== msgs.length - 1}
                      className="rounded-full px-3 py-1 text-xs font-semibold border border-indigo-900 text-indigo-900 dark:border-indigo-300 dark:text-indigo-200 disabled:opacity-40">{op}</button>
                  ))}
                </div>
              </div>
            ))}
            {m.proposals && m.proposals.length > 0 && (
              <div className="mt-2 space-y-1.5" aria-label="Proposed changes">
                {m.proposals.map((p, pi) => (
                  <div key={pi} className={`rounded-md border p-2 ${p.state === "accepted" ? "border-green-700 bg-green-50 dark:bg-green-950/30" : p.state === "rejected" ? "border-zinc-300 opacity-60" : p.state === "error" ? "border-red-500" : "border-amber-500 bg-white dark:bg-zinc-900"}`}>
                    <p className="text-xs"><span className="chip !bg-indigo-900 mr-1">{KIND[p.kind] ?? p.kind}</span>{p.summary}</p>
                    {p.kind === "workbook" && <p className="text-xs text-zinc-500 mt-0.5">{String(p.range)} → {JSON.stringify(p.values)}</p>}
                    {p.kind === "task" && <p className="text-xs text-zinc-500 mt-0.5">{String(p.role)}: {String(p.title)}</p>}
                    {!p.state ? (
                      <div className="flex gap-1.5 mt-1">
                        <button onClick={() => decide(i, pi, "accept")} className="rounded px-2 py-0.5 text-xs font-semibold bg-green-700 text-white">✓ Accept</button>
                        <button onClick={() => decide(i, pi, "reject")} className="rounded px-2 py-0.5 text-xs border border-zinc-400">✕ Reject</button>
                      </div>
                    ) : <p className="text-xs mt-1">{p.state === "past" ? "Proposed earlier · the decision is in Activity" : p.state === "accepted" ? `✓ Accepted${p.info ?? ""}` : p.state === "rejected" ? "✕ Rejected — noted" : `⚠ ${p.info}`}</p>}
                  </div>
                ))}
                {m.proposals.filter((p) => !p.state).length > 1 && (
                  <button onClick={async () => { for (let pi = 0; pi < m.proposals!.length; pi++) if (!m.proposals![pi].state) await decide(i, pi, "accept"); }} className="text-xs underline">Accept all</button>
                )}
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
      {tab === "Dashboard" && (
        <button onClick={() => send(PITCH_PROMPT)} disabled={!!busy} className="rounded-md bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          Draft Round 3 board pitch ($50B Finish Line)
        </button>
      )}
      <form onSubmit={(e) => (e.preventDefault(), send(input))} className="flex gap-2">
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={2} aria-label="Message"
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(input))}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 p-2 text-sm" />
        <button disabled={!!busy} className="rounded-md bg-indigo-900 text-white px-3 text-sm font-semibold disabled:opacity-50">Send</button>
      </form>
    </div>
  );
}
