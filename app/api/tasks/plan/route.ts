import { logActivity } from "@/lib/activity";
import { z } from "zod";
import { aiJson } from "@/lib/ai";
import { buildContext } from "@/lib/context";
import { sql } from "@/lib/db";
import { ROLES, ROLE_IDS } from "@/lib/roles";

export const maxDuration = 300;


const Plan = z.object({
  tasks: z.array(z.object({
    role: z.enum(ROLE_IDS),
    title: z.string().describe("Verb-first, concrete, under 12 words"),
    detail: z.string().describe("One or two sentences: what done looks like"),
    due: z.string().describe("When, in game terms, e.g. 'before the board pitch', 'this round', 'Year 1 close'"),
  })).describe("At least one task for EVERY role; at most three per role"),
});

// Turn an action the team just took into concrete tasks for each role.
export async function POST(req: Request) {
  const { context, source = "intake" } = (await req.json()) as { context: string; source?: string };
  if (!context?.trim()) return Response.json({ error: "context is required" }, { status: 400 });
  try {
    const res = await aiJson({
      tier: "flash",
      schema: Plan,
      system: await buildContext(),
      prompt: `Create tasks for each member of our team to act on this, fast. Roles: ${ROLES.map((r) => `${r.id} (${r.title}, ${r.name})`).join("; ")}.
Each role gets work that fits their job (the CFO also covers investor relations, so IRM tasks are about investors and analysts).
Don't duplicate existing work; be specific to our numbers, cards and horizons.

WHAT JUST HAPPENED:
${context}`,
    });
    if (!res?.tasks.length) return Response.json({ error: `Couldn't plan tasks .` }, { status: 502 });
    const rows = res.tasks.map((t) => ({ ...t, source: source.slice(0, 200) }));
    const tasks = await sql`insert into tasks ${sql(rows)} returning *`;
    await logActivity(req, "action", `Planned ${tasks.length} tasks (${[...new Set(tasks.map((t) => t.role))].join(", ")}) from ${source}`, { tasks: tasks.map((t) => t.id) });
    return Response.json(tasks);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
