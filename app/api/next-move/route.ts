import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";

export const maxDuration = 120;

const client = new Anthropic();

const Action = z.object({
  label: z.string().describe("Button text, verb first, 2-5 words, e.g. 'Roll the dice', 'Act on CFO task'"),
  kind: z.enum(["roll", "capture", "task", "chat", "deck", "path", "capital"]).describe("roll = roll the dice ($100k); capture = snap a card; task = work a task; chat = ask the copilot; deck = rehearse the deck; path = Path to $50B planner; capital = capital strategies"),
  task_id: z.number().int().nullable().describe("For kind=task: the task id"),
  prompt: z.string().describe("For kind=chat: the exact question to send the copilot; else empty"),
});
const NextMove = z.object({
  headline: z.string().describe("The single best next move, imperative, under 12 words"),
  why: z.string().describe("One sentence: why this, now, tied to $50B by Year 3 / our cash / ratings / the next event"),
  action: Action,
  alternatives: z.array(z.object({ headline: z.string(), action: Action })).describe("Two other good moves"),
  roll_advice: z.string().describe("Should we roll the dice now ($100k)? Yes/no and why, one sentence"),
});

async function latest() {
  const [row] = await sql<{ content: z.infer<typeof NextMove>; created_at: Date }[]>`select content, created_at from next_moves order by created_at desc limit 1`;
  return row ?? null;
}

// GET: the latest suggestion. POST: think again from the current state.
export async function GET() {
  return Response.json(await latest());
}

export async function POST() {
  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(NextMove) },
      system: await buildContext(),
      messages: [{ role: "user", content: `What should the team do next, right now, to move fastest toward $50B by Year 3? Weigh: rolling the dice
($100k a roll - worth it given our cash and the squares?), open tasks (cite the id), unprocessed cards, workbook
errors blocking the numbers, the next event (Annual Shareholder Meeting & Analyst Day), capital strategies to pitch
or lock in. Pick ONE best move and two alternatives. Be concrete.` }],
    });
    if (!res.parsed_output) return Response.json({ error: `No suggestion (${res.stop_reason}).` }, { status: 502 });
    const [row] = await sql`insert into next_moves ${sql({ content: sql.json(res.parsed_output) })} returning content, created_at`;
    return Response.json(row);
  } catch (err) {
    const m = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: m }, { status: 500 });
  }
}
