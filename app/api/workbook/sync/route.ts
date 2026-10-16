import { captureRound } from "@/lib/rounds";
import { syncFromClassSheet } from "@/lib/sheet";

export const maxDuration = 60;

// Pull the latest class Google Sheet into the app (replaces the working copy).
export async function POST(req: Request) {
  const { force = false, auto = false } = await req.json().catch(() => ({}));
  try {
    // auto: page-load refresh, at most every 5 minutes, never overwriting unpushed app edits.
    const changes = await syncFromClassSheet(auto ? false : force, auto ? 5 * 60_000 : 0);
    // Our numbers moved in the class sheet: keep a snapshot for the comeback timeline.
    if ("team1" in changes && changes.team1.length) await captureRound(`After sync · ${changes.team1.length} Team 1 change${changes.team1.length === 1 ? "" : "s"}`);
    return Response.json({ ok: true, changes });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
