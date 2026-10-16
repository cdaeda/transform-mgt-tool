import { logActivity } from "@/lib/activity";
import { z } from "zod";
import { aiJson } from "@/lib/ai";
import { buildContext } from "@/lib/context";
import { pick, sql, type Team } from "@/lib/db";
import { readRange } from "@/lib/sheet";

export const maxDuration = 300;

const FIELDS = ["company", "observed_cards", "ambition", "notes", "ai_profile", "plug_in"] as const;

export async function GET() {
  return Response.json(await sql`select * from teams order by team_number`);
}

// Save what we've observed about a team.
export async function PUT(req: Request) {
  const body = await req.json();
  const row = { team_number: Number(body.team_number), ...pick(body, FIELDS), updated_at: new Date() };
  const [team] = await sql`
    insert into teams ${sql(row)}
    on conflict (team_number) do update set ${sql(row)}
    returning *`;
  await logActivity(req, "action", `Updated notes on team ${team.team_number}`, { team: team.team_number });
  return Response.json(team);
}

const Profile = z.object({
  company: z.string().describe("Company name from their tab, or our notes"),
  ai_profile: z.string().describe("Markdown: what cards/BMs they likely hold (Core/Growth/Explore), their ambition and strategy, strengths, financial position, threat level to us"),
  plug_in: z.string().describe("Markdown: how they could plug into OUR business (partner / co-invest / co-develop / buy / avoid), what each side gains, and which of our cards it fits"),
});

// Profile a team from their own 'Team N' tab plus what we've observed at the table.
export async function POST(req: Request) {
  const { team_number } = await req.json();
  const n = Number(team_number);
  const [team] = await sql<Team[]>`select * from teams where team_number = ${n}`;
  const tab = await Promise.all(
    ["B7:B21", "A53:K103", "A30:S43"].map((r) => readRange(`'Team ${n}'!${r}`)),
  )
    .then((rs) => rs.map((r) => `${r.range}\n${r.values.map((row) => row.join(" | ")).join("\n")}`).join("\n\n"))
    .catch((e) => `(their tab is unavailable: ${e instanceof Error ? e.message : e})`);
  try {
    const res = await aiJson({
      tier: "flash",
      schema: Profile,
      system: await buildContext(),
      prompt: `Profile rival Team ${n} for us. Their sheet tab:\n${tab}\n\nWhat we've observed at the table:\nCards seen: ${team?.observed_cards || "?"}\nTheir stated ambition: ${team?.ambition || "?"}\nOther notes: ${team?.notes || "?"}\n\nBe explicit about what is evidence and what is inference.`,
    });
    if (!res) return Response.json({ error: `Profiling failed .` }, { status: 502 });
    const row = { team_number: n, ...res, updated_at: new Date() };
    const [saved] = await sql`
      insert into teams ${sql(row)}
      on conflict (team_number) do update set ${sql(row)}
      returning *`;
    await logActivity(req, "action", `Profiled team ${n}`, { team: n });
    return Response.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
