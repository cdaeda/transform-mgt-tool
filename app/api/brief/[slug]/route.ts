import { aiJson } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { BRIEFS, Brief } from "@/lib/brief";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";
import { outlookPrompt } from "@/lib/deck-data";

export const maxDuration = 300;

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
    const data = await aiJson({ tier: "pro", maxTokens: 24000, schema: Brief, system: await buildContext(), prompt: b.investorData ? `${b.ask}\n\nOUR INVESTOR DATA:\n${await outlookPrompt()}` : b.ask });
    const parsed = { data };
    const [row] = await sql`insert into decks ${sql({ event: b.event, content: sql.json(parsed.data) })} returning content, created_at`;
    await logActivity(req, "action", `Wrote the briefing: ${b.label}`);
    return Response.json(row);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
