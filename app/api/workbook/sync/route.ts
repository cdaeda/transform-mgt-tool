import { syncFromClassSheet } from "@/lib/sheet";

export const maxDuration = 60;

// Pull the latest class Google Sheet into the app (replaces the working copy).
export async function POST(req: Request) {
  const { force = false, auto = false } = await req.json().catch(() => ({}));
  try {
    // auto: page-load refresh, at most every 5 minutes, never overwriting unpushed app edits.
    return Response.json({ ok: true, changes: await syncFromClassSheet(auto ? false : force, auto ? 5 * 60_000 : 0) });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
