import { logActivity } from "@/lib/activity";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildContext } from "@/lib/context";
import { listRounds } from "@/lib/rounds";
import { sql } from "@/lib/db";
import { Deck, DECK_EVENT as EVENT } from "@/lib/deck";

export const maxDuration = 300;

const client = new Anthropic();

const ASK = `Write our deck for the ${EVENT} (management event card): "Prepare a short presentation outlining
your key achievements over the past twelve months. Present your financial results for the year. Most
importantly, outline your transformation roadmap and how you will deliver on your transformation journey.
Keep it short. Make it visual." Investors, analysts and the business press are in the room; the goal is to
convince capital markets there is a big valuation here (our path to $50B), and to turn our Sell ratings.

THE STORY IS A COMEBACK - "rising from the ashes". We start from a bad baseline (the low point in our
round snapshots) and there is nowhere to go but up. Tell it optimistically and confidently to the board:
own the low point in one line, then put the weight on what we've already changed, the progress since the
low, and the momentum of the plan. Positive framing, never spin: every number must be real.

Eight slides, one each: title; progress (the comeback - from the low point through each round snapshot to
now, and the momentum it shows); achievements (past 12 months - only things we actually did per the app's
cards, strategy, financing and tasks; [placeholders] where unknown); results (the year's financials from
the workbook - revenue, EBITDA, net profit, cash; own the BUST and any errors honestly, keep revenue,
valuation, capex/opex and debt separate); market_cap (what drives our valuation: business model portfolio,
analyst ratings, cash - and how we move each); roadmap (H1 -> H2 -> H3); deliver (funding plan: how we pay
for it, lender covenants, next 90 days); ask (the $50B story and what we ask of investors). Spread the
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
