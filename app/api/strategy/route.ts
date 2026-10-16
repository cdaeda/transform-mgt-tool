import { logActivity } from "@/lib/activity";
import { pick, sql } from "@/lib/db";

const FIELDS = ["ambition", "core_strategy", "short_term", "opex_plan", "medium_term", "current_year", "current_round", "h1_target", "h2_target", "h3_target", "h3_partners", "knob", "h1_pct", "h2_pct", "h3_pct", "goal_year", "goal_cap", "analyst_target"] as const;

export async function GET() {
  return Response.json((await sql`select * from strategy where id = 1`)[0]);
}

export async function PUT(req: Request) {
  try {
    const body = pick(await req.json(), FIELDS);
    await logActivity(req, "decision", `Updated strategy: ${Object.keys(body).join(", ")}`, body);
    if (body.analyst_target) body.analyst_target = sql.json(body.analyst_target as number[]);
    const [row] = await sql`update strategy set ${sql({ ...body, updated_at: new Date() })} where id = 1 returning *`;
    return Response.json(row);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 });
  }
}
