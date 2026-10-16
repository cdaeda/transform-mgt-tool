import { aiJson } from "@/lib/ai";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";
import { StrategyDoc, docHtml, type StrategyDocT } from "@/lib/strategy-doc";

export const maxDuration = 300;


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
      ...(word ? { "content-disposition": `attachment; filename="Nexus-Strategy-${stamp}.doc"` } : {}),
    },
  });
}

// POST: write the latest version from everything the app knows (strategy, horizons, knob, cards,
// financing, teams, live workbook figures).
export async function POST() {
  try {
    // Streamed: the document is long, so it needs a big output budget.
    const data = await aiJson({ tier: "pro", maxTokens: 60000, schema: StrategyDoc, system: await buildContext(), prompt: `Write the current strategy and investment case for NEXUS - the three-way merger of equals of Flying Dragon,
GN-Automaker and Relay - for our board and investors: the kind of document a company issues when asking for capital,
but do NOT call it a prospectus. Cover: why the merger works (energy, chip manufacturing, fintech and mobility give a
complete foundation; Terralink adds space; one Nexus AI layer connects the units so the group scales); what each company
brings; the five business units and their leadership; the combined portfolio and market cap from the LIVE workbook (say
plainly how the cash term is counted and that the facilitator caps it); the debt we carry and how we make it carriable;
the growth and Explore priorities and the discipline (test, reward winners, drop losers); the capital plan ("how are we
going to pay for this?"); risks and the assumptions to confirm.
The roadmap's three horizons are Nexus's own (H1 Core: run and strengthen the merged core businesses; H2 Growth: scale
with the AI layer across the units; H3 Explore: disciplined options in energy, wind, chips, fintech, space) - not the old
Flying Dragon / Dragon Nexus horizons.

Rules: never invent statistics, quotes or partner names - use [bracketed placeholders] and list them under
assumptions. Keep revenue, valuation, capex/opex and debt in separate lanes (the facilitators criticised
mixing them). Mark unconfirmed items (unit membership of each BM, swap ratio, conversion terms, acquisitions) as proposed.
The theme line is "The dragon is shedding" - never "shedding its skin".
Plain, confident board English; short paragraphs; about 3,000-4,000 words in total.` });
    const parsed = { data };
    const [row] = await sql`insert into strategy_docs ${sql({ content: sql.json(parsed.data) })} returning content, created_at`;
    return Response.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
