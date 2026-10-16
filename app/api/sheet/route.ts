import { cfoOnly } from "@/lib/role-guard";
import { readRange, writeRange } from "@/lib/sheet";

const fail = (e: unknown) =>
  Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });

export async function GET(req: Request) {
  const range = new URL(req.url).searchParams.get("range");
  if (!range) return fail("range is required");
  try {
    return Response.json(await readRange(range));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = cfoOnly(req);
  if (denied) return denied;
  const { range, values } = await req.json();
  try {
    return Response.json(await writeRange(range, values));
  } catch (e) {
    return fail(e);
  }
}
