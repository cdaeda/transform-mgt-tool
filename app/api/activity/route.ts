import { sql } from "@/lib/db";

// The activity log, newest first; ?thread=<id> also returns that conversation for lineage.
export async function GET(req: Request) {
  const thread = new URL(req.url).searchParams.get("thread");
  if (thread) return Response.json((await sql`select id, title, tab, messages, created_at from threads where id = ${thread}`)[0] ?? null);
  return Response.json(await sql`select * from activity order by created_at desc limit 500`);
}
