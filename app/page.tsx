"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { col2n, freeRow, n2col } from "@/lib/impact";
const freeRowIndex = (rows: Cell[][]) => { const r = freeRow(0, rows); return r === null ? -1 : r; };
import { CaptureModal, toJpegBase64 } from "./capture";
import { Copilot, type ActTask, type Pending, type Seed } from "./copilot";
import { ActivityPanel } from "./activity";
import { ProfitBorrow } from "./profit-borrow";
import { Comps } from "./comps";
import { YearRound } from "./year-round";
import { Simulator } from "./simulator";
import { DeckView } from "./deck-view";
import { PresentReturn } from "./present-return";
import { DashboardPanel } from "./dashboard";
import { RolePicker, TasksPanel, useMyRole } from "./tasks";
import { InnovationPanel, InvestorRelationsPanel, RivalFinances } from "./finance-areas";
import { PathTo50B } from "./path50";
import { CapitalPanel } from "./capital";
import { AnalystRatings } from "./ratings";
import type { Go } from "./next-move";
import { refreshOverview } from "./overview-store";
import { StrategyCard } from "./strategy-card";
import { FinancesPanel } from "./finances";
import { AmbitionPanel, AuditPanel, CardsPanel, FinancingPanel, MarketCapBar, TeamsPanel } from "./panels";

type Cell = string | number | boolean | null;


type AddRow = { label: string; from: number; to: number; prefix?: string };
const SECTIONS: { title: string; range: string; hide?: number[]; open?: boolean; add?: AddRow[] }[] = [
  { title: "Financial summary", range: "A30:S43", hide: [31, 32, 33], open: true },
  { title: "BM revenue (Core / Growth / Explore)", range: "A51:L106", add: [
    { label: "Core business model", from: 53, to: 67, prefix: "(Core) " },
    { label: "Growth business model", from: 71, to: 85, prefix: "(Growth) " },
    { label: "Explore business model", from: 89, to: 103, prefix: "(Explore) " },
  ] },
  { title: "BM costs", range: "A111:L166" },
  { title: "BM profit (computed)", range: "A170:L227" },
  { title: "Market cap units & analyst cards", range: "A234:AF266" },
  { title: "Cap.ex & depreciation", range: "A274:D291" },
  { title: "CVC portfolio", range: "A297:D314", add: [{ label: "CVC investment", from: 298, to: 313 }] },
  { title: "Debt & loans", range: "A320:D337", add: [{ label: "loan", from: 321, to: 336 }] },
  { title: "Dividends", range: "A343:D360", add: [{ label: "dividend year", from: 344, to: 359 }] },
  { title: "Share buyback / issue", range: "A366:D410", add: [{ label: "buyback", from: 367, to: 385 }, { label: "share issue", from: 390, to: 409 }] },
  { title: "Company & team", range: "A7:B21" },
];


function Grid({ range, hide = [], version, onWrote, editable = false }: { range: string; hide?: number[]; version: number; onWrote: () => void; editable?: boolean }) {
  const [data, setData] = useState<{ values: Cell[][]; formulas: Cell[][] } | null>(null);
  const [err, setErr] = useState("");
  const [, c0, r0, c1, r1] = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/)!;
  const startCol = col2n(c0), startRow = +r0;
  const cols = col2n(c1) - startCol + 1, rows = +r1 - startRow + 1;

  const load = useCallback(() => {
    fetch(`/api/sheet?range=${encodeURIComponent(range)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : (setErr(""), setData(d))));
  }, [range]);
  useEffect(load, [load, version]);

  async function save(addr: string, value: string) {
    const r = await fetch("/api/sheet", { method: "POST", body: JSON.stringify({ range: addr, values: [[value]] }) });
    const d = await r.json();
    if (d.error) setErr(d.error);
    else {
      if (d.pushError) setErr(d.pushError);
      onWrote();
    }
  }

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <tbody>
          {Array.from({ length: rows }, (_, i) => startRow + i)
            .filter((row) => !hide.includes(row))
            .map((row) => {
              const i = row - startRow;
              return (
                <tr key={row}>
                  <td className="pr-2 text-zinc-400 text-right">{row}</td>
                  {Array.from({ length: cols }, (_, j) => {
                    const addr = `${n2col(startCol + j)}${row}`;
                    const v = data.values[i]?.[j];
                    const shown = typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(v ?? "");
                    const f = data.formulas[i]?.[j];
                    const computed = !editable || range.includes("!") || (typeof f === "string" && f.startsWith("="));
                    return (
                      <td key={addr} className="border border-zinc-200 dark:border-zinc-800 p-0">
                        {computed ? (
                          <div title={`${addr} ${f}`} className={`px-1 min-w-24 ${j === 0 ? "min-w-56" : ""} bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400`}>{shown}</div>
                        ) : (
                          <input
                            key={`${addr}:${shown}`}
                            title={addr}
                            aria-label={addr}
                            defaultValue={shown}
                            onBlur={(e) => e.target.value !== shown && save(addr, e.target.value)}
                            className={`px-1 bg-transparent ${j === 0 ? "w-56" : "w-24"}`}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}


// CFO-only edit mode toggle; everyone else sees why the numbers are read-only.
function EditToggle({ cfo, on, set }: { cfo: boolean; on: boolean; set: (v: boolean) => void }) {
  if (!cfo) return <p className="text-xs text-zinc-500">🔒 Numbers are read-only. Only the CFO can change them (pick CFO as your role to edit).</p>;
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 ${on ? "bg-green-50 dark:bg-green-950/40 border border-green-700/50" : "bg-zinc-100 dark:bg-zinc-900"}`}>
      <button onClick={() => set(!on)} aria-pressed={on} className={`rounded-md px-3 py-1 text-sm font-semibold ${on ? "bg-green-700 text-white" : "bg-indigo-900 text-white"}`}>
        {on ? "✓ Editing — done" : "✎ Edit numbers"}
      </button>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{on ? "Click a white cell to change it; add rows with the + buttons. Each save goes to the class sheet." : "CFO: turn on edit mode to change numbers inline."}</span>
    </div>
  );
}

function WorkbookTools({ tool, bump, cfo }: { tool: string; bump: () => void; cfo: boolean }) {
  return (
    <>
            <button className={tool} onClick={async () => {
        const go = async (force: boolean) => fetch("/api/workbook/sync", { method: "POST", body: JSON.stringify({ force }) });
        let r = await go(false);
        if (r.status === 409) {
          if (!confirm((await r.json()).error)) return;
          r = await go(true);
        }
        const d = await r.json();
        if (d.error) return alert(d.error);
        const tabs = Object.entries(d.changes.tabs as Record<string, number>);
        alert(tabs.length ? `Synced. Changed since last copy: ${tabs.map(([t, n]) => `${t} (${n})`).join(", ")}` : "Synced. No changes since the last copy.");
        bump();
      }}>Sync from class sheet</button>
      <a href="/api/workbook" className={tool}>Download .xlsx</a>
      {cfo && (
<label className={`${tool} cursor-pointer`}>
        Upload .xlsx
        <input type="file" accept=".xlsx" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !confirm(`Replace the working workbook with ${f.name}? Edits made in the app since the last download will be lost.`)) return;
          const body = new FormData();
          body.append("file", f);
          const d = await fetch("/api/workbook", { method: "POST", body }).then((r) => r.json());
          if (d.error) alert(d.error);
          bump();
        }} />
      </label>
)}
      <button onClick={bump} className={tool}>Refresh</button>
    </>
  );
}

// Fill the next free row of a block: business models replace a "(Core) BM 5" placeholder, list blocks take
// the first row with an empty name. The CFO then fills the numbers inline.
function AddRowButton({ spec, onDone }: { spec: AddRow; onDone: () => void }) {
  const [msg, setMsg] = useState("");
  async function add() {
    const name = prompt(`Name for the new ${spec.label}:`)?.trim();
    if (!name) return;
    const d = await fetch(`/api/sheet?range=${encodeURIComponent(`A${spec.from}:K${spec.to}`)}`).then((r) => r.json());
    const rows: Cell[][] = d.values ?? [];
    const i = spec.prefix ? freeRowIndex(rows) : rows.findIndex((r) => String(r?.[0] ?? "").trim() === "");
    if (i < 0) return setMsg(`No free row left in ${spec.from}–${spec.to}.`);
    const row = spec.from + i;
    const r = await fetch("/api/sheet", { method: "POST", body: JSON.stringify({ range: `A${row}`, values: [[`${spec.prefix ?? ""}${name}`]] }) }).then((x) => x.json());
    setMsg(r.error ? r.error : `Added in row ${row} — fill in its numbers.`);
    if (!r.error) onDone();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={add} className="rounded-md border border-green-700 text-green-800 dark:text-green-300 px-2.5 py-1 text-xs font-semibold">+ Add {spec.label}</button>
      {msg && <span className="text-xs">{msg}</span>}
    </span>
  );
}

const TABS = ["Dashboard", "Presentation", "Tasks", "Cards", "Capital", "Finance", "Teams", "Workbook", "Activity"] as const;
// Finance = this year, tactical. Capital = the path to $50B and the investor story, strategic.
const FINANCE_AREAS = ["What-if", "Simulator", "Borrowing", "Innovation"] as const;
const CAPITAL_AREAS = ["Plan & strategies", "Lever planner", "Analyst ratings", "Comparables", "Research", "Investor relations", "Strategy"] as const;

// The open tab lives in the URL hash (#finances), so links, refresh and the back button work.
const slug = (t: string) => t.toLowerCase().replace(/[^a-z]+/g, "-");
const goTo = (t: string) => {
  window.location.hash = t.includes("/") ? t : slug(t); // hash-only change: no navigation, fires hashchange
};
const onHash = (cb: () => void) => (window.addEventListener("hashchange", cb), () => window.removeEventListener("hashchange", cb));
// #finance/investor-relations -> tab "Finance", area "Investor relations"
const tabFromHash = () => TABS.find((t) => window.location.hash.split("/")[0] === `#${slug(t)}`) ?? "Dashboard";
const areaFromHash = () => FINANCE_AREAS.find((a) => window.location.hash.split("/")[1] === slug(a)) ?? "What-if";
const capAreaFromHash = () => CAPITAL_AREAS.find((a) => window.location.hash.split("/")[1] === slug(a)) ?? "Plan & strategies";

export default function Home() {
  const askRef = useRef<(text: string) => void>(() => {});
  const threadRef = useRef<(seed: Seed) => void>(() => {});
  const noteRef = useRef<(text: string) => void>(() => {});
  const actRef = useRef<(task: ActTask) => void>(() => {});
  const pendingRef = useRef<Pending>(null);
  const [flash, setFlash] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(false);
  // Remounts the capture modal with what a quick action brought (a photo, or the dice squares open).
  const [capturePreset, setCapturePreset] = useState<{ image?: string; roll?: boolean; k: number }>({ k: 0 });
  const openCapture = (p: { image?: string; roll?: boolean } = {}) => (setCapturePreset((x) => ({ ...p, k: x.k + 1 })), setCaptureOpen(true));
  const role = useMyRole();
  const cfo = role === "CFO";
  const [editMode, setEditMode] = useState(false);
  const editing = cfo && editMode;
  const [rolePicker, setRolePicker] = useState(false);
  const tab = useSyncExternalStore(onHash, tabFromHash, () => "Dashboard" as const);
  const setTab = (t: (typeof TABS)[number]) => goTo(t);
  // Tell the server which tab each change comes from (the activity log records it).
  useEffect(() => void (document.cookie = `transform_tab=${encodeURIComponent(tab)}; path=/; samesite=lax`), [tab]);
  const area = useSyncExternalStore(onHash, areaFromHash, () => "What-if" as const);
  const capArea = useSyncExternalStore(onHash, capAreaFromHash, () => "Plan & strategies" as const);
  const hash = useSyncExternalStore(onHash, () => window.location.hash, () => "");
  // Old links from before Strategy and Investor relations moved from Finance to Capital.
  useEffect(() => {
    const moved: Record<string, string> = { "#finance/strategy": "capital/strategy", "#finance/investor-relations": "capital/investor-relations" };
    if (moved[hash]) goTo(moved[hash]);
  }, [hash]);
  const setCapArea = (a: (typeof CAPITAL_AREAS)[number]) => goTo(`capital/${slug(a)}`);
  // Next-move buttons: do the thing they name.
  const go: Go = (a) => {
    if (a.kind === "roll" || a.kind === "capture") return openCapture({ roll: a.kind === "roll" });
    if (a.kind === "deck") return setTab("Presentation");
    if (a.kind === "path") return setCapArea("Lever planner");
    if (a.kind === "capital") return setCapArea("Plan & strategies");
    if (a.kind === "task" && a.task_id)
      return void fetch("/api/tasks").then((r) => r.json()).then((ts) => {
        const t = Array.isArray(ts) && ts.find((x: { id: number }) => x.id === a.task_id);
        if (!t) return;
        setChatOpen(true);
        actRef.current(t);
      });
    // Chat actions: workbook work opens the Workbook tab; that tab's copilot starts a titled thread and flashes.
    const to = /workbook|cell|audit|[A-Z]\d{2,3}\b/i.test(`${a.label} ${a.prompt}`) ? "Workbook" : tab;
    pendingRef.current = { tab: to, title: a.label, text: a.prompt || a.label };
    setTab(to);
    setChatOpen(true);
    setFlash((f) => f + 1);
  };
  const makeTasks = (context: string) => {
    noteRef.current("📋 Creating tasks for each role…");
    fetch("/api/tasks/plan", { method: "POST", body: JSON.stringify({ context, source: "Path to $50B" }) })
      .then((r) => r.json())
      .then((t) => (noteRef.current(Array.isArray(t) ? `📋 ${t.length} tasks created — see the Tasks tab.` : `Couldn't create tasks: ${t.error}`), bump()));
  };
  const setArea = (a: (typeof FINANCE_AREAS)[number]) => goTo(`finance/${slug(a)}`);
  const [version, setVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  // On load: pull the latest class sheet if our copy is over 5 minutes old (cached numbers show meanwhile).
  useEffect(() => {
    fetch("/api/workbook/sync", { method: "POST", body: JSON.stringify({ auto: true }) })
      .then((r) => r.json())
      .then((d) => d.ok && !d.changes?.skipped && (refreshOverview(), setVersion((v) => v + 1)))
      .catch(() => {});
  }, []);
  const ask = (t: string) => (setChatOpen(true), askRef.current(t));
  const bump = () => setVersion((v) => v + 1);
  const tool = "rounded-md px-2.5 py-1 text-sm text-white/85 hover:bg-white/10 hover:text-white";
  return (
    <div className="flex flex-col min-h-screen">
      <CaptureModal key={capturePreset.k} preset={capturePreset} open={captureOpen} onClose={() => setCaptureOpen(false)} onSeed={(seed) => (setChatOpen(true), threadRef.current(seed))} onNote={(t) => noteRef.current(t)} />
      <RolePicker open={rolePicker || role === null} onDone={() => setRolePicker(false)} />
      <PresentReturn hash={hash} />
      <header className="board-bar">
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="wordmark text-xl sm:text-2xl">TRANSFORM!</span>
            <span className="eyebrow rounded border border-[var(--gold)]/70 text-[var(--gold)] px-1.5 py-0.5 shrink-0">Mgt Tool</span>
            <span className="font-display uppercase tracking-wider text-white/90 text-base sm:text-lg truncate">Flying Dragon<span className="hidden sm:inline"> · CFO desk</span></span>
            <span className="eyebrow text-white/60 hidden sm:inline">Team 1</span>
            <span className="hidden sm:flex"><YearRound version={version} onChange={bump} /></span>
          </div>
          <div className="flex items-center gap-2 ml-auto sm:ml-0 order-last sm:order-none">
            <button onClick={() => openCapture()} className="rounded-full bg-[var(--gold)] text-[var(--ink)] px-3 py-1 text-sm font-bold shadow whitespace-nowrap">＋ Capture</button>
            <a href="/setup" className="hidden sm:inline rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/90 hover:bg-white/10" title="How to set this app up">Setup</a>
            <a href="https://github.com/cdaeda/transform-mgt-tool" target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub"
              className="hidden sm:inline rounded-full border border-white/30 p-1.5 text-white/90 hover:bg-white/10">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
            </a>
            <button onClick={() => setRolePicker(true)} className="rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/90" title="Change your role">
              {role === "pending" ? "…" : role ?? "Pick role"}
            </button>
          </div>
          <details className="sm:hidden relative">
            <summary className="list-none rounded-md px-3 py-1 text-sm text-white/90 border border-white/25 cursor-pointer">Workbook ▾</summary>
            <div className="absolute right-0 mt-2 z-40 rounded-lg p-1 shadow-xl board-bar flex flex-col min-w-48" onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement).open = false}>
              <WorkbookTools tool={tool} bump={bump} cfo={cfo} />
            </div>
          </details>
          <nav className="hidden sm:flex flex-wrap gap-1 items-center" aria-label="Workbook">
            <WorkbookTools tool={tool} bump={bump} cfo={cfo} />
          </nav>
        </div>
        <div className="sm:hidden flex px-3 pb-2"><YearRound version={version} onChange={bump} /></div>
      </header>
      <div className="flex flex-col lg:flex-row flex-1">
        <main className="flex-1 min-w-0 p-3 sm:p-4 space-y-4 pb-20 lg:pb-4">
          {/* Phones: the game-table actions come first. */}
          <div className="sm:hidden grid grid-cols-2 gap-2" aria-label="Quick actions">
            <label className="rounded-xl bg-[var(--gold)] text-[var(--ink)] font-bold py-4 text-center text-lg shadow cursor-pointer">
              📷 Snap a card
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openCapture({ image: await toJpegBase64(f) }); }} />
            </label>
            <button onClick={() => openCapture({ roll: true })} className="rounded-xl board-bar text-white font-bold py-4 text-lg shadow">🎲 Log a roll</button>
          </div>
          {tab === "Dashboard" && <StrategyCard version={version} />}
          {tab !== "Presentation" && <MarketCapBar version={version} />}
          <nav className="flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap items-end relative z-10 !mb-0" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined} className="file-tab">{t}</button>
            ))}
          </nav>
          <div className="tab-panel space-y-4 !mt-0">
            {tab === "Dashboard" && <DashboardPanel version={version} onChanged={bump} onTune={() => setArea("What-if")} onPlan={() => setCapArea("Plan & strategies")} go={go} />}
            {tab === "Capital" && (<>
              <ProfitBorrow version={version} />
              <nav className="flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap -mt-1" aria-label="Capital areas">
                {CAPITAL_AREAS.map((a) => (
                  <button key={a} onClick={() => setCapArea(a)} aria-current={capArea === a ? "page" : undefined}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${capArea === a ? "bg-indigo-900 text-white" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>{a}</button>
                ))}
              </nav>
              {capArea === "Plan & strategies" && <CapitalPanel version={version} ask={ask} />}
              {capArea === "Analyst ratings" && <AnalystRatings version={version} ask={ask} />}
              {capArea === "Lever planner" && <PathTo50B version={version} ask={ask} makeTasks={makeTasks} />}
              {capArea === "Research" && <FinancingPanel ask={ask} />}
              {capArea === "Comparables" && <Comps ask={ask} />}
              {capArea === "Investor relations" && <InvestorRelationsPanel ask={ask} version={version} />}
              {capArea === "Strategy" && (<><StrategyCard version={version} /><AmbitionPanel onYear={bump} /></>)}
            </>)}
            {tab === "Tasks" && <TasksPanel version={version} onAct={(t) => (setChatOpen(true), actRef.current(t))} />}
            {tab === "Cards" && <CardsPanel ask={ask} onBooked={bump} cfo={cfo} />}
            {tab === "Finance" && (<>
              <ProfitBorrow version={version} plans={area === "Borrowing"} />
              <nav className="flex gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap -mt-1" aria-label="Finance areas">
                {FINANCE_AREAS.map((a) => (
                  <button key={a} onClick={() => setArea(a)} aria-current={area === a ? "page" : undefined}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${area === a ? "bg-indigo-900 text-white" : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>{a}</button>
                ))}
              </nav>
              {area === "What-if" && (<><EditToggle cfo={cfo} on={editMode} set={setEditMode} /><FinancesPanel version={version} onApplied={bump} editable={editing} cfo={cfo} /></>)}
              {area === "Simulator" && <Simulator version={version} ask={ask} />}
              {area === "Innovation" && <InnovationPanel ask={ask} version={version} />}
            </>)}
            {tab === "Activity" && <ActivityPanel version={version} />}
            {tab === "Presentation" && <DeckView embedded />}
            {tab === "Teams" && (<><RivalFinances version={version} /><TeamsPanel /></>)}
            {tab === "Workbook" && (<>
              <EditToggle cfo={cfo} on={editMode} set={setEditMode} />
              <AuditPanel version={version} />
              <section>
                <h2 className="text-lg mb-1">Leaderboard <span className="eyebrow text-zinc-500">market cap $M</span></h2>
                <Grid range="'Leaderboard 2026'!A6:N15" version={version} onWrote={bump} />
              </section>
              {SECTIONS.map((s) => (
                <details key={s.range} open={s.open} className="border-t border-zinc-200 dark:border-zinc-800 pt-2">
                  <summary className="font-display uppercase tracking-wide cursor-pointer">{s.title}</summary>
                  {editing && s.add && <div className="flex flex-wrap gap-2 my-2">{s.add.map((a) => <AddRowButton key={a.label} spec={a} onDone={bump} />)}</div>}
                  <Grid range={s.range} hide={s.hide} version={version} onWrote={bump} editable={editing} />
                </details>
              ))}
              <p className="text-xs text-zinc-500">{editing ? "Edit mode: white cells write to the Team 1 tab and the class sheet; grey cells are formulas and recalculate instantly." : "Read-only. The CFO edits numbers in edit mode."}</p>
            </>)}
          </div>
        </main>
        <button onClick={() => setChatOpen(true)} className="lg:hidden fixed bottom-4 right-4 z-30 rounded-full board-bar shadow-xl px-4 py-3 font-display uppercase tracking-wider text-sm">
          <span className="wordmark mr-1">✦</span>{tab} copilot
        </button>
        <aside aria-label="Copilot" className={`${chatOpen ? "fixed inset-0 z-50 bg-background p-3" : "hidden"} lg:block lg:static lg:w-[26rem] lg:h-[calc(100vh-3.5rem)] lg:sticky lg:top-0 lg:p-4`}>
          <div className="game-card relative h-full flex flex-col">
            {flash > 0 && <span key={flash} className="copilot-flash !absolute inset-0 rounded-[10px] pointer-events-none" aria-hidden />}
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg">{tab} copilot</h2>
              <button onClick={() => setChatOpen(false)} className="lg:hidden rounded-md border border-zinc-300 px-3 py-1 text-sm">Close</button>
            </div>
            {TABS.map((t) => (
              <div key={t} className={t === tab ? "flex-1 min-h-0" : "hidden"}>
                <Copilot tab={t} active={t === tab} pendingRef={pendingRef} onReply={bump} askRef={askRef} threadRef={threadRef} noteRef={noteRef} actRef={actRef} onTasks={bump} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
