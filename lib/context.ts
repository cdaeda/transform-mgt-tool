import { isBM, sql, type Card, type FinancingIdea, type Strategy, type Team } from "@/lib/db";
import { GAME_CONTEXT } from "@/lib/game-context";
import { actualMix } from "@/lib/finance";
import { readRange } from "@/lib/sheet";

const M = (n: number) => `${(Number(n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;

export async function loadState() {
  const [strategy, cards, teams, financing] = await Promise.all([
    sql<Strategy[]>`select * from strategy where id = 1`.then((r) => r[0]),
    sql<Card[]>`select * from cards order by created_at desc`,
    sql<Team[]>`select * from teams order by team_number`,
    sql<FinancingIdea[]>`select * from financing_ideas where status <> 'rejected' order by status, created_at`,
  ]);
  return { strategy, cards: [...cards], teams: [...teams], financing: [...financing] };
}

export const cardLine = (c: Card) =>
  !isBM(c.type)
    ? `#${c.id} [${c.status.toUpperCase()}] ${c.type}: ${c.title} - ${c.card_text}; AI: ${c.recommendation}${c.our_notes ? `; OUR CALL: ${c.our_notes}` : ""}`
    : `#${c.id} [${c.status.toUpperCase()}] ${c.type}: ${c.title} - capex ${M(c.capex)} in Y${c.start_year}; revenue Y1-10 ${c.revenue.map(M).join("/")}; cost ${c.cost.map(M).join("/")}; AI: ${c.recommendation}; partner: ${c.partner_verdict} ${c.partner_with}${c.our_notes ? `; OUR CALL: ${c.our_notes}` : ""}`;

// Game rules + our strategy + every card + rival profiles + a live sheet snapshot.
// Any part that can't be loaded is reported as unavailable instead of failing the request.
export async function buildContext() {
  const state = await loadState().catch((e) => e as Error);
  const cap = await readRange("O34:O43")
    .then((r) => `MARKET CAP from the workbook ($M, Years 1-10, col O): ${r.values.map((v, i) => `Y${i + 1} ${v[0] ?? 0}`).join(", ")}`)
    .catch(() => "MARKET CAP: (workbook unavailable)");
  const changed = await sql<{ last_diff: { at?: string; tabs?: Record<string, number>; team1?: { cell: string; before: string; after: string }[] } }[]>`select last_diff from workbook where id = 1`
    .then(([w]) => {
      const d = w?.last_diff;
      if (!d?.at) return "";
      const tabs = Object.entries(d.tabs ?? {}).map(([t, n]) => `${t} (${n} cells)`).join(", ") || "nothing";
      const ours = (d.team1 ?? []).slice(0, 40).map((c) => `${c.cell}: ${c.before || "(blank)"} -> ${c.after || "(blank)"}`).join("; ");
      return `LATEST WORKBOOK UPLOAD (${d.at}): changed ${tabs}.${ours ? ` Our Team 1 changes: ${ours}` : ""} Rival tabs that changed may reveal new cards or strategy moves.`;
    })
    .catch(() => "");
  const sheet = await Promise.all([readRange("A30:S43"), readRange("A240:AF260"), readRange("'Leaderboard 2026'!A6:N15")])
    .then((rs) => rs.map((r) => `${r.range}\n${r.values.map((row) => row.join(" | ")).join("\n")}`).join("\n\n"))
    .catch((e) => `(sheet unavailable: ${e instanceof Error ? e.message : e})`);

  const s = (state instanceof Error ? {} : state.strategy) as Strategy & Record<string, number | null>;
  const mix = state instanceof Error ? "" : await actualMix(state.strategy.current_year)
    .then((m) => `H1 ${m.pct.h1}% / H2 ${m.pct.h2}% / H3 ${m.pct.h3}% of $${(m.total / 1e6).toFixed(1)}M spend`)
    .catch(() => "(unavailable)");
  const ours =
    state instanceof Error
      ? `(strategy database unavailable: ${state.message})`
      : `AMBITION (headline): ${state.strategy.ambition || "(not set yet)"}
CORE STRATEGY: ${state.strategy.core_strategy}
SHORT TERM: ${state.strategy.short_term}
SHORT-TERM OPEX REDUCTION PLAN (owner: CAIO): ${state.strategy.opex_plan || "(not written yet)"}
MEDIUM TERM: ${state.strategy.medium_term}
CURRENT GAME YEAR: ${state.strategy.current_year}
TUNER KNOB: ${s.knob}/100 -> TARGET MIX H1 ${s.h1_pct}% / H2 ${s.h2_pct}% / H3 ${s.h3_pct}%; ACTUAL THIS YEAR ${mix}
HORIZON TARGETS: H1 Core BM profit ${s.h1_target ?? "(not set)"}; H2 Growth/data revenue ${s.h2_target ?? "(not set)"}; H3 partners ${s.h3_partners} signed of ${s.h3_target ?? "(not set)"}

CARDS WE HAVE DRAWN - all of them stay in consideration (newest first; amounts in dollars):
${state.cards.map(cardLine).join("\n") || "(none yet)"}

FINANCING OPTIONS (PICKED = the team chose it; IDEA = still open):
${state.financing.map((f) => `#${f.id} [${f.status.toUpperCase()}] ${f.name} (${f.category}) - ${f.amount} at ${f.cost}; source: ${f.source}; AI: ${f.recommendation}${f.our_notes ? `; OUR CALL: ${f.our_notes}` : ""}`).join("\n") || "(none yet)"}

OTHER TEAMS:
${state.teams.map((t) => `Team ${t.team_number} ${t.company}: ambition ${t.ambition || "?"}; seen with ${t.observed_cards || "?"}; profile: ${t.ai_profile || "?"}; plug-in: ${t.plug_in || "?"}`).join("\n") || "(no profiles yet)"}`;

  return `${GAME_CONTEXT}
OUR STRATEGY - the team's own decisions are binding. Build on them; if new information argues
against one, say so explicitly rather than quietly ignoring it. "OUR CALL" notes on cards override
the AI recommendation.
${ours}

${cap}
${changed}

LIVE SHEET SNAPSHOT ('Team 1' summary + market cap block, leaderboard):
${sheet}`;
}
