import { logActivity } from "@/lib/activity";
import { sql } from "@/lib/db";
import { captureRound, listRounds } from "@/lib/rounds";

export async function GET() {
  return Response.json(await listRounds());
}

export async function POST(req: Request) {
  const { label } = await req.json().catch(() => ({}));
  try {
    const snap = await captureRound(String(label || "Snapshot").slice(0, 120));
    await logActivity(req, "action", `Snapshot: ${String(label || "Snapshot").slice(0, 120)}`);
    return Response.json(snap);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { id, label } = await req.json();
  const [row] = await sql`update round_snapshots set label = ${String(label).slice(0, 120)} where id = ${id} returning *`;
  return Response.json(row);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await sql`delete from round_snapshots where id = ${id}`;
  return Response.json({ ok: true });
}
