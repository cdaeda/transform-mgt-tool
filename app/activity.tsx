"use client";

import { useEffect, useState } from "react";
import { ROLES } from "@/lib/roles";

type Row = { id: number; created_at: string; role: string; tab: string; kind: "chat" | "decision" | "action"; summary: string; detail: Record<string, unknown>; thread_id: string | null };
type Thread = { title: string; tab: string; messages: { role: string; content: string; by?: string }[] };
const KINDS = { decision: "⚖ Decision", action: "⚙ Action", chat: "💬 Chat" } as const;
const roleLabel = (id: string) => { const r = ROLES.find((x) => x.id === id); return r ? `${r.id}${r.name ? ` · ${r.name}` : ""}` : id || "Unknown role"; };
const time = (s: string) => new Date(s).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Who did what: major decisions by team member, then the full log with lineage back to each conversation.
export function ActivityPanel({ version }: { version: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [role, setRole] = useState("");
  const [kind, setKind] = useState<"" | Row["kind"]>("");
  useEffect(() => void fetch("/api/activity").then((r) => r.json()).then((x) => Array.isArray(x) && setRows(x)), [version]);
  if (!rows) return <div className="game-card h-48 animate-pulse" aria-busy="true" />;
  if (!rows.length) return <p className="text-sm text-zinc-500">No activity yet. Chats, decisions and changes made in the app from now on show up here, with who made them.</p>;

  // The conversation each decision came from: its first logged question.
  const origin = new Map<string, Row>();
  for (const r of [...rows].reverse()) if (r.kind === "chat" && r.thread_id && !origin.has(r.thread_id)) origin.set(r.thread_id, r);
  const roles = [...new Set(rows.map((r) => r.role))];
  const shown = rows.filter((r) => (!role || r.role === role) && (!kind || r.kind === kind));

  return (
    <div className="space-y-4">
      <section aria-label="Major decisions by team member">
        <h2 className="text-lg mb-2">Decisions by team member</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => {
            const mine = rows.filter((x) => x.role === r);
            const decisions = mine.filter((x) => x.kind === "decision");
            return (
              <button key={r} onClick={() => setRole(role === r ? "" : r)} aria-pressed={role === r}
                className={`game-card text-left space-y-2 ${role === r ? "ring-2 ring-[var(--gold)]" : ""}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base">{roleLabel(r)}</h3>
                  <p className="text-xs text-zinc-500 tabular-nums">{decisions.length} decisions · {mine.filter((x) => x.kind === "action").length} actions · {mine.filter((x) => x.kind === "chat").length} chats</p>
                </div>
                {decisions.length ? (
                  <ul className="text-sm space-y-1">{decisions.slice(0, 4).map((d) => <li key={d.id} className="line-clamp-2"><span className="text-zinc-500 text-xs mr-1">{time(d.created_at)}</span>{d.summary}</li>)}</ul>
                ) : <p className="text-sm text-zinc-500">No decisions yet.</p>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2" aria-label="Activity log">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg mr-auto">Activity log</h2>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role" className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-sm">
            <option value="">Everyone</option>
            {roles.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          {(["", "decision", "action", "chat"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${kind === k ? "bg-indigo-900 text-white" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>{k ? KINDS[k] : "All"}</button>
          ))}
        </div>
        <ol className="space-y-1.5">
          {shown.map((r) => <Entry key={r.id} r={r} from={r.kind !== "chat" && r.thread_id ? origin.get(r.thread_id) : undefined} />)}
        </ol>
      </section>
    </div>
  );
}

function Entry({ r, from }: { r: Row; from?: Row }) {
  const [thread, setThread] = useState<Thread | null | "loading">(null);
  const d = r.detail ?? {};
  const list = (k: string) => (Array.isArray(d[k]) && (d[k] as unknown[]).length ? (d[k] as unknown[]).map(String) : null);
  const open = () => thread === null && (setThread("loading"), fetch(`/api/activity?thread=${encodeURIComponent(r.thread_id!)}`).then((x) => x.json()).then(setThread));
  return (
    <li className={`rounded-lg border p-2.5 text-sm ${r.kind === "decision" ? "border-[var(--gold)] bg-amber-50/60 dark:bg-amber-950/20" : "border-zinc-200 dark:border-zinc-800"}`}>
      <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && r.thread_id && open()}>
        <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xs text-zinc-500 tabular-nums">{time(r.created_at)}</span>
          <span className="chip !bg-indigo-900">{r.role || "?"}</span>
          <span className="text-xs text-zinc-500">{KINDS[r.kind]}{r.tab ? ` · ${r.tab}` : ""}</span>
          <span className="basis-full sm:basis-auto">{r.summary}</span>
        </summary>
        <div className="mt-2 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
          {from && <p>↳ Came out of a conversation: “{from.summary}” ({from.role}, {time(from.created_at)})</p>}
          {list("proposed") && <p><b>Proposed:</b> {list("proposed")!.join(" · ")}</p>}
          {list("cells") && <p><b>Cells written:</b> {list("cells")!.join(", ")}</p>}
          {typeof d.critic === "string" && <p><b>Critic:</b> {d.critic}</p>}
          {typeof d.reply === "string" && <p className="whitespace-pre-wrap"><b>Copilot:</b> {d.reply}{d.reply.length >= 600 ? "…" : ""}</p>}
          {r.thread_id && (
            thread === "loading" ? <p className="text-zinc-500">Loading the conversation…</p>
              : thread && (
                <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 p-2 space-y-1 max-h-72 overflow-y-auto">
                  <p className="eyebrow text-zinc-500">Conversation · {thread.title || "untitled"} · {thread.tab} tab</p>
                  {thread.messages.map((m, i) => <p key={i} className="whitespace-pre-wrap line-clamp-6"><b>{m.role === "user" ? m.by || "Team" : "Copilot"}:</b> {m.content}</p>)}
                </div>
              )
          )}
        </div>
      </details>
    </li>
  );
}
