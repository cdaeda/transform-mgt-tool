import { sql } from "@/lib/db";
import { results } from "@/lib/finance";
import { num } from "@/lib/impact";
import { readRange } from "@/lib/sheet";

// Everything the first screen needs from the workbook, computed once per workbook version and
// stored next to it. Cold servers read this one row instead of parsing and recalculating the .xlsx.
const VERSION = 4; // bump when the snapshot's shape changes, so stored ones are recomputed

async function compute(at: string) {
  // The leaderboard decides which tab is which team (facilitators rename tabs, e.g. "Team 3 NOT IN USE").
  const board = await readRange("'Leaderboard 2026'!A7:A15");
  const tabs = board.values.flatMap((r, i) => {
    const tab = String(board.formulas[i]?.[0] ?? "").match(/^='?([^'!]+)'?!/)?.[1];
    return typeof r[0] === "number" && r[0] >= 1 && r[0] <= 6 && tab ? [{ n: r[0], tab }] : [];
  });
  const teams = await Promise.all(
    tabs.map(async ({ n, tab }) => {
      const [name, fin] = await Promise.all([readRange(`'${tab}'!B8:B9`), readRange(`'${tab}'!A34:Q43`)]);
      return {
        team: n,
        tab,
        company: String(name.values[0]?.[0] ?? ""),
        location: String(name.values[1]?.[0] ?? ""),
        years: fin.values.map((r) => ({
          completed: String(r[1] ?? "").toLowerCase() === "yes",
          revenue: num(r[5]) + num(r[4]), ebitda: num(r[8]), net: num(r[12]), cash: num(r[13]), cap: num(r[14]), eps: num(r[16]),
        })),
      };
    }),
  );
  const [years, seg, units, lb, analysts, cashUnits, debt, issues] = await Promise.all([
    results(),
    readRange("B68:K223"), // segment revenue/cost/profit totals, Years 1-10 across
    readRange("D245:AF247"), // active Core / Growth / Explore units
    readRange("'Leaderboard 2026'!A7:N15"),
    readRange("D252:AF256"), // analyst cards held: Outperform, Buy, Hold, Sell, Crash
    readRange("D240:AF240"), // cash counted for market cap (full dollars)
    readRange("B337"), // total debt drawn (Debt & loans block)
    readRange("C390:C409"), // new shares issued (Share issue block)
  ]);
  const row = (r: number) => (seg.values[r - 68] ?? []).map(num);
  return {
    at,
    v: VERSION,
    years,
    seg: Object.fromEntries([68, 86, 104, 128, 146, 164, 187, 205, 223].map((r) => [r, row(r)])) as Record<number, number[]>,
    units: units.values.map((r) => Array.from({ length: 10 }, (_, i) => num(r[3 * i]))),
    teams,
    analysts: analysts.values.map((r) => Array.from({ length: 10 }, (_, i) => num(r[3 * i]))),
    debt: num(debt.values[0]?.[0]),
    sharesIssued: issues.values.reduce((s, r) => s + num(r[0]), 0),
    cashUnits: Array.from({ length: 10 }, (_, i) => num(cashUnits.values[0]?.[3 * i])),
    leaderboard: lb.values.filter((r) => typeof r[0] === "number" && r[0] >= 1 && r[0] <= 6).map((r) => ({ team: num(r[0]), caps: r.slice(4, 14).map(num) })),
  };
}
export type Snapshot = Awaited<ReturnType<typeof compute>>;

export async function getSnapshot(): Promise<Snapshot> {
  const [w] = await sql<{ summary: Snapshot | null; updated_at: Date }[]>`select summary, updated_at from workbook where id = 1`;
  if (!w) throw new Error("No workbook uploaded yet.");
  const at = w.updated_at.toISOString();
  if (w.summary?.at === at && w.summary.v === VERSION) return w.summary;
  const snap = await compute(at);
  // Only store it if nobody saved a newer workbook in the meantime.
  await sql`update workbook set summary = ${sql.json(snap)} where id = 1 and date_trunc('milliseconds', updated_at) = ${w.updated_at}`;
  return snap;
}
