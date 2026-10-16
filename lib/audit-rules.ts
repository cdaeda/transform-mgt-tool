// Fixed consistency rules for the 'Team 1' tab (pure, no I/O). The critic agent gets these
// findings as hard evidence alongside the full snapshot.
import { COST_OFFSET, REVENUE_BLOCK, UNITS_ROW, n2col, num, unitsCol } from "./impact.ts";

type Cell = string | number | boolean | null;
export type Finding = { cell: string; severity: "error" | "warning"; problem: string };
export type Snapshot = {
  revenue: Record<"Core" | "Growth" | "Explore", Cell[][]>; // 15 rows x A..K
  cost: Record<"Core" | "Growth" | "Explore", Cell[][]>; // 15 rows x A..K (A = name formula result)
  units: Cell[][]; // rows 245..247 x D..AE
  summary: Cell[][]; // rows 34..43 x A..S
  debtInterest: number; // total annual interest from the debt block
};

const TYPES = ["Core", "Growth", "Explore"] as const;

export function auditRules(s: Snapshot): Finding[] {
  const out: Finding[] = [];
  const completed = s.summary.filter((r) => String(r[1] ?? "").trim().toLowerCase() === "yes").length;

  for (const t of TYPES) {
    s.revenue[t].forEach((row, i) => {
      const r = REVENUE_BLOCK[t] + i;
      for (let y = 1; y <= 10; y++) {
        const rev = num(row[y]);
        const cost = num(s.cost[t][i]?.[y]);
        const col = n2col(y + 1);
        if (rev !== 0 && Math.abs(rev) < 1000)
          out.push({ cell: `${col}${r}`, severity: "error", problem: `Revenue ${rev} looks like millions, not full dollars.` });
        if (cost !== 0 && Math.abs(cost) < 1000)
          out.push({ cell: `${col}${r + COST_OFFSET}`, severity: "error", problem: `Cost ${cost} looks like millions, not full dollars.` });
        if (rev > 0 && cost === 0)
          out.push({ cell: `${col}${r + COST_OFFSET}`, severity: "warning", problem: `${row[0]} has Y${y} revenue but no cost.` });
      }
    });
    // Active BMs per year (rows with revenue) vs the market-cap units the team entered.
    for (let y = 1; y <= Math.max(completed, 1); y++) {
      const active = s.revenue[t].filter((row) => num(row[y]) > 0).length;
      const entered = num(s.units[UNITS_ROW[t] - 245]?.[3 * (y - 1)]);
      if (active !== entered)
        out.push({ cell: `${unitsCol(y)}${UNITS_ROW[t]}`, severity: "warning", problem: `Y${y}: ${active} ${t} BM(s) have revenue but ${entered} entered as active units (market cap).` });
    }
  }

  // Interest from the debt block should show up in column K for completed years.
  if (s.debtInterest > 0)
    s.summary.slice(0, completed).forEach((r, i) => {
      if (num(r[10]) === 0)
        out.push({ cell: `K${34 + i}`, severity: "error", problem: `Debt block shows ${s.debtInterest.toLocaleString("en-US")} interest/yr but Y${i + 1} interest is 0.` });
    });
  return out;
}
