import { sql } from "./db";
import { roleOf } from "./role-guard";

// The tab each browser is on (cookie set by the page), so every logged step knows where it happened.
const tabOf = (req: Request) => decodeURIComponent(req.headers.get("cookie")?.match(/(?:^|;\s*)transform_tab=([^;]+)/)?.[1] ?? "");

// Who did what. "decision" = the team chose something (accept/reject, status, booking, edits);
// "action" = something was produced (tasks, evaluations, snapshots, decks); "chat" = a copilot turn.
// Never throws: a logging hiccup must not fail the change it describes.
export async function logActivity(req: Request, kind: "chat" | "decision" | "action", summary: string, detail: object = {}, threadId: string | null = null) {
  await sql`insert into activity ${sql({ role: roleOf(req) ?? "", tab: tabOf(req), kind, summary: summary.slice(0, 500), detail: sql.json(JSON.parse(JSON.stringify(detail))), thread_id: threadId })}`.catch(
    (e) => console.error("activity log failed:", e),
  );
}
