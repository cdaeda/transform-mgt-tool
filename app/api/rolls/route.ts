import { logActivity } from "@/lib/activity";
import { gated } from "@/lib/critic";
import { sql, type Strategy } from "@/lib/db";
import { num } from "@/lib/impact";
import { readRange } from "@/lib/sheet";
import { roleOf } from "@/lib/role-guard";
import { ROLL_COST, SQUARES } from "@/lib/squares";

export const maxDuration = 300;

export async function GET() {
  const [st] = await sql<Strategy[]>`select current_year from strategy where id = 1`;
  const rows = await sql`select * from rolls where year = ${st.current_year} order by created_at desc`;
  return Response.json({ year: st.current_year, rolls: rows });
}

// Log a roll and book its $100k into this year's cost base (column C = cost base x number of rolls),
// through the critic, and from there into the class sheet.
export async function POST(req: Request) {
  const { square, note = "", bookPending = false } = await req.json();
  const cfo = roleOf(req) === "CFO";
  if (bookPending) return bookPendingRolls(cfo);
  const known = SQUARES.find((s) => s.name === square);
  if (!known) return Response.json({ error: "Unknown square" }, { status: 400 });
  const [st] = await sql<Strategy[]>`select current_year from strategy where id = 1`;
  const y = st.current_year;
  const [roll] = await sql`insert into rolls ${sql({ year: y, square, note })} returning *`;
  await logActivity(req, "action", `Rolled: ${square}${note ? ` (${note})` : ""}`, { roll: roll.id, year: y });
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from rolls where year = ${y}`;
  if (!cfo) return Response.json({ roll, rollsThisYear: n, error: `Roll #${n} logged. Only the CFO books numbers: the $100k is waiting for the CFO to book it (Cards tab).` });
  try {
    const cell = `C${33 + y}`;
    const result = await gated(
      `Dice roll #${n} in game Year ${y}: the team paid ${ROLL_COST} to roll and landed on "${square}" (${known.effect}). ` +
        `Adding ${ROLL_COST} to ${cell} (cost base x number of rolls). ${note}`,
      async (write) => {
        const cur = num((await readRange(cell)).values[0]?.[0]);
        await write(cell, [[cur + ROLL_COST]]);
      },
    );
    if (result.saved) await sql`update rolls set booked = true where id = ${roll.id}`;
    return Response.json({ roll: { ...roll, booked: result.saved }, rollsThisYear: n, audit: result.audit, pushed: result.pushed, pushError: result.pushError });
  } catch (e) {
    return Response.json({ roll, rollsThisYear: n, error: `Roll logged, but booking the cost failed: ${e instanceof Error ? e.message : e}` });
  }
}

// The CFO books every logged-but-unbooked roll in one audited write.
async function bookPendingRolls(cfo: boolean) {
  if (!cfo) return Response.json({ error: "Only the CFO can book roll costs." }, { status: 403 });
  const [st] = await sql<Strategy[]>`select current_year from strategy where id = 1`;
  const y = st.current_year;
  const pending = await sql<{ id: number; square: string }[]>`select id, square from rolls where year = ${y} and not booked`;
  if (!pending.length) return Response.json({ booked: 0 });
  const cell = `C${33 + y}`;
  const result = await gated(
    `Booking ${pending.length} logged dice roll(s) in game Year ${y} at ${ROLL_COST} each (${pending.map((p) => p.square).join(", ")}) into ${cell} (cost base x number of rolls).`,
    async (write) => {
      const cur = num((await readRange(cell)).values[0]?.[0]);
      await write(cell, [[cur + ROLL_COST * pending.length]]);
    },
  );
  if (result.saved) await sql`update rolls set booked = true where id in ${sql(pending.map((p) => p.id))}`;
  return Response.json({ booked: result.saved ? pending.length : 0, audit: result.audit, pushError: result.pushError });
}
