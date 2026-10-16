import type { Card } from "@/lib/db";
import { COST_OFFSET, REVENUE_BLOCK, UNITS_ROW, freeRow, num, unitsCol } from "@/lib/impact";
import type { Cell } from "@/lib/cells";

type BMCard = Card & { type: "Core" | "Growth" | "Explore" };
type Read = (range: string) => Promise<{ values: Cell[][] }>;

// The fixed booking rules, as a list of writes: next free BM row in its block, the matching cost
// row, cap.ex added to its start year, and +1 active BM in every year with revenue.
// `read` must see earlier writes in the same batch (so two cards don't take the same row).
export async function bookingWrites(card: BMCard, read: Read, write: (range: string, values: Cell[][]) => Promise<unknown>) {
  const start = REVENUE_BLOCK[card.type];
  const row = freeRow(start, (await read(`A${start}:K${start + 14}`)).values);
  if (!row) throw new Error(`No free ${card.type} row left in ${start}-${start + 14}.`);
  await write(`A${row}:K${row}`, [[`(${card.type}) ${card.title}`, ...card.revenue]]);
  await write(`B${row + COST_OFFSET}:K${row + COST_OFFSET}`, [card.cost]);
  if (card.capex) {
    const cell = `D${33 + card.start_year}`;
    await write(cell, [[num((await read(cell)).values[0]?.[0]) + card.capex]]);
  }
  for (const [i, r] of card.revenue.entries()) {
    if (r <= 0) continue;
    const cell = `${unitsCol(i + 1)}${UNITS_ROW[card.type]}`;
    await write(cell, [[num((await read(cell)).values[0]?.[0]) + 1]]);
  }
  return row;
}
