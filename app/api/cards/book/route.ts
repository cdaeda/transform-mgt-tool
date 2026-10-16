import { logActivity } from "@/lib/activity";
import { analystWrites, bookingWrites } from "@/lib/booking";
import { gated } from "@/lib/critic";
import { isBM, sql, type Card, type Strategy } from "@/lib/db";
import { ANALYST_NAMES } from "@/lib/marketcap";
import { cfoOnly } from "@/lib/role-guard";
import { readRange } from "@/lib/sheet";

export const maxDuration = 300;

// Book a selected card into 'Team 1' with the fixed rules in lib/booking.ts (no AI).
// The critic agent reviews the result before anything is saved.
export async function POST(req: Request) {
  const denied = cfoOnly(req);
  if (denied) return denied;
  const { id, from = -1, to = -1 } = await req.json();
  const [card] = await sql<Card[]>`select * from cards where id = ${id}`;
  if (!card) return Response.json({ error: "card not found" }, { status: 404 });
  if (card.sheet_row) return Response.json({ error: `already booked at row ${card.sheet_row}` }, { status: 409 });
  if (card.type === "Analyst") return bookAnalyst(req, card, Number(from), Number(to));
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
    if (result.saved) await logActivity(req, "decision", `Booked card #${card.id} into the workbook: ${card.title}`, { card: card.id, cells: result.changes.map((c) => c.range), critic: result.audit?.verdict });
    return Response.json({ card: updated, saved: result.saved, audit: result.audit, cells: result.changes.map((c) => c.range), pushed: result.pushed, pushError: result.pushError });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

// An analyst card moves one rating (e.g. Sell -> Buy) in this game year's analyst block.
async function bookAnalyst(req: Request, card: Card, from: number, to: number) {
  const name = (k: number) => (k < 0 ? "none" : ANALYST_NAMES[k]);
  const [{ current_year: year }] = await sql<Strategy[]>`select current_year from strategy where id = 1`;
  try {
    let row = 0;
    const result = await gated(
      `Booking analyst card #${card.id} "${card.title}" for Year ${year}: ${name(from)} -> ${name(to)}.\nCard text: ${card.card_text}\nOur notes: ${card.our_notes || "(none)"}`,
      async (write) => void (row = await analystWrites(year, from, to, readRange, write)),
    );
    const [updated] = result.saved ? await sql<Card[]>`update cards set status = 'booked', sheet_row = ${row} where id = ${card.id} returning *` : [card];
    if (result.saved) await logActivity(req, "decision", `Booked analyst card #${card.id} (Year ${year}): ${name(from)} → ${name(to)} · ${card.title}`, { card: card.id, cells: result.changes.map((c) => c.range), critic: result.audit?.verdict });
    return Response.json({ card: updated, saved: result.saved, audit: result.audit, cells: result.changes.map((c) => c.range), pushed: result.pushed, pushError: result.pushError });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
