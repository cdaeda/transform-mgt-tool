import { logActivity } from "@/lib/activity";
import { gated } from "@/lib/critic";
import { pick, sql } from "@/lib/db";
import { Proposal } from "@/lib/proposals";
import { roleOf } from "@/lib/role-guard";

export const maxDuration = 300;

// Accept or reject one proposal from the copilot. Accepted ones are applied; every decision is
// written to organizational memory so the copilot learns what the team wants.
export async function POST(req: Request) {
  const { proposal, decision, note = "", source = "", threadId = null } = await req.json();
  const parsed = Proposal.safeParse(proposal);
  if (!parsed.success) return Response.json({ error: "Malformed proposal" }, { status: 400 });
  const p = parsed.data;
  const role = roleOf(req) ?? "";
  const remember = (kind: "decision" | "insight" | "result", text: string) => sql`insert into knowledge ${sql({ kind, text, source, role })}`;

  if (decision !== "accept") {
    await remember("decision", `Rejected: ${p.summary}${note ? ` (why: ${note})` : ""}`);
    await logActivity(req, "decision", `Rejected ${p.kind}: ${p.summary}`, { proposal: p, note }, threadId);
    return Response.json({ ok: true, applied: false });
  }
  try {
    let detail = "";
    switch (p.kind) {
      case "workbook": {
        if (role !== "CFO") return Response.json({ error: "Only the CFO can accept workbook changes. Ask the CFO, or turn it into a CFO task." }, { status: 403 });
        const r = await gated(`Accepted copilot proposal: ${p.summary}`, async (write) => void (await write(p.range, p.values)));
        if (!r.saved) return Response.json({ error: `The critic rejected it: ${r.audit?.summary ?? ""}`, audit: r.audit }, { status: 409 });
        detail = r.pushError ? ` (⚠ ${r.pushError})` : " (written to the class sheet)";
        break;
      }
      case "strategy":
        await sql`update strategy set ${sql({ [p.field]: p.value, updated_at: new Date() })} where id = 1`;
        break;
      case "task":
        await sql`insert into tasks ${sql({ role: p.role, title: p.title, detail: p.detail, due: p.due, source: source || "copilot" })}`;
        break;
      case "task_status":
        await sql`update tasks set status = ${p.status} where id = ${p.id}`;
        if (p.status === "done") await remember("result", p.summary);
        break;
      case "card":
        await sql`update cards set ${sql(pick(p, ["status", "our_notes"]))} where id = ${p.id}`;
        break;
      case "financing":
        await sql`update financing_ideas set ${sql(pick(p, ["status", "our_notes"]))} where id = ${p.id}`;
        break;
      case "knowledge":
        await remember("insight", p.summary);
        await logActivity(req, "decision", `Saved to memory: ${p.summary}`, { proposal: p }, threadId);
        return Response.json({ ok: true, applied: true });
    }
    await remember("decision", `Accepted: ${p.summary}${detail}`);
    await logActivity(req, "decision", `Accepted ${p.kind}: ${p.summary}${detail}`, { proposal: p }, threadId);
    return Response.json({ ok: true, applied: true, detail });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
