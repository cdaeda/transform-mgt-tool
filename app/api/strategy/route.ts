import { pick, sql } from "@/lib/db";

const FIELDS = ["ambition", "core_strategy", "short_term", "opex_plan", "medium_term", "current_year", "h1_target", "h2_target", "h3_target", "h3_partners", "knob", "h1_pct", "h2_pct", "h3_pct"] as const;

export async function GET() {
  return Response.json((await sql`select * from strategy where id = 1`)[0]);
}

export async function PUT(req: Request) {
  try {
    const [row] = await sql`update strategy set ${sql({ ...pick(await req.json(), FIELDS), updated_at: new Date() })} where id = 1 returning *`;
    return Response.json(row);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 400 });
  }
}
