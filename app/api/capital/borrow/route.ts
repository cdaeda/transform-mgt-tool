import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { CapitalStrategy } from "@/lib/capital-schema";
import { buildContext } from "@/lib/context";
import { sql, type Strategy } from "@/lib/db";
import { getSnapshot } from "@/lib/snapshot";

export const maxDuration = 300;

const client = new Anthropic();
const Use = z.object({
  what: z.string().describe("What the money buys: a named card, BM, cap.ex, the BUST hole, a buyback..."),
  amount_m: z.number(),
  horizon: z.enum(["H1", "H2", "H3", "Finance"]),
  why: z.string().describe("What it does for profit, the market-cap levers or the $50B path"),
});
const Plan = CapitalStrategy.extend({ uses: z.array(Use).describe("Where every dollar borrowed goes; amounts sum to the loan") });

// "What can we borrow, and what do we spend it on?" Borrowing plans sized against the team's rule
// (10 x revenue / 2) and the workbook's L227 cap, saved to the capital board with their uses.
export async function POST(req: Request) {
  const [[st], snap] = await Promise.all([sql<Strategy[]>`select current_year, goal_year, goal_cap from strategy where id = 1`, getSnapshot()]);
  const i = st.current_year - 1, y = snap.years[i];
  const revenue = y.revenue + y.oneTime, expenses = y.bmCost + y.costBase + y.interest;
  const ability = (10 * revenue) / 2, debt = snap.debt ?? 0;
  const l227 = [187, 205, 223].reduce((s, r) => s + (snap.seg[r] ?? []).reduce((a, b) => a + b, 0), 0) / 2;
  const m = (n: number) => `$${(n / 1e6).toFixed(1)}M`;
  try {
    const msg = await client.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 24000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(z.object({ plans: z.array(Plan) })) },
      system: await buildContext(),
      messages: [{
        role: "user",
        content: `Year ${st.current_year} numbers: revenue ${m(revenue)}, expenses ${m(expenses)} (BM cost + cost base + interest), revenue - expenses ${m(revenue - expenses)}, cash ${m(y.cash)}, debt already drawn ${m(debt)}.
Borrowing ability by the team's rule (10 x revenue / 2): ${m(ability)}, so ${m(ability - debt)} left. The workbook's own cap (L227, 10-year BM profit / 2) is only ${m(l227)} - say which plans fit under it.
Goal: $${(st.goal_cap / 1000).toFixed(0)}B market cap by Year ${st.goal_year}. Market cap = cash x 100 (capped at BM portfolio + analysts, and zero while those are negative) + BMs + analyst ratings.

Suggest 3 borrowing plans, from safest to boldest: how much to borrow, the instrument and lender (bank loan, bond, convertible, vendor or government money...), the rate and term, the year it lands, and exactly where every dollar is spent (uses) across H1 Core, H2 Growth, H3 Explore and finance moves. Favour spends that lift market cap fastest per dollar (Sell -> Buy ratings, Explore BMs, cash that counts) while keeping the interest affordable from revenue - expenses. Respect the lead lender's consent and covenants; nothing that crosses into misstatement. Size each plan's effect on the levers honestly (it feeds our simulator).`,
      }],
    }).finalMessage();
    if (msg.stop_reason !== "end_turn") return Response.json({ error: `Stopped early (${msg.stop_reason}). Try again.` }, { status: 502 });
    const parsed = z.object({ plans: z.array(Plan) }).safeParse(JSON.parse(msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")));
    if (!parsed.success) return Response.json({ error: "Plans didn't match the expected shape." }, { status: 502 });
    const rows = parsed.data.plans.map((s) => ({
      name: s.name, category: "Borrowing", how_it_works: s.how_it_works, aggressiveness: s.aggressiveness, legal_basis: s.legal_basis,
      red_lines: s.red_lines, pitch_to: s.pitch_to, amount: s.amount, cost: s.cost, year: s.year, effect: sql.json(s.effect),
      fit: s.fit, risks: s.risks, recommendation: s.recommendation, uses: sql.json(s.uses), source: `Borrowing plan · Year ${st.current_year}`,
    }));
    const saved = await sql`insert into financing_ideas ${sql(rows)} returning *`;
    await logActivity(req, "action", `Generated ${saved.length} borrowing plans (ability ${m(ability)}, ${m(ability - debt)} left)`, { ideas: saved.map((r) => r.id) });
    return Response.json(saved);
  } catch (err) {
    const e = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: e }, { status: 500 });
  }
}
