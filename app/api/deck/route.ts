import { logActivity } from "@/lib/activity";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildContext } from "@/lib/context";
import { listRounds } from "@/lib/rounds";
import { sql, type Strategy } from "@/lib/db";
import { defaultOutlook, financingPlanText, outlookBaseFrom, outlookText, type PlanStrat } from "@/lib/outlook";
import { getSnapshot } from "@/lib/snapshot";
import { Deck, DECK_EVENT as EVENT } from "@/lib/deck";

export const maxDuration = 300;

const client = new Anthropic();

async function outlookPrompt() {
  const [[st], snap] = await Promise.all([sql<Strategy[]>`select current_year, goal_year, outlook from strategy where id = 1`, getSnapshot()]);
  const o = { ...defaultOutlook(st.current_year, st.goal_year), ...(st.outlook ?? {}) };
  const strats = await sql<PlanStrat[]>`select name, status, year, scale, category, effect from financing_ideas where status in ('locked', 'pitching')`;
  const comps = await sql<{ company: string; ticker: string; valuation_usd_b: number | null; basis: string; as_of: string; revenue_usd_b: number | null }[]>`select company, ticker, valuation_usd_b, basis, as_of, revenue_usd_b from comps where batch = (select max(batch) from comps)`;
  const compsText = comps.map((c) => `${c.company} (${c.ticker}): ${c.valuation_usd_b === null ? "n/a" : `$${c.valuation_usd_b}B`} ${c.basis}, ${c.as_of}${c.revenue_usd_b !== null ? `, revenue $${c.revenue_usd_b}B` : ""}`).join("\n") || "(none researched yet)";
  return `${outlookText(outlookBaseFrom(snap, st.current_year), o)}\n\nCOMPARABLES (dated; the value pools for space and fintech):\n${compsText}\n\nFINANCING PLAN (by instrument; use it on the deliver slide - say plainly whether we sell shares, issue bonds or take loans, raise partner/customer money, and how we return cash; and say how the NEW VENTURES (Terralink space and fintech) are funded: the initial funding raised now - including any advisor-structured raise and its fee - and then the launch capital from the sale):\n${financingPlanText(strats, o)}`;
}

const ASK = `Write our deck for the ${EVENT} (management event card): "Prepare a short presentation outlining
your key achievements over the past twelve months. Present your financial results for the year. Most
importantly, outline your transformation roadmap and how you will deliver on your transformation journey.
Keep it short. Make it visual." Investors, analysts and the business press are in the room; the goal is to
convince capital markets there is a big valuation here (our path to $50B), and to turn our Sell ratings.

THE STORY IS A TURNAROUND: we took over Flying Dragon at its low point and TURNED IT AROUND IN OUR FIRST TWO
YEARS; we are now ENTERING YEAR 3. Year 1 was the low point and the fixes (the BUST cut to 5% with a card, the
first Sell-to-Buy upgrade, the new strategy); Year 2 is the recovery the workbook shows; Year 3 is where the
dragon sheds. We start from a bad baseline (the low point in our round snapshots) and there is nowhere to go
but up. Tell it optimistically and confidently to the board:
own the low point in one line, then put the weight on what we've already changed, the progress since the
low, and the momentum of the plan. Positive framing, never spin: every number must be real.

THE FUTURE IS THE HEADLINE, and the theme line is "THE DRAGON IS SHEDDING". Flying Dragon builds the vehicles and Dragon Nexus, then
sells that business (the network effect and the UX our loyal customers love) to an acquirer for $50-60B,
repays the debt, returns cash to shareholders (special dividend + buybacks) and launches TERRALINK - the
terrestrial link to space mobility (space + fintech). Tell a convincing tale for the board and capital
markets: the earnings outlook (EPS, share price at our P/E, DPS by year), how the dividend strategy and
buybacks drive the share price, and the return on investment step by step. The title slide headline should
carry "The dragon is shedding" (Flying Dragon -> Terralink); use that exact phrase, not "shedding a skin". Use the EARNINGS OUTLOOK figures below exactly;
say clearly that later years are the team's assumptions, not forecasts. A $0 or 0.0 in the outlook for a
future year almost always means "not set yet": never quote it as a number; leave it out or say it is still to be
set. Report the last CLOSED year's results (we are presenting at the start of the new year). The acquisition message: we keep the
core human brains and go AI-native; the legacy infrastructure goes with the buyer, and Terralink is rebuilt from
scratch on a modern, AI-first model.

Eleven slides, one each: title; turnaround (the timeline of the turnaround, year by year: Year 1 the low
point and what we did, Year 2 the recovery with its numbers, Year 3 what we're entering now - one bullet per
year, leading with the market cap move); progress (the comeback - from the low point through each round snapshot to
now, and the momentum it shows); achievements (past 12 months - only things we actually did per the app's
cards, strategy, financing and tasks; [placeholders] where unknown); results (the year's financials from
the workbook - revenue, EBITDA, net profit, cash; own the BUST and any errors honestly, keep revenue,
valuation, capex/opex and debt separate); market_cap (what drives our valuation: business model portfolio,
analyst ratings, cash - and how we move each); earnings (after results: the earnings outlook top-down, revenue
-> EBITDA -> net profit -> EPS and DPS by year); roadmap (H1 -> H2 -> H3); deliver (funding plan: how we pay
for it, lender covenants, next 90 days); acquisition (the sale and the return on investment step by step:
why a strategic buyer pays $50-60B, what we do with the proceeds, then entry price -> EPS -> share price ->
dividends -> total return);
terralink (after acquisition: why space + fintech make Terralink the terrestrial link for mobility and how it
comes to dominate it - vehicles and fleets connected to satellites, Dragon Credits as the payment and settlement
rail for mobility; the money going in (initial funding, then launch capital from the sale, space vs fintech); the
value pools shown by the COMPARABLES below with their dates; Terralink revenue only from the outlook, and
[placeholders] where the team has not set it); ask (the $50B story and what we ask of investors). Spread the
speaking across the roles. HARD LIMIT: the presentation is 3 minutes - all speaker notes together
must be 400-460 words (fast pace ~170 words/min). Never invent figures or quotes.`;

export async function GET() {
  const [row] = await sql`select content, created_at from decks where event = ${EVENT} order by created_at desc limit 1`;
  return Response.json(row ?? null);
}

export async function POST(req: Request) {
  try {
    const stream = client.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(Deck) },
      system: await buildContext(),
      messages: [{ role: "user", content: `${ASK}

EARNINGS OUTLOOK (the team's saved assumptions; Capital > Investor case):
${await outlookPrompt()}

ROUND SNAPSHOTS (oldest first, market cap $M):
${(await listRounds()).map((r) => `- ${r.label} (Year ${r.year}, ${r.created_at.toISOString().slice(0, 10)}): market cap ${r.data.cap}, price ${r.data.price.toFixed(2)}, net ${Math.round(r.data.net)}, rank ${r.data.rank}`).join("\n") || "(none yet - the current numbers are the baseline)"}` }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason !== "end_turn") return Response.json({ error: `Writing stopped early (${msg.stop_reason}). Try again.` }, { status: 502 });
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = Deck.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: `Deck didn't match the expected shape: ${parsed.error.issues[0]?.message}` }, { status: 502 });
    const [row] = await sql`insert into decks ${sql({ event: EVENT, content: sql.json(parsed.data) })} returning content, created_at`;
    await logActivity(req, "action", "Regenerated the Shareholder Day deck");
    return Response.json(row);
  } catch (err) {
    const m = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: m }, { status: 500 });
  }
}
