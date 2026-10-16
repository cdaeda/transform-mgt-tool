"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ROLES, type RoleId } from "@/lib/roles";

// --- who am I (remembered in this browser) ---
const KEY = "transform.role";
const listeners = new Set<() => void>();
const readRole = () => {
  try {
    const r = localStorage.getItem(KEY) as RoleId | null;
    // keep the cookie in step for browsers that picked a role before the cookie existed
    if (r && !document.cookie.includes(`transform_role=${r}`)) document.cookie = `transform_role=${r}; path=/; max-age=31536000; samesite=lax`;
    return r;
  } catch {
    return null;
  }
};
export function setMyRole(r: RoleId) {
  document.cookie = `transform_role=${r}; path=/; max-age=31536000; samesite=lax`; // lets the server enforce CFO-only edits
  try {
    localStorage.setItem(KEY, r);
  } catch {
    /* blocked storage: role lasts for this page only */
  }
  listeners.forEach((f) => f());
}
export const useMyRole = () =>
  useSyncExternalStore((cb) => (listeners.add(cb), () => void listeners.delete(cb)), readRole, () => "pending" as const);

export function RolePicker({ open, onDone }: { open: boolean; onDone: () => void }) {
  const current = useMyRole();
  const [pick, setPick] = useState<RoleId | null>(null);
  if (!open) return null;
  const chosen = pick ?? (current !== "pending" ? current : null);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="role-title">
      <form className="game-card w-[min(26rem,100%)] space-y-3" onSubmit={(e) => (e.preventDefault(), chosen && (setMyRole(chosen), onDone()))}>
        <h2 id="role-title" className="text-xl">Which role are you?</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your tasks are shown first. Saved in this browser only.</p>
        <fieldset className="space-y-1">
          <legend className="sr-only">Your role</legend>
          {ROLES.map((r) => (
            <label key={r.id} className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer ${chosen === r.id ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-800"}`}>
              <input type="radio" name="role" value={r.id} checked={chosen === r.id} onChange={() => setPick(r.id)} className="accent-amber-600" />
              <span><b>{r.id}</b> · {r.title} <span className="text-zinc-500">· {r.name}</span></span>
            </label>
          ))}
        </fieldset>
        <button disabled={!chosen} className="w-full rounded-md px-4 py-2 text-sm font-semibold bg-indigo-900 text-white disabled:opacity-50">Continue</button>
      </form>
    </div>
  );
}

// --- the kanban ---
type Task = { id: number; created_at: string; role: RoleId; title: string; detail: string; status: "todo" | "doing" | "done"; due: string; source: string };
const COLS = [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }, { id: "done", label: "Done" }] as const;
const roleName = (id: string) => ROLES.find((r) => r.id === id)?.name ?? "";

export function TasksPanel({ version }: { version: number }) {
  const me = useMyRole();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [all, setAll] = useState(false);
  const [title, setTitle] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const load = useCallback(() => fetch("/api/tasks").then((r) => r.json()).then((t) => Array.isArray(t) && setTasks(t)), []);
  useEffect(() => void load(), [load, version]);

  const mine = me === "pending" || me === null ? null : me;
  const shown = (tasks ?? []).filter((t) => all || !mine || t.role === mine);
  const move = async (t: Task, status: Task["status"]) => {
    setTasks((xs) => xs?.map((x) => (x.id === t.id ? { ...x, status } : x)) ?? null);
    await fetch("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: t.id, status }) });
  };
  const remove = async (t: Task) => {
    setTasks((xs) => xs?.filter((x) => x.id !== t.id) ?? null);
    await fetch("/api/tasks", { method: "DELETE", body: JSON.stringify({ id: t.id }) });
  };
  const add = async () => {
    if (!title.trim() || !mine) return;
    const r = await fetch("/api/tasks", { method: "POST", body: JSON.stringify({ title, role: mine }) }).then((x) => x.json());
    if (r.error) return;
    setTasks((xs) => [r, ...(xs ?? [])]);
    setTitle("");
  };

  return (
    <section className="space-y-3" aria-label="Tasks">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl">Tasks</h2>
        <div className="flex rounded-full border border-zinc-300 dark:border-zinc-700 overflow-hidden text-sm" role="group" aria-label="Whose tasks">
          <button onClick={() => setAll(false)} aria-pressed={!all} className={`px-3 py-1 ${!all ? "bg-indigo-900 text-white" : ""}`}>{mine ? `Mine · ${mine}` : "Mine"}</button>
          <button onClick={() => setAll(true)} aria-pressed={all} className={`px-3 py-1 ${all ? "bg-indigo-900 text-white" : ""}`}>All roles</button>
        </div>
        <form className="flex gap-2 ml-auto w-full sm:w-auto" onSubmit={(e) => (e.preventDefault(), add())}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mine ? `New task for ${mine}` : "Pick your role first"} aria-label="New task"
            className="flex-1 sm:w-64 rounded-md border border-zinc-300 dark:border-zinc-700 p-1.5 text-sm" disabled={!mine} />
          <button disabled={!mine || !title.trim()} className="rounded-md px-3 py-1.5 text-sm font-semibold bg-indigo-900 text-white disabled:opacity-50">Add</button>
        </form>
      </div>
      {!tasks ? <div className="grid gap-3 md:grid-cols-3">{COLS.map((c) => <div key={c.id} className="game-card h-40 animate-pulse" />)}</div> : (
        <div className="grid gap-3 md:grid-cols-3">
          {COLS.map((col) => {
            const items = shown.filter((t) => t.status === col.id);
            return (
              <section key={col.id} aria-label={col.label}
                onDragOver={(e) => e.preventDefault()} onDrop={() => { const t = tasks.find((x) => x.id === drag); if (t) move(t, col.id); setDrag(null); }}
                className="rounded-xl bg-zinc-100/70 dark:bg-zinc-900/60 p-2 min-h-40 space-y-2">
                <h3 className="text-base px-1 flex justify-between">{col.label}<span className="tabular-nums text-zinc-500">{items.length}</span></h3>
                {items.map((t) => {
                  const i = COLS.findIndex((c) => c.id === t.status);
                  return (
                    <article key={t.id} draggable onDragStart={() => setDrag(t.id)} className="game-card !p-3 space-y-1 cursor-grab active:cursor-grabbing">
                      <div className="flex items-center gap-2">
                        <span className={`chip ${t.role === mine ? "!bg-amber-600" : ""}`}>{t.role}</span>
                        <span className="text-xs text-zinc-500 truncate">{roleName(t.role)}</span>
                        <button onClick={() => remove(t)} className="ml-auto text-xs text-zinc-400 hover:text-red-600" aria-label={`Delete task: ${t.title}`}>✕</button>
                      </div>
                      <p className={`font-semibold text-sm ${t.status === "done" ? "line-through text-zinc-500" : ""}`}>{t.title}</p>
                      {t.detail && <p className="text-xs text-zinc-600 dark:text-zinc-400">{t.detail}</p>}
                      <div className="flex items-center gap-1 text-xs text-zinc-500">
                        {t.due && <span>⏱ {t.due}</span>}
                        <span className="ml-auto flex gap-1">
                          {i > 0 && <button onClick={() => move(t, COLS[i - 1].id)} className="rounded border border-zinc-300 px-1.5" aria-label={`Move to ${COLS[i - 1].label}`}>←</button>}
                          {i < 2 && <button onClick={() => move(t, COLS[i + 1].id)} className="rounded border border-zinc-300 px-1.5" aria-label={`Move to ${COLS[i + 1].label}`}>→</button>}
                        </span>
                      </div>
                    </article>
                  );
                })}
                {!items.length && <p className="text-xs text-zinc-500 px-1">{col.id === "todo" ? "Nothing to do yet. Capture a card or ask the copilot, and tasks appear here." : "—"}</p>}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
