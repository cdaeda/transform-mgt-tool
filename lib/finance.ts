import { sql, type Card } from "@/lib/db";
import { n2col, num } from "@/lib/impact";
import { readRange } from "@/lib/sheet";

// Per-year results the Finances tab shows, read from the workbook's own formulas.
export async function results() {
  const [s, b] = await Promise.all([readRange("A34:S43"), readRange("D240:AF260")]);
  return s.values.map((r, i) => {
    const t = 1 + 3 * i; // "Total ($M)" column for year i+1 within D..AF
    const cap = num(r[14]), shares = num(r[15]);
    return {
      year: i + 1, completed: String(r[1] ?? ""), costBase: num(r[2]), capex: num(r[3]), oneTime: num(r[4]),
      revenue: num(r[5]), bmCost: num(r[6]), bmProfit: num(r[7]), ebitda: num(r[8]), tax: num(r[9]),
      interest: num(r[10]), depreciation: num(r[11]), net: num(r[12]), cash: num(r[13]),
      cap, shares, eps: num(r[16]), dividend: num(r[17]), dps: num(r[18]),
      price: shares ? (cap * 1e6) / shares : 0,
      capCash: num(b.values[0]?.[t]), capBM: num(b.values[8]?.[t]), capAnalyst: num(b.values[17]?.[t]),
    };
  });
}
export type YearResult = Awaited<ReturnType<typeof results>>[number];

// Where this year's money actually goes, by horizon: BM operating costs (rows 128/146/164)
// plus cap.ex of the cards we booked for this year. Core = H1, Growth = H2, Explore = H3.
// ponytail: cap.ex not tied to a booked card can't be attributed to a horizon, so it's left out.
export async function actualMix(year: number) {
  const col = n2col(1 + year);
  const costs = (await readRange(`${col}128:${col}164`)).values.map((r) => num(r[0]));
  const booked = await sql<Card[]>`select * from cards where status = 'booked' and start_year = ${year}`;
  const capex = (t: string) => booked.filter((c) => c.type === t).reduce((s, c) => s + num(c.capex), 0);
  const spend = { h1: costs[0] + capex("Core"), h2: costs[146 - 128] + capex("Growth"), h3: costs[164 - 128] + capex("Explore") };
  const total = spend.h1 + spend.h2 + spend.h3;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return { spend, total, pct: { h1: pct(spend.h1), h2: pct(spend.h2), h3: pct(spend.h3) } };
}
