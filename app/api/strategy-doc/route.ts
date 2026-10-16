import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";
import { StrategyDoc, docHtml, type StrategyDocT } from "@/lib/strategy-doc";

export const maxDuration = 300;

const client = new Anthropic();

async function latest() {
  const [row] = await sql<{ content: StrategyDocT; created_at: Date }[]>`select content, created_at from strategy_docs order by created_at desc limit 1`;
  return row ?? null;
}

// GET: latest document as JSON, or ?download=doc|html as a file.
export async function GET(req: Request) {
  const doc = await latest();
  const download = new URL(req.url).searchParams.get("download");
  if (!download) return Response.json(doc);
  if (!doc) return new Response("No strategy document yet - generate it from the dashboard first.", { status: 404 });
  const html = docHtml(doc.content, doc.created_at);
  const stamp = doc.created_at.toISOString().slice(0, 10);
  const word = download === "doc";
  return new Response(html, {
    headers: {
      "content-type": word ? "application/msword" : "text/html; charset=utf-8",
      ...(word ? { "content-disposition": `attachment; filename="Dragon-Drive-Strategy-${stamp}.doc"` } : {}),
    },
  });
}

// POST: write the latest version from everything the app knows (strategy, horizons, knob, cards,
// financing, teams, live workbook figures).
export async function POST() {
  try {
    // Streamed: the document is long, so it needs a big output budget.
    const stream = client.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(StrategyDoc) },
      system: await buildContext(),
      messages: [{
        role: "user",
        content: `Write the current strategy and investment case ("Flying Dragon: Build the Vehicles. Own the Intelligence Network." - Dragon Nexus) for our board and investors - the kind of
document a company issues when asking for capital, but do NOT call it a prospectus. Use our ambition, core
strategy, the three horizons (H1 build the vehicles and fund the transformation; H2 launch the Dragon Nexus
marketplace pilot; H3 own the intelligence network), the manufacturing -> pilot -> network -> capped research
sequence, the three-buyer funding structure, the tuner knob's target mix vs actual, our horizon targets, cards and their horizon
fit, picked and top-ranked financing plays, rival profiles and the LIVE workbook figures.

Rules: never invent statistics, quotes or partner names - use [bracketed placeholders] and list them under
assumptions. Keep revenue, valuation, capex/opex and debt in separate lanes (the facilitators criticised
mixing them). Answer "how are we going to pay for this?" explicitly in the capital plan. Mark unconfirmed
items (Dragon Nexus itself, Dragon Ledger and Dragon Credits, the $100/$80/$20 pricing example, which is
illustrative only, partner terms, horizon timing unless set) as proposed. Keep subspace communications out of
the base case (capped research option) and address the $900M 2030 debt and the lead lender's consent.
Plain, confident board English; short paragraphs; about 3,000-4,000 words in total.`,
      }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason !== "end_turn") return Response.json({ error: `Writing stopped early (${msg.stop_reason}). Try again.` }, { status: 502 });
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = StrategyDoc.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: `The document didn't match the expected shape: ${parsed.error.issues[0]?.message}` }, { status: 502 });
    const [row] = await sql`insert into strategy_docs ${sql({ content: sql.json(parsed.data) })} returning content, created_at`;
    return Response.json(row);
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
