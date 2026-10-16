// Pure helpers (no I/O) so the client page and the server can share them.
export type ImpactCard = {
  type: "Core" | "Growth" | "Explore";
  capex: number;
  start_year: number;
  revenue: number[];
  cost: number[];
};

export const n2col = (n: number): string =>
  (n > 26 ? n2col(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
export const col2n = (c: string) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

// 'Team 1' layout: 15 revenue rows per block; matching cost row is 60 below.
export const REVENUE_BLOCK = { Core: 53, Growth: 71, Explore: 89 } as const;
export const COST_OFFSET = 60;
export const UNITS_ROW = { Core: 245, Growth: 246, Explore: 247 } as const;
export const BM_MCAP = { Core: 100, Growth: 500, Explore: 1000 } as const; // $M per active BM
export const unitsCol = (year: number) => n2col(4 + 3 * (year - 1)); // D, G, J, ... for years 1..10
export const TAX = 0.21;

export const num = (v: unknown) => Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0;

// Year-by-year effect of a set of cards (dollars, market cap in $M).
// ponytail: ignores the cash x100 market-cap term (its 50%-of-mcap cap needs the live sheet).
export function impact(cards: ImpactCard[]) {
  let cash = 0;
  return Array.from({ length: 10 }, (_, i) => {
    const year = i + 1;
    const revenue = cards.reduce((s, c) => s + num(c.revenue[i]), 0);
    const cost = cards.reduce((s, c) => s + num(c.cost[i]), 0);
    const capex = cards.reduce((s, c) => s + (c.start_year === year ? num(c.capex) : 0), 0);
    const profit = revenue - cost;
    const afterTax = profit * (1 - TAX);
    cash += afterTax - capex;
    const bmMcap = cards.reduce((s, c) => s + (c.start_year <= year ? BM_MCAP[c.type] : 0), 0);
    return { year, revenue, cost, capex, profit, afterTax, cash, bmMcap };
  });
}

// First row in a block that is still a default placeholder ("(Growth) BM 3" or blank) with no revenue.
export function freeRow(start: number, rows: unknown[][]) {
  const i = rows.findIndex((r) => {
    const name = String(r?.[0] ?? "").trim();
    const placeholder = name === "" || /^\((Core|Growth|Explore)\) BM \d+$/.test(name) || /^BM\d+$/.test(name);
    return placeholder && (r ?? []).slice(1, 11).every((v) => num(v) === 0);
  });
  return i === -1 ? null : start + i;
}
