import { auditWorkbook } from "@/lib/critic";
import { sql } from "@/lib/db";

export const maxDuration = 300;

// Recent audit trail.
export async function GET() {
  return Response.json(await sql`select id, created_at, reason, verdict, summary, issues, saved from audits order by created_at desc limit 50`);
}

// On-demand critic review of the whole workbook (e.g. after manual edits).
export async function POST() {
  try {
    return Response.json(await auditWorkbook());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
