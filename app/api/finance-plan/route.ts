import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildContext } from "@/lib/context";

export const maxDuration = 300;

const client = new Anthropic();

const Option = z.object({
  rank: z.number().int().describe("1 = best"),
  name: z.string().describe("Short name, e.g. 'Partner-funded pilots + covenant-safe bank line'"),
  summary: z.string().describe("2-3 sentences: what this option does and why it ranks here"),
  funding_need: z.string().describe("How much cash is needed, by which game year, from the numbers given (show the arithmetic)"),
  picks: z.array(z.object({
    idea_id: z.number().int().nullable().describe("id from our FINANCING OPTIONS list, or null for a new idea"),
    name: z.string(),
    amount: z.string().describe("Amount and year; [placeholder] if it can't be derived"),
    why: z.string(),
  })).describe("The financing stack for this option"),
  levers: z.array(z.object({
    cell: z.string().describe("A 'Team 1' INPUT cell for the focus year, from the lever list given (e.g. K34 interest, N34 cash balance, P34 shares, R34 dividend, D240 cash for market cap, D245 active Core BMs)"),
    value: z.number().describe("The new value in that cell's units (full dollars / counts / shares)"),
  })).describe("How this option changes the workbook in the focus year, so the team can preview it"),
  effect: z.string().describe("Expected effect on cash, interest/revenue, debt-to-assets, EPS, market cap and share price"),
  risks: z.string().describe("Covenant risk with the $900M lender, hidden leverage, dilution, what would make us drop it"),
  board_line: z.string().describe("One speakable sentence for the board pitch"),
});
const Options = z.object({
  read_of_intent: z.string().describe("One sentence: what we understood the team wants"),
  options: z.array(Option).describe("Exactly three options, stack ranked best first"),
});

// Turn "what we want to do" + the current scenario into three ranked creative financing strategies.
export async function POST(req: Request) {
  const { intent, history = [], levers, leverCells = [], cards, baseline, scenario, year } = await req.json();
  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: zodOutputFormat(Options) },
      system: await buildContext(),
      messages: [{
        role: "user",
        content: `Give us THREE creative financing strategies for what we want to do, stack ranked best first (best =
fastest to our ambition while covenant-safe and least dilutive). Use our FINANCING OPTIONS (reference them
by id) and add new ideas only if clearly better. Respect the lead lender's covenants. Never invent figures:
derive from the numbers below or use [placeholders]. For each option give the lever values so we can
preview it, using only these input cells: ${JSON.stringify(leverCells)}.

EARLIER IN THIS CONVERSATION (our intents and the options you gave): ${JSON.stringify(history)}
WHAT WE WANT TO DO NOW: ${intent || "(not stated - infer from the levers and cards)"}
FOCUS YEAR: ${year}
LEVERS CHANGED (cell = new value): ${JSON.stringify(levers)}
CARDS INCLUDED IN THE SCENARIO: ${JSON.stringify(cards)}

BASELINE per year (dollars; cap in $M; price $/share):
${JSON.stringify(baseline)}

SCENARIO per year:
${JSON.stringify(scenario)}`,
      }],
    });
    if (!res.parsed_output) return Response.json({ error: `Planning failed (${res.stop_reason}).` }, { status: 502 });
    return Response.json(res.parsed_output);
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
