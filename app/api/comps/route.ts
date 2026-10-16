import { z } from "zod";
import { aiJson, aiText } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { sql } from "@/lib/db";

export const maxDuration = 300;


// The comparables investors will reach for, by horizon. The team can add names on each refresh.
const DEFAULT = `- H2 (Dragon Nexus, 4D intelligence + satellite network): Starlink / SpaceX (private; latest tender or
  round valuation, and Starlink revenue), plus 1-2 listed satellite-data or geospatial-intelligence peers
  (e.g. Planet Labs) if you find current data.
- H3 / Explore, fintech - moving money and tokenization (payments rails, Dragon Credits analogues): Ripple
  (private company: latest share tender/round valuation, and separately the XRP token's market cap), Hedera
  (HBAR token market cap / fully diluted value), Ondo Finance (ONDO token market cap / FDV).
- H3 / Explore, fintech - exchange platform: Coinbase (COIN market cap, trailing revenue).`;

const Comp = z.object({
  grp: z.string().describe("Group heading, e.g. 'Satellite network & geospatial intelligence (H2)'"),
  horizon: z.enum(["H1", "H2", "H3"]),
  company: z.string(),
  ticker: z.string().describe("Ticker or token symbol, or 'private'"),
  valuation_usd_b: z.number().nullable().describe("In $ billions, exactly as the source states; null if none found"),
  basis: z.string().describe("Market cap / last private round / secondary tender / token circulating market cap / fully diluted value"),
  as_of: z.string().describe("Date of the figure, e.g. '2026-10-14' or 'Dec 2025 round'"),
  revenue_usd_b: z.number().nullable().describe("Most recent annual or trailing revenue in $ billions if the source gives it, else null"),
  revenue_period: z.string(),
  ev_revenue: z.number().nullable().describe("Valuation / revenue, only when both figures exist; else null"),
  source_name: z.string(),
  source_url: z.string(),
  why: z.string().describe("Why an investor would compare Flying Dragon's plan to it (one sentence)"),
  caveat: z.string().describe("What makes the comparison weak or the figure soft (one sentence)"),
});

// Latest research batch.
export async function GET() {
  return Response.json(await sql`select * from comps where batch = (select max(batch) from comps) order by horizon, grp, company`);
}

// Research current valuations on the web (dated and sourced), then structure them. Two calls because
// structured output can't be combined with web-search citations.
export async function POST(req: Request) {
  const { extra = "" } = await req.json().catch(() => ({}));
  try {
    // 1) research with Google Search grounding, 2) structure it into rows (two calls: grounding and
    // structured output don't mix).
    const research = await aiText({ tier: "pro", search: true, maxTokens: 16000, prompt: `Find the most recent publicly reported valuation for each of these comparables, for a Flying Dragon
investor slide (our plan: build vehicles for cash, launch Dragon Nexus - a two-sided marketplace for 4D location
intelligence fed by vehicles and a microsatellite network - with Dragon Credits / Dragon Ledger for settlement).
${DEFAULT}${extra ? `\n- Also: ${extra}` : ""}

For each: the valuation figure and its basis (market cap, private round, tender, token market cap or FDV), the date,
the latest annual or trailing revenue if reported, and the source name and URL. Use only figures you find in sources
today; if something is not found, say so - never estimate or invent. Note anything that makes a figure soft.` });
    if (!research.text.trim()) return Response.json({ error: "The research came back empty. Try again." }, { status: 502 });
    const out = await aiJson({
      tier: "flash", schema: z.object({ comps: z.array(Comp) }),
      prompt: `Turn this research into comparable-valuation rows. Copy figures, dates and URLs exactly; use null where the research found nothing. One row per company per valuation basis (e.g. Ripple the company and XRP the token are two rows).\n\n${research.text}\n\nSOURCES FOUND:\n${research.sources.join("\n") || "(see the research text)"}`,
    });
    const parsed = { success: out.comps.length > 0, data: out };
    if (!parsed.success) return Response.json({ error: "Couldn't structure the research. Try again." }, { status: 502 });
    const batch = new Date();
    const rows = await sql`insert into comps ${sql(parsed.data.comps.map((c) => ({ ...c, batch })))} returning *`;
    await logActivity(req, "action", `Refreshed comparable valuations (${rows.length} rows)`, { companies: rows.map((r) => r.company) });
    return Response.json(rows);
  } catch (err) {
    const e = err instanceof Error ? err.message : String(err);
    return Response.json({ error: e }, { status: 500 });
  }
}
