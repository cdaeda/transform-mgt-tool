import { bookingWrites } from "@/lib/booking";
import { gated } from "@/lib/critic";
import { isBM, sql, type Card } from "@/lib/db";
import { cfoOnly } from "@/lib/role-guard";
import { readRange } from "@/lib/sheet";

export const maxDuration = 300;

// Book a selected card into 'Team 1' with the fixed rules in lib/booking.ts (no AI).
// The critic agent reviews the result before anything is saved.
export async function POST(req: Request) {
  const denied = cfoOnly(req);
  if (denied) return denied;
  const { id } = await req.json();
  const [card] = await sql<Card[]>`select * from cards where id = ${id}`;
  if (!card) return Response.json({ error: "card not found" }, { status: 404 });
  if (card.sheet_row) return Response.json({ error: `already booked at row ${card.sheet_row}` }, { status: 409 });
  if (!isBM(card.type)) return Response.json({ error: `${card.type} cards have no revenue rows to book.` }, { status: 400 });
  const bm = card as Card & { type: "Core" | "Growth" | "Explore" };
  try {
    let row = 0;
    const reason = `Booking card #${card.id} (${card.type}) "${card.title}" into the workbook.
Card text: ${card.card_text}
Card data: capex ${card.capex} in game year ${card.start_year}; revenue Y1-10 ${card.revenue.join(", ")}; cost Y1-10 ${card.cost.join(", ")}.
Our notes: ${card.our_notes || "(none)"}`;
    const result = await gated(reason, async (write) => {
      row = await bookingWrites(bm, readRange, write);
    });
    const [updated] = result.saved
      ? await sql<Card[]>`update cards set status = 'booked', sheet_row = ${row} where id = ${id} returning *`
      : [card];
    return Response.json({ card: updated, saved: result.saved, audit: result.audit, cells: result.changes.map((c) => c.range), pushed: result.pushed, pushError: result.pushError });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
