import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { logActivity } from "@/lib/activity";
import { BRIEFS, Brief } from "@/lib/brief";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";

export const maxDuration = 300;
const client = new Anthropic();

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = BRIEFS[(await params).slug];
  if (!b) return Response.json({ error: "Unknown briefing" }, { status: 404 });
  const [row] = await sql`select content, created_at from decks where event = ${b.event} order by created_at desc limit 1`;
  return Response.json(row ?? null);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = BRIEFS[(await params).slug];
  if (!b) return Response.json({ error: "Unknown briefing" }, { status: 404 });
  try {
    const msg = await client.messages.stream({
      model: "claude-opus-5-5", max_tokens: 24000, thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(Brief) },
      system: await buildContext(),
      messages: [{ role: "user", content: b.ask }],
    }).finalMessage();
    if (msg.stop_reason !== "end_turn") return Response.json({ error: `Writing stopped early (${msg.stop_reason}). Try again.` }, { status: 502 });
    const parsed = Brief.safeParse(JSON.parse(msg.content.flatMap((x) => (x.type === "text" ? [x.text] : [])).join("")));
    if (!parsed.success) return Response.json({ error: `The briefing didn't match the expected shape: ${parsed.error.issues[0]?.message}` }, { status: 502 });
    const [row] = await sql`insert into decks ${sql({ event: b.event, content: sql.json(parsed.data) })} returning content, created_at`;
    await logActivity(req, "action", `Wrote the briefing: ${b.label}`);
    return Response.json(row);
  } catch (e) {
    return Response.json({ error: e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : String(e) }, { status: 500 });
  }
}
