import { logActivity } from "@/lib/activity";
import { z } from "zod";
import { aiJson } from "@/lib/ai";
import { buildContext } from "@/lib/context";
import { pick, sql, type FinancingIdea } from "@/lib/db";

export const maxDuration = 300;


const Ideas = z.object({
  ideas: z.array(z.object({
    name: z.string(),
    category: z.string().describe("e.g. Bank debt, Bond, Lease / sale-leaseback, Off-balance-sheet SPV, Private credit, Vendor / partner financing, Government / policy finance, Equity issue, Convertible, Asset-backed, Customer prepayment, Other"),
    how_it_works: z.string().describe("Plain-language mechanics, 1-3 sentences"),
    source_quote: z.string().describe("Exact words from the source that describe it; empty if the source gives none"),
    amount: z.string().describe("Amount as stated in the source, or [placeholder] - never invent"),
    cost: z.string().describe("Rate / cost as stated, or [placeholder]"),
    fit: z.string().describe("How it could work for Flying Dragon / Dragon Nexus now, and what it would fund (tie to our cards, ambition and short-term cash plan)"),
    risks: z.string().describe("Risks, incl. the lead lender's veto on new borrowing / asset sales / collateral-burning bets (the $900M 2030 debt), hidden leverage, and anything the source criticises"),
    recommendation: z.enum(["USE", "CONSIDER", "AVOID"]),
  })),
});

const ASK = `List EVERY distinct financing method, structure or idea in this source - including ones the source
criticises - as separate items. Use only what the source says for amounts and costs (use [placeholders]
otherwise; never invent figures). Then judge each one for Flying Dragon against our strategy, cards,
workbook and the lead lender's covenants. Skip anything already in our financing list unless the source
adds something new.`;

export async function GET() {
  return Response.json(await sql`select * from financing_ideas order by created_at`);
}

// Extract financing ideas from pasted text or a PDF (e.g. a saved article), evaluated for us.
export async function POST(req: Request) {
  const { text, pdf, source } = (await req.json()) as { text?: string; pdf?: string; source?: string };
  if (!text && !pdf) return Response.json({ error: "text or pdf is required" }, { status: 400 });
  try {
    const res = await aiJson({
      tier: "flash",
      schema: Ideas,
      system: await buildContext(),
      parts: [pdf ? { pdf } : { text: `<source>\n${text}\n</source>` }, { text: `Source name: ${source || "(unnamed)"}\n\n${ASK}` }],
    });
    if (!res) return Response.json({ error: `Extraction failed .` }, { status: 502 });
    const rows = res.ideas.map((i) => ({ ...i, source: source || "(unnamed)" }));
    if (!rows.length) return Response.json([]);
    const saved = await sql<FinancingIdea[]>`insert into financing_ideas ${sql(rows)} returning *`;
    await logActivity(req, "action", `Extracted ${saved.length} financing ideas${source ? ` from ${source}` : ""}`, { ideas: saved.map((r) => r.id) });
    return Response.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// Pick / reject an idea and record what we want to do with it.
export async function PATCH(req: Request) {
  const body = await req.json();
  const fields = pick(body, ["status", "our_notes", "year", "scale"]);
  const [row] = await sql`update financing_ideas set ${sql(fields)} where id = ${body.id} returning *`;
  await logActivity(req, fields.status ? "decision" : "action", fields.status ? `Capital strategy → ${row.status}: ${row.name}` : `Edited capital strategy: ${row.name}`, { idea: row.id, changed: Object.keys(fields) });
  return Response.json(row);
}
