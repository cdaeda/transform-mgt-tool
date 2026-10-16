import { logActivity } from "@/lib/activity";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildContext } from "@/lib/context";
import { CARD_TYPES, isBM, pick, sql, type Card } from "@/lib/db";

export const maxDuration = 300;

const client = new Anthropic();

const Evaluation = z.object({
  lens: z.string().describe("The card family exactly as printed in the card header, e.g. 'Business Model', 'Innovation Strategy', 'Management Event', 'Management Challenge', 'Management Task', 'Analyst', 'BOOM!', 'Advisor'"),
  horizon_fit: z.object({
    H1: z.object({ score: z.number().int().describe("0-100"), why: z.string() }),
    H2: z.object({ score: z.number().int().describe("0-100"), why: z.string() }),
    H3: z.object({ score: z.number().int().describe("0-100"), why: z.string() }),
  }).describe("How well the card serves each of OUR horizons (H1 maintain legacy, H2 satellite data, H3 ecosystem network effect). 0 = no help or works against it, 100 = core to it. One sentence each."),
  primary_horizon: z.enum(["H1", "H2", "H3", "None"]).describe("The horizon it serves most; None if it serves none"),
  type: z.enum(CARD_TYPES).describe("Business model cards say BUSINESS MODEL + Core/Growth/Explore; event/challenge cards say MANAGEMENT EVENT / MANAGEMENT CHALLENGE in the header"),
  title: z.string().describe("Short name, e.g. 'Hydrogen-as-a-platform STBU'"),
  card_text: z.string().describe("Faithful transcription of the card"),
  capex: z.number().describe("Up-front investment in full dollars (12M = 12000000); 0 for non-business-model cards"),
  start_year: z.number().int().describe("Game year the card would start: the current game year unless the card says otherwise"),
  revenue: z.array(z.number()).describe("10 numbers: revenue in full dollars for game years 1..10, 0 before start_year, applying the card's growth rules (base case); all 0 for non-business-model cards"),
  cost: z.array(z.number()).describe("10 numbers: operating cost in full dollars for game years 1..10, 0 before start_year; all 0 for non-business-model cards"),
  recommendation: z.enum(["TAKE", "PASS", "TAKE WITH CHANGES", "RESPOND", "PRIORITIZE", "SKIP"]).describe("TAKE/PASS/TAKE WITH CHANGES for business-model and other offer cards; RESPOND/PRIORITIZE/SKIP for management events and challenges (PRIORITIZE = the reward is worth our best people)"),
  evaluation: z.string().describe("Markdown. Business models: financial impact (Y1 and 10-yr), fit with our ambition / Core data strategy / short-term cash plan / opex plan / partner-led medium term, how it interacts with the other cards we hold, risks, assumptions (e.g. conditional upside like bolt-ons). Management events/challenges: what is asked, the reward and why it matters to us, then a DRAFT RESPONSE we can present (outline + talking points + the numbers to quote) built from our ambition, strategy, cards and live figures."),
  partner_verdict: z.enum(["Partner", "Go alone", "Depends"]).describe("To partner or not to partner on this card"),
  partner_with: z.string().describe("Which team(s) and why them, or empty if Go alone"),
  partner_reasoning: z.string().describe("Why partner or not: what each side brings, the deal shape (Partner / Co-Invest / Co-Develop / Buy), risks of helping a rival"),
});

const ASK = `This is a card we drew in TRANSFORM!. Score how well it aligns with each of our three horizons (H1, H2, H3)
and say whether taking it moves our actual investment mix toward or away from the tuner knob's target mix.
Evaluate it against our strategy, our numbers and EVERY card
we already hold (they are listed in the system prompt - say how this one combines with or conflicts
with them), and decide "to partner or not to partner" on it using the other teams' profiles.
This is a suggestion only. Model the base case in revenue/cost; describe conditional upside in the
evaluation instead.`;

const ten = (a: number[]) => Array.from({ length: 10 }, (_, i) => Math.round(a[i] ?? 0));

export async function GET() {
  return Response.json(await sql`select * from cards order by created_at desc`);
}

// Evaluate a new card from a photo (base64 JPEG) or typed text, then save it as a candidate.
export async function POST(req: Request) {
  const { image, text } = (await req.json()) as { image?: string; text?: string };
  if (!image && !text) return Response.json({ error: "image or text is required" }, { status: 400 });
  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(Evaluation) },
      system: await buildContext(),
      messages: [
        {
          role: "user",
          content: [
            image
              ? { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } }
              : { type: "text", text: `Card (typed by us): ${text}` },
            { type: "text", text: ASK },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output)
      return Response.json({ error: `Evaluation failed (${res.stop_reason}).` }, { status: 502 });
    const e = res.parsed_output;
    const bm = isBM(e.type);
    const row = {
      ...e,
      capex: bm ? e.capex : 0,
      revenue: bm ? ten(e.revenue) : ten([]),
      cost: bm ? ten(e.cost) : ten([]),
      start_year: Math.min(10, Math.max(1, e.start_year)),
    };
    const [card] = await sql<Card[]>`insert into cards ${sql(row)} returning *`;
    await logActivity(req, "action", `Evaluated card #${card.id} (${card.type}): ${card.title} → ${card.recommendation}`, { card: card.id });
    return Response.json(card);
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

const EDITABLE = ["status", "our_notes", "title", "type", "capex", "start_year", "revenue", "cost"] as const;

// Our own edits: select / pass, what we want to do, and corrections to the numbers.
export async function PATCH(req: Request) {
  const body = await req.json();
  try {
    const [card] = await sql`update cards set ${sql(pick(body, EDITABLE))} where id = ${body.id} returning *`;
    await logActivity(req, body.status ? "decision" : "action", body.status ? `Card #${card.id} → ${card.status}: ${card.title}` : `Edited card #${card.id}: ${card.title}`, { card: card.id, changed: Object.keys(pick(body, EDITABLE)) });
    return Response.json(card);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 });
  }
}
