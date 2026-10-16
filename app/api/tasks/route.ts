import { pick, sql } from "@/lib/db";

export async function GET() {
  return Response.json(await sql`select * from tasks order by created_at desc`);
}

export async function POST(req: Request) {
  const b = await req.json();
  if (!b.title?.trim() || !b.role) return Response.json({ error: "title and role are required" }, { status: 400 });
  const [row] = await sql`insert into tasks ${sql({ title: b.title.trim(), role: b.role, detail: b.detail ?? "", due: b.due ?? "", source: b.source ?? "manual" })} returning *`;
  return Response.json(row);
}

export async function PATCH(req: Request) {
  const b = await req.json();
  try {
    const [row] = await sql`update tasks set ${sql(pick(b, ["status", "role", "title", "detail", "due"]))} where id = ${b.id} returning *`;
    return Response.json(row);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await sql`delete from tasks where id = ${id}`;
  return Response.json({ ok: true });
}
