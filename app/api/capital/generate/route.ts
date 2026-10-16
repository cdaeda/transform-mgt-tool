import { aiJson } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { z } from "zod";
import { CapitalStrategy } from "@/lib/capital-schema";
import { buildContext } from "@/lib/context";
import { sql, type Strategy } from "@/lib/db";

export const maxDuration = 300;


// Generate capital strategies at a chosen aggressiveness - "aggressive to the point where it almost feels
// illegal but is completely legal" (the professor's brief) - each sized against the market-cap levers.
export async function POST(req: Request) {
  const { aggressiveness = 8, focus = "" } = await req.json();
  const a = Math.min(10, Math.max(1, Number(aggressiveness)));
  const [st] = await sql<Strategy[]>`select current_year, goal_year, goal_cap from strategy where id = 1`;
  try {
    const data = await aiJson({ tier: "pro", maxTokens: 32000, schema: z.object({ strategies: z.array(CapitalStrategy) }), system: await buildContext(), prompt: `Design 6 capital strategies that get Flying Dragon from today to $${(st.goal_cap / 1000).toFixed(0)}B market cap by game Year ${st.goal_year}
(we are in Year ${st.current_year}). Aggressiveness: ${a}/10, where 10 = "so aggressive it almost feels illegal, but is completely
legal" (the professor's brief) and 1 = conservative. At ${a}/10, push as far as the law, disclosure rules, the lead lender's
covenants and the game's rules allow - creative structures, sequencing tricks, using the market-cap formula's rules
(cash counts x100 up to models + analysts; Explore models +$1B each; analyst cards up to +$2.5B) to the hilt - and
never cross into misstatement, hidden liabilities, market manipulation or covenant breach. Name real precedents.
Mix kinds: raising cash, adding business models, turning analyst ratings, share-count moves. Avoid repeating ideas
already in our list unless you size them better.${focus ? ` Focus: ${focus}.` : ""}
Size each one's effect on the levers honestly (it drives our simulator).` });
    const parsed = { data };
    const rows = parsed.data.strategies.map((s) => ({
      name: s.name, category: s.category, how_it_works: s.how_it_works, aggressiveness: s.aggressiveness, legal_basis: s.legal_basis,
      red_lines: s.red_lines, pitch_to: s.pitch_to, amount: s.amount, cost: s.cost, year: s.year, effect: sql.json(s.effect),
      fit: s.fit, risks: s.risks, recommendation: s.recommendation, source: `Capital playbook · aggressiveness ${a}/10`,
    }));
    const saved = await sql`insert into financing_ideas ${sql(rows)} returning *`;
    await logActivity(req, "action", `Generated ${saved.length} capital strategies at aggressiveness ${a}/10`, { ideas: saved.map((r) => r.id) });
    return Response.json(saved);
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return Response.json({ error: m }, { status: 500 });
  }
}
