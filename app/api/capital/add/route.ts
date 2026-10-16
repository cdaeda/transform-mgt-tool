import { logActivity } from "@/lib/activity";
import { sql } from "@/lib/db";

// Add a strategy the team composed in the app (e.g. the analyst-rating campaign) to the capital board.
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.name || !b.effect) return Response.json({ error: "name and effect are required" }, { status: 400 });
  const [row] = await sql`insert into financing_ideas ${sql({
    name: b.name, category: b.category ?? "Analyst & investor campaign", how_it_works: b.how_it_works ?? "", source: "Composed in the app",
    amount: "", cost: b.cost ?? "", fit: b.fit ?? "", risks: b.risks ?? "", recommendation: "USE", status: "idea",
    year: b.year ?? null, effect: sql.json(b.effect), pitch_to: b.pitch_to ?? "", legal_basis: b.legal_basis ?? "", red_lines: b.red_lines ?? "",
  })} returning *`;
  await logActivity(req, "action", `Added capital strategy: ${row.name}`, { idea: row.id });
  return Response.json(row);
}
