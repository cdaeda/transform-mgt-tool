import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EffectSchema } from "@/lib/capital-schema";
import { buildContext } from "@/lib/context";
import { sql, type FinancingIdea } from "@/lib/db";

export const maxDuration = 300;

const client = new Anthropic();

// Size every strategy that has no lever effect yet, so the simulator can project it.
export async function POST() {
  const ideas = await sql<FinancingIdea[]>`select id, name, category, how_it_works, amount, cost from financing_ideas where effect is null and status <> 'rejected'`;
  if (!ideas.length) return Response.json({ sized: 0 });
  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(z.object({ sized: z.array(z.object({ id: z.number().int(), year: z.number().int(), effect: EffectSchema, legal_basis: z.string(), red_lines: z.string(), pitch_to: z.string() })) })) },
      system: await buildContext(),
      messages: [{ role: "user", content: `Size each of these capital strategies for our simulator: when it would land (game year) and its effect on the market-cap
levers if we did it at a sensible scale for us. Also its legal basis, red lines and who must say yes. Never invent figures
from sources; base sizes on our numbers.\n\n${ideas.map((i) => `#${i.id} ${i.name} (${i.category}): ${i.how_it_works} Amount: ${i.amount}; cost: ${i.cost}`).join("\n")}` }],
    });
    const out = res.parsed_output?.sized ?? [];
    for (const s of out)
      await sql`update financing_ideas set ${sql({ year: s.year, effect: sql.json(s.effect), legal_basis: s.legal_basis, red_lines: s.red_lines, pitch_to: s.pitch_to })} where id = ${s.id} and effect is null`;
    return Response.json({ sized: out.length });
  } catch (err) {
    const m = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: m }, { status: 500 });
  }
}
