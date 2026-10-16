"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";
import { refreshOverview, useOverview } from "./overview-store";
import type { Card, FinancingIdea, Strategy, Team } from "@/lib/db";
import { impact, n2col, type ImpactCard } from "@/lib/impact";

// Local copy: importing values from lib/db would pull the database driver into the browser bundle.
const isBM = (c: Card): c is Card & ImpactCard => ["Core", "Growth", "Explore"].includes(c.type);

type Audit = {
  verdict: "PASS" | "WARN" | "FAIL";
  summary: string;
  issues: { cell: string; severity: string; problem: string; fix?: string }[];
};
const auditText = (a: Audit) =>
  `Critic: ${a.verdict} — ${a.summary}` + a.issues.map((i) => `\n• ${i.cell} [${i.severity}] ${i.problem}${i.fix ? ` → ${i.fix}` : ""}`).join("");

const M = (n: number) => `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
const input = "rounded-md border border-zinc-300 dark:border-zinc-700 p-2 text-sm w-full";
const btn = "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors";

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok || d?.error) throw new Error(d?.error ?? r.statusText);
  return d;
}

// Shrink phone photos so the upload stays far under Vercel's 4.5 MB body limit.
async function toJpegBase64(file: File) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export function AmbitionPanel({ onYear }: { onYear: () => void }) {
  const [s, setS] = useState<Strategy | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api<Strategy>("/api/strategy").then(setS, (e) => setErr(e.message));
  }, []);
  if (err) return <p className="text-sm text-red-600">Strategy: {err}</p>;
  if (!s) return null;
  const set = (k: keyof Strategy) => (e: { target: { value: string } }) => (setSaved(false), setS({ ...s, [k]: k === "current_year" ? Number(e.target.value) : e.target.value }));
  const save = () => api("/api/strategy", "PUT", s).then(() => setSaved(true), (e) => setErr(e.message));
  return (
    <section className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/60 p-5 space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Our ambition</span>
        <textarea value={s.ambition} onChange={set("ambition")} onBlur={save} placeholder="What are we trying to achieve?"
          className="w-full !bg-transparent font-display text-2xl sm:text-3xl font-semibold leading-tight border-b border-amber-300 focus:outline-none text-indigo-950 dark:text-white resize-none" rows={3} />
      </label>
      <label className="block text-sm"><span className="eyebrow text-amber-700 dark:text-amber-300">Core strategy</span>
        <textarea value={s.core_strategy} onChange={set("core_strategy")} onBlur={save} rows={2} className={input} /></label>
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <label><span className="eyebrow text-amber-700 dark:text-amber-300">Short term</span>
          <textarea value={s.short_term} onChange={set("short_term")} onBlur={save} rows={3} className={input} /></label>
        <label><span className="eyebrow text-amber-700 dark:text-amber-300">Short-term opex reduction (owner: CAIO)</span>
          <textarea value={s.opex_plan} onChange={set("opex_plan")} onBlur={save} rows={3} placeholder="What we cut, by when, how much" className={input} /></label>
        <label><span className="eyebrow text-amber-700 dark:text-amber-300">Medium term</span>
          <textarea value={s.medium_term} onChange={set("medium_term")} onBlur={save} rows={3} className={input} /></label>
      </div>
      <label className="text-sm">Current game year{" "}
        <select value={s.current_year} onChange={(e) => (set("current_year")(e), api("/api/strategy", "PUT", { current_year: Number(e.target.value) }).then(onYear))}
          className="rounded-md border border-zinc-300 px-2 py-1">
          {Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
        </select>
        {saved && <span className="ml-3 text-green-700">Saved</span>}
      </label>
    </section>
  );
}

const STATUS_STYLE: Record<Card["status"], string> = {
  candidate: "border-zinc-300 dark:border-zinc-700",
  selected: "border-amber-500",
  booked: "border-green-600",
  passed: "border-zinc-200 dark:border-zinc-800 opacity-60",
};

function CardRow({ card, onChange, ask, cfo }: { card: Card; onChange: (c: Card) => void; ask: (t: string) => void; cfo: boolean }) {
  const [notes, setNotes] = useState(card.our_notes);
  const [msg, setMsg] = useState("");
  const patch = (p: Partial<Card>) => api<Card>("/api/cards", "PATCH", { id: card.id, ...p }).then(onChange, (e) => setMsg(e.message));
  const [booking, setBooking] = useState(false);
  const book = () => {
    setBooking(true);
    setMsg("Writing to a scratch copy; the critic is auditing it…");
    api<{ card: Card; saved: boolean; cells: string[]; audit: Audit | null; pushed?: number; pushError?: string }>("/api/cards/book", "POST", { id: card.id })
      .then(
        (r) => {
          onChange(r.card);
          setMsg(
            `${r.saved ? `Booked into ${r.cells.join(", ")}${r.pushError ? ` ⚠ ${r.pushError}` : ` and written to the class sheet (${r.pushed} cells)`}` : "NOT saved — the critic rejected it"}. ` +
              (r.audit ? auditText(r.audit) : ""),
          );
        },
        (e) => setMsg(e.message),
      )
      .finally(() => setBooking(false));
  };
  const tenYr = card.revenue.reduce((a, b) => a + b, 0) - card.cost.reduce((a, b) => a + b, 0);
  return (
    <li className={`game-card border-l-4 ${STATUS_STYLE[card.status]} space-y-1.5`}>
      <div className="flex flex-wrap items-baseline gap-2">
        {card.lens && <span className="eyebrow text-zinc-500">{card.lens}</span>}
        <span className="chip" data-type={card.type}>{card.type}</span>
        <b>{card.title}</b>
        <span className="text-xs text-zinc-500">
          {isBM(card) && <>capex {M(card.capex)} Y{card.start_year} · 10-yr BM profit {M(tenYr)} · </>}AI: {card.recommendation} · {card.partner_verdict}
          {card.partner_with && ` (${card.partner_with})`}
        </span>
        <select value={card.status} onChange={(e) => patch({ status: e.target.value as Card["status"] })} disabled={card.status === "booked"}
          aria-label="Status" className="ml-auto text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-transparent">
          <option value="candidate">Candidate</option><option value="selected">Selected</option>
          <option value="passed">Pass</option><option value="booked" disabled>Booked</option>
        </select>
      </div>
      {card.horizon_fit?.H1 && (
        <div className="grid gap-1.5 sm:grid-cols-3" aria-label="Fit with our horizons">
          {(["H1", "H2", "H3"] as const).map((h) => {
            const f = card.horizon_fit[h]!;
            const hue = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)" }[h];
            return (
              <div key={h} className="text-xs" title={f.why}>
                <div className="flex justify-between"><span className="eyebrow">{h}{card.primary_horizon === h && " · primary"}</span><span className="tabular-nums font-semibold">{f.score}</span></div>
                <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden" role="meter" aria-label={`${h} fit`} aria-valuenow={f.score} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full" style={{ width: `${f.score}%`, background: hue }} />
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{f.why}</p>
              </div>
            );
          })}
        </div>
      )}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== card.our_notes && patch({ our_notes: notes })}
        rows={1} placeholder="What WE want to do with this card (binding)" aria-label="Our call" className={input} />
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500">{isBM(card) ? "AI evaluation" : "AI evaluation & draft response"} · to partner or not to partner</summary>
        <p className="italic text-zinc-500 my-1">{card.card_text}</p>
        <Markdown>{card.evaluation}</Markdown>
        <h4 className="font-semibold mt-2">To partner or not to partner: {card.partner_verdict} {card.partner_with}</h4>
        <Markdown>{card.partner_reasoning}</Markdown>
        {isBM(card) && <p className="text-xs text-zinc-500 mt-1">Revenue Y1–10: {card.revenue.map(M).join(" · ")}<br />Cost Y1–10: {card.cost.map(M).join(" · ")}</p>}
      </details>
      <div className="flex gap-2 flex-wrap items-center">
        {card.status === "selected" && isBM(card) && cfo && <button onClick={book} disabled={booking} className={`${btn} bg-green-700 text-white`}>Book into workbook (audited)</button>}
        <button onClick={() => ask(`Let's discuss card #${card.id} (${card.title}). Re-check it against our current numbers, ambition and the other teams, and tell me what you'd do and whether to partner.`)} className={`${btn} border border-zinc-400`}>Discuss with CFO</button>
        {msg && <span className="text-xs whitespace-pre-wrap">{msg}</span>}
      </div>
    </li>
  );
}

function RollsSummary({ cfo }: { cfo: boolean }) {
  const [d, setD] = useState<{ year: number; rolls: { id: number; square: string; booked: boolean; created_at: string }[] } | null>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => void fetch("/api/rolls").then((r) => r.json()).then((x) => !x.error && setD(x), () => {}), []);
  useEffect(load, [load]);
  if (!d) return null;
  const pending = d.rolls.filter((r) => !r.booked).length;
  const bookAll = async () => {
    setMsg("Booking with the critic…");
    const r = await fetch("/api/rolls", { method: "POST", body: JSON.stringify({ bookPending: true }) }).then((x) => x.json());
    setMsg(r.error ?? (r.booked ? `Booked ${r.booked} roll(s).` : `Not booked — ${r.audit?.summary ?? "the critic rejected it"}`));
    load();
  };
  return (
    <p className="text-sm">
      <span className="font-semibold">🎲 {d.rolls.length} roll{d.rolls.length === 1 ? "" : "s"} in Year {d.year}</span>
      <span className="text-zinc-500"> · ${(d.rolls.length * 0.1).toFixed(1)}M on rolling{d.rolls.length > 0 && ` · last: ${d.rolls.slice(0, 4).map((r) => r.square).join(", ")}`}{pending > 0 && ` · ⚠ ${pending} roll cost${pending === 1 ? "" : "s"} waiting for the CFO`}</span>
      {pending > 0 && cfo && <button onClick={bookAll} className="ml-2 rounded-md border border-green-700 text-green-800 dark:text-green-300 px-2 py-0.5 text-xs font-semibold">Book {pending} × $100k</button>}
      {msg && <span className="ml-2 text-xs">{msg}</span>}
    </p>
  );
}

export function CardsPanel({ ask, onBooked, cfo }: { ask: (t: string) => void; onBooked: () => void; cfo: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [typed, setTyped] = useState("");
  const load = useCallback(() => api<Card[]>("/api/cards").then(setCards, (e) => setErr(e.message)), []);
  useEffect(() => void load(), [load]);

  async function evaluate(body: { image?: string; text?: string }) {
    setBusy(true);
    setErr("");
    try {
      const card = await api<Card>("/api/cards", "POST", body);
      setCards((cs) => [card, ...cs]);
      setTyped("");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const update = (c: Card) => {
    setCards((cs) => cs.map((x) => (x.id === c.id ? c : x)));
    if (c.status === "booked") onBooked();
  };

  const chosen = cards.filter((c) => c.status === "selected" || c.status === "booked").filter(isBM);
  const rows = impact(chosen);
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Our cards <span className="text-sm font-normal text-zinc-500">business models, events, challenges, anything we draw</span></h2>
        <label className={`${btn} bg-amber-600 text-white cursor-pointer`}>
          📷 Photograph a card
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) evaluate({ image: await toJpegBase64(f) }); }} />
        </label>
        {busy && <span className="text-sm text-zinc-500">Reading the card, checking our numbers and rivals… (~40s)</span>}
      </div>
      <RollsSummary cfo={cfo} />
      <form onSubmit={(e) => (e.preventDefault(), typed.trim() && evaluate({ text: typed }))} className="flex gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="…or type a card: 'Growth: invest 12M, 5M/yr revenue, 0.5M opex' or paste an event card"
          aria-label="Type a card" className={input} />
        <button disabled={busy} className={`${btn} bg-indigo-900 text-white`}>Evaluate</button>
      </form>
      {err && <p className="text-sm text-red-600">{err}</p>}

      {chosen.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="font-semibold text-sm">Impact of selected + booked cards ({chosen.length})</h3>
          <table className="text-xs border-collapse">
            <thead><tr><th className="text-left pr-2"></th>{rows.map((r) => <th key={r.year} className="px-2">Y{r.year}</th>)}</tr></thead>
            <tbody>
              {([["Revenue", "revenue"], ["Op cost", "cost"], ["Cap.ex", "capex"], ["BM profit", "profit"], ["After 21% tax", "afterTax"], ["Cumulative cash", "cash"]] as const).map(([label, k]) => (
                <tr key={k}><td className="pr-2 text-zinc-500">{label}</td>{rows.map((r) => <td key={r.year} className={`px-2 text-right ${r[k] < 0 ? "text-red-600" : ""}`}>{M(r[k])}</td>)}</tr>
              ))}
              <tr><td className="pr-2 text-zinc-500">Market cap from BMs</td>{rows.map((r) => <td key={r.year} className="px-2 text-right">+{r.bmMcap}M</td>)}</tr>
            </tbody>
          </table>
          <p className="text-xs text-zinc-500">Excludes the cash ×100 market-cap term and analyst cards. Book a card to make the sheet the source of truth.</p>
        </div>
      )}

      <ul className="space-y-3">
        {cards.map((c) => <CardRow key={c.id} card={c} onChange={update} ask={ask} cfo={cfo} />)}
      </ul>
    </section>
  );
}

function TeamRow({ n, team, onSaved }: { n: number; team?: Team; onSaved: (t: Team) => void }) {
  const [t, setT] = useState<Partial<Team>>(team ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof Team) => (e: { target: { value: string } }) => setT({ ...t, [k]: e.target.value });
  const save = () => api<Team>("/api/teams", "PUT", { ...t, team_number: n }).then(onSaved, (e) => setErr(e.message));
  const profile = async () => {
    setBusy(true);
    setErr("");
    await save();
    await api<Team>("/api/teams", "POST", { team_number: n }).then((p) => (setT(p), onSaved(p)), (e) => setErr(e.message));
    setBusy(false);
  };
  return (
    <details className="border-t border-zinc-200 dark:border-zinc-800 py-2">
      <summary className="cursor-pointer"><b>Team {n}</b> {t.company} {t.ambition && <span className="text-zinc-500">— {t.ambition}</span>}</summary>
      <div className="grid gap-2 md:grid-cols-3 mt-2">
        <input value={t.company ?? ""} onChange={set("company")} onBlur={save} placeholder="Company" aria-label="Company" className={input} />
        <input value={t.ambition ?? ""} onChange={set("ambition")} onBlur={save} placeholder="Their ambition" aria-label="Their ambition" className={input} />
        <input value={t.observed_cards ?? ""} onChange={set("observed_cards")} onBlur={save} placeholder="Cards we've seen them with" aria-label="Cards seen" className={input} />
        <textarea value={t.notes ?? ""} onChange={set("notes")} onBlur={save} rows={2} placeholder="Other observations" aria-label="Notes" className={`${input} md:col-span-3`} />
      </div>
      <button onClick={profile} disabled={busy} className={`${btn} bg-indigo-900 text-white mt-2`}>{busy ? "Profiling…" : "Profile with AI"}</button>
      {err && <span className="text-sm text-red-600 ml-2">{err}</span>}
      {t.ai_profile && (
        <div className="grid gap-3 md:grid-cols-2 text-sm mt-2">
          <div><h4 className="font-semibold">Profile</h4><Markdown>{t.ai_profile ?? ""}</Markdown></div>
          <div><h4 className="font-semibold">How they plug into us</h4><Markdown>{t.plug_in ?? ""}</Markdown></div>
        </div>
      )}
    </details>
  );
}

export function TeamsPanel() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Team[]>("/api/teams").then(setTeams, (e) => setErr(e.message));
  }, []);
  const saved = (t: Team) => setTeams((ts) => [...(ts ?? []).filter((x) => x.team_number !== t.team_number), t]);
  return (
    <section>
      <h2 className="text-lg font-semibold">Rival profiles</h2>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {teams && [2, 3, 4, 5, 6].map((n) => (
        <TeamRow key={n} n={n} team={teams.find((t) => t.team_number === n)} onSaved={saved} />
      ))}
    </section>
  );
}

export function AuditPanel({ version }: { version: number }) {
  const [log, setLog] = useState<(Audit & { id: number; created_at: string; reason: string; saved: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const load = useCallback(() => api<typeof log>("/api/audit").then(setLog, () => {}), []);
  useEffect(() => void load(), [load, version]);
  const run = async () => {
    setBusy(true);
    setResult("");
    await api<Audit>("/api/audit", "POST").then((a) => setResult(auditText(a)), (e) => setResult(e.message));
    setBusy(false);
    load();
  };
  const color = { PASS: "text-green-700 dark:text-green-400", WARN: "text-amber-600", FAIL: "text-red-600" };
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Audit</h2>
        <button onClick={run} disabled={busy} className={`${btn} bg-indigo-900 text-white`}>{busy ? "Critic is auditing…" : "Audit workbook now"}</button>
      </div>
      <p className="text-xs text-zinc-500">Bookings and CFO-chat edits are checked by an independent critic before they are saved (FAIL = rolled back). Manual cell edits save directly — run an audit after making them.</p>
      {result && <div className="text-sm whitespace-pre-wrap">{result}</div>}
      {log.length > 0 && (
        <details>
          <summary className="text-sm cursor-pointer">Audit trail ({log.length})</summary>
          <ul className="text-xs space-y-1 mt-1">
            {log.map((a) => (
              <li key={a.id}>
                <b className={color[a.verdict]}>{a.verdict}</b> {a.saved ? "saved" : "not saved"} · {new Date(a.created_at).toLocaleString()} · {a.reason.split("\n")[0]} — {a.summary}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const REC_STYLE: Record<string, string> = { USE: "text-green-700 dark:text-green-400", CONSIDER: "text-amber-600", AVOID: "text-red-600" };

function IdeaRow({ idea, onChange, ask }: { idea: FinancingIdea; onChange: (f: FinancingIdea) => void; ask: (t: string) => void }) {
  const [notes, setNotes] = useState(idea.our_notes);
  const patch = (p: Partial<FinancingIdea>) => api<FinancingIdea>("/api/financing", "PATCH", { id: idea.id, ...p }).then(onChange);
  const border = idea.status === "picked" ? "border-green-600" : idea.status === "rejected" ? "border-zinc-200 dark:border-zinc-800 opacity-60" : "border-zinc-300 dark:border-zinc-700";
  return (
    <li className={`game-card border-l-4 ${border} space-y-1.5`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="chip">{idea.category}</span>
        <b>{idea.name}</b>
        <span className="text-xs text-zinc-500">{idea.amount} · {idea.cost} · <span className={REC_STYLE[idea.recommendation]}>AI: {idea.recommendation}</span> · {idea.source}</span>
        <select value={idea.status} onChange={(e) => patch({ status: e.target.value as FinancingIdea["status"] })} aria-label="Pick"
          className="ml-auto text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-transparent">
          <option value="idea">Idea</option><option value="picked">Picked</option><option value="rejected">Rejected</option>
        </select>
      </div>
      <p className="text-sm">{idea.how_it_works}</p>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== idea.our_notes && patch({ our_notes: notes })}
        rows={1} placeholder="How WE would use it (amount, timing, what it funds)" aria-label="Our call" className={input} />
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500">Fit for us · risks · source</summary>
        <h4 className="font-semibold mt-1">Fit</h4><Markdown>{idea.fit}</Markdown>
        <h4 className="font-semibold mt-1">Risks</h4><Markdown>{idea.risks}</Markdown>
        {idea.source_quote && <blockquote className="italic text-zinc-500 border-l-2 pl-2 mt-1">&ldquo;{idea.source_quote}&rdquo;</blockquote>}
      </details>
      {idea.status === "picked" && (
        <button onClick={() => ask(`We picked financing option #${idea.id} "${idea.name}". Our plan: ${notes || "(not written yet)"}. Model it in the Team 1 workbook (debt block, interest in column K, cash in N) for the right years - say the exact cells first, keep everything consistent for the auditor - and tell me the effect on EPS, interest/revenue and debt-to-assets.`)}
          className={`${btn} border border-zinc-400`}>Model it with the CFO</button>
      )}
    </li>
  );
}

export function FinancingPanel({ ask }: { ask: (t: string) => void }) {
  const [ideas, setIdeas] = useState<FinancingIdea[]>([]);
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => void api<FinancingIdea[]>("/api/financing").then(setIdeas, (e) => setErr(e.message)), []);

  async function extract(body: { text?: string; pdf?: string }) {
    setBusy(true);
    setErr("");
    try {
      const added = await api<FinancingIdea[]>("/api/financing", "POST", { ...body, source });
      setIdeas((xs) => [...xs, ...added]);
      setText("");
      if (!added.length) setErr("No new financing ideas found in that source.");
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  const update = (f: FinancingIdea) => setIdeas((xs) => xs.map((x) => (x.id === f.id ? f : x)));
  const picked = ideas.filter((i) => i.status === "picked");
  const ranked = ideas.filter((i) => i.rank !== null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const rest = ideas.filter((i) => i.rank === null);
  const categories = [...new Set(rest.map((i) => i.category))];

  return (
    <section className="space-y-3">
      {ranked.length > 0 && (
        <section aria-label="Top funding plays" className="space-y-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-2xl">Top {ranked.length} funding plays</h2>
            <span className="text-xs text-zinc-500">Ranked most to least lender-friendly · sources: docs/ai-funding-research.md</span>
          </div>
          <ol className="space-y-3">
            {ranked.map((i) => (
              <li key={i.id} className={`game-card grid gap-3 sm:grid-cols-[4rem_1fr] ${i.status === "picked" ? "ring-2 ring-green-700" : i.status === "rejected" ? "opacity-60" : ""}`}>
                <div className="font-display text-6xl leading-none text-amber-600 num" aria-label={`Rank ${i.rank}`}>{i.rank}</div>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-xl leading-tight">{i.name}</h3>
                    <span className={`eyebrow ${REC_STYLE[i.recommendation]}`}>AI: {i.recommendation}</span>
                    <select value={i.status} onChange={(e) => api<FinancingIdea>("/api/financing", "PATCH", { id: i.id, status: e.target.value }).then(update)}
                      aria-label={`Pick ${i.name}`} className="ml-auto text-sm rounded-md border border-zinc-300 dark:border-zinc-700">
                      <option value="idea">Idea</option><option value="picked">Picked</option><option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <p className="text-sm">{i.how_it_works}</p>
                  <blockquote className="text-sm italic text-zinc-600 dark:text-zinc-400 border-l-2 border-amber-500 pl-2">{i.source_quote}</blockquote>
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <p><span className="eyebrow text-green-700 dark:text-green-400">Why it fits us </span>{i.fit}</p>
                    <p><span className="eyebrow text-red-600">Watch out </span>{i.risks}</p>
                  </div>
                  <p className="text-xs text-zinc-500">{i.source}</p>
                  {i.status === "picked" && (
                    <button onClick={() => ask(`We picked funding play #${i.rank} "${i.name}". Size it for us (the cash gap, H2 satellite data, H3 partners), say what we'd ask the lead lender, and model it in the Team 1 workbook if it changes debt, interest, cash or shares - exact cells first.`)}
                      className={`${btn} border border-zinc-400`}>Size it with the CFO</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <h2 className="text-lg font-semibold pt-2">All financing ideas</h2>
      {picked.length > 0 && <p className="text-sm"><b>Picked:</b> {picked.map((p) => p.name).join(" · ")}</p>}
      <div className="rounded border border-zinc-300 dark:border-zinc-700 p-3 space-y-2">
        <p className="text-sm text-zinc-500">Add ideas from an article or handout: paste its text, or upload it as a PDF (in the browser: Print → Save as PDF).</p>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source name, e.g. FT: The huge lurking leverage of AI hyperscalers (12 Oct 2026)" aria-label="Source" className={input} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste the article text here" aria-label="Article text" className={input} />
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => text.trim() && extract({ text })} disabled={busy || !text.trim()} className={`${btn} bg-indigo-900 text-white`}>Extract from text</button>
          <label className={`${btn} border border-zinc-400 cursor-pointer`}>
            Upload PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const b64 = btoa(new Uint8Array(await f.arrayBuffer()).reduce((a, c) => a + String.fromCharCode(c), ""));
              extract({ pdf: b64 });
            }} />
          </label>
          {busy && <span className="text-sm text-zinc-500">Reading the source and checking each idea against our covenants and plan… (~1 min)</span>}
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
      {categories.map((c) => (
        <div key={c}>
          <h3 className="font-semibold text-sm mt-2">{c}</h3>
          <ul className="space-y-2">{rest.filter((i) => i.category === c).map((i) => <IdeaRow key={i.id} idea={i} onChange={update} ask={ask} />)}</ul>
        </div>
      ))}
    </section>
  );
}

const $M = (m: number) => {
  const a = Math.abs(m), sign = m < 0 ? "−" : "";
  return a >= 1000 ? `${sign}$${(a / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })}B` : `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
};
const $x = (n: number, d = 2) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(d)}`;

// Market cap straight from the workbook's own formulas (column O = row 260 per year, in $M),
// so it is always whatever the spreadsheet says. Refreshes whenever the workbook changes.
type Overview = { year: number; certificate: { caps: number[]; price: number[]; eps: number[]; parts: Record<string, number>; rank: string } };

// Figures count up from where they were to the new value (skipped if reduced motion is on).
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, end = value;
    from.current = value;
    if (start === end || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return void requestAnimationFrame(() => setShown(end));
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(start + (end - start) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function MarketCapBar({ version }: { version: number }) {
  const o = useOverview<Overview>(version);
  const err = !o?.data?.certificate ? o?.error : "";
  const d = o?.data?.certificate ? { year: o.data.year, ...o.data.certificate } : null;
  if (err) return <p className="text-sm text-red-600">Market cap: {err}</p>;
  if (!d)
    return (
      <section className="certificate certificate-loading p-6 h-56 sm:h-48" aria-label="Loading market cap" aria-busy="true">
        <Guilloche />
        <p className="relative eyebrow text-amber-300">Flying Dragon · share certificate</p>
        <p className="relative figure text-6xl mt-2 text-white/30">$&thinsp;···</p>
        <p className="relative eyebrow text-white/60 mt-2">Engraving the latest numbers…</p>
      </section>
    );
  const now = d.caps[d.year - 1] ?? 0;
  const pct = Math.min(100, (now / 50000) * 100);
  const max = Math.max(...d.caps.map(Math.abs), 1);
  return (
    <section className="certificate p-5 sm:p-6" aria-label="Market cap">
      <Guilloche />
      <div className="relative grid gap-5 md:grid-cols-[1fr_auto] items-end">
        <div>
          <p className="eyebrow text-amber-300 flex flex-wrap items-center gap-x-2">
            <span>Flying Dragon · share certificate · Year {d.year}</span>
            <button onClick={() => refreshOverview()} className="text-white/60 hover:text-white normal-case tracking-normal" title="Refresh from the workbook">
              {o?.refreshing ? <span className="inline-flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300 animate-ping" />updating…</span> : `↻ ${o ? ago(o.at) : ""}`}
            </button>
          </p>
          <p className={`figure text-6xl sm:text-7xl mt-1 ${now < 0 ? "text-[#ff9aa2]" : ""}`}><CountUp value={now} format={$M} /></p>
          <p className="eyebrow text-white/70 mt-1 text-[0.65rem] sm:text-[0.72rem]">market cap · {Object.entries(d.parts).map(([k, v]) => `${k} ${$M(v)}`).join(" · ")}</p>
        </div>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-right">
          <div><dt className="eyebrow text-white/60">Per share</dt><dd className="figure text-3xl"><CountUp value={d.price[d.year - 1]} format={(n) => $x(n)} /></dd></div>
          <div><dt className="eyebrow text-white/60">EPS</dt><dd className="figure text-3xl"><CountUp value={d.eps[d.year - 1]} format={(n) => $x(n)} /></dd></div>
          <div><dt className="eyebrow text-white/60">Leaderboard</dt><dd className="figure text-3xl">{d.rank ? d.rank.split(" ")[0] : "—"}</dd></div>
        </dl>
      </div>
      <div className="relative mt-5">
        <div className="flex justify-between eyebrow text-white/70 mb-1">
          <span>{now < 0 ? "Below zero: the $50B climb starts at $0" : `${pct.toFixed(1)}% of the way`}</span><span className="text-amber-300 whitespace-nowrap">$50B<span className="hidden sm:inline"> · $50 a share</span></span>
        </div>
        <div className="rail h-2.5 rounded-full overflow-hidden" role="progressbar" aria-label="Progress to $50B" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(pct, 0.6)}%`, opacity: now < 0 ? 0.35 : 1 }} />
        </div>
      </div>
      <div className="relative mt-4 flex items-end gap-1.5 h-12" aria-label="Market cap by year">
        {d.caps.map((c, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`Year ${i + 1}: ${$M(c)} · ${$x(d.price[i])}/share`}>
            <div className={`w-full rounded-sm ${c < 0 ? "bg-[#ff9aa2]" : i + 1 === d.year ? "bg-amber-400" : "bg-white/25"} ${i + 1 === d.year ? "ring-1 ring-amber-300" : ""}`} style={{ height: `${Math.max(3, (Math.abs(c) / max) * 32)}px` }} />
            <span className={`num text-[10px] ${i + 1 === d.year ? "text-amber-300" : "text-white/55"}`}>Y{i + 1}</span>
          </div>
        ))}
      </div>
      <details className="relative mt-3 text-xs text-white/75">
        <summary className="cursor-pointer eyebrow text-white/70">What moves our share price</summary>
        <p className="mt-1">Market cap here is not a revenue multiple. The workbook adds three parts, and share price = market cap ÷ shares (column P):</p>
        <ul className="list-disc ml-5">
          <li>Each active business model: Core +$0.10 a share (+100M), Growth +$0.50 (+500M), Explore +$1.00 (+1BN).</li>
          <li>Analyst cards: Outperform +$2.50, Buy +$1.00, Hold +$0.01, Sell −$1.00, Crash −$2.50.</li>
          <li>Cash: +$0.10 a share per $1M (cash × 100), capped at the value of the BMs + analyst cards.</li>
        </ul>
        <p>Revenue and profit count only by building cash and earning better analyst cards. Cell {n2col(5 + 3 * (d.year - 1))}260 holds this year&rsquo;s total.</p>
      </details>
    </section>
  );
}

// Engraved banknote linework, like the game's cash notes: interleaved sine bands.
function Guilloche() {
  const paths = Array.from({ length: 22 }, (_, k) => {
    const amp = 18 + (k % 5) * 6, phase = k * 0.42, base = 20 + k * 9;
    const pts = Array.from({ length: 121 }, (_, i) => {
      const x = i * 10;
      return `${x},${(base + amp * Math.sin(x / 70 + phase) + (amp / 3) * Math.sin(x / 23 - phase)).toFixed(1)}`;
    });
    return `M${pts.join(" L")}`;
  });
  return (
    <svg className="guilloche" viewBox="0 0 1200 240" preserveAspectRatio="none" aria-hidden="true">
      {paths.map((p, i) => <path key={i} d={p} fill="none" stroke={i % 3 ? "#ffffff" : "#c9a227"} strokeWidth="0.7" />)}
    </svg>
  );
}
