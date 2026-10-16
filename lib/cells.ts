// Pure cell helpers (no I/O), shared by the workbook layer and its check.
export type Cell = string | number | boolean | null;
export const TEAM_TAB = "Team 1"; // the only tab the app may ever write to
// Since the merger, Nexus's books are GN-Automaker's tab (its Year 4 column is the merged company).
// Bare ranges read there, so writes through bare ranges are refused: the merged books are read-only here.
export const READ_TAB = "Team 5";
export const OUR_TEAM = 5; // our row on the class leaderboard

// Bare "B53:K53" means Nexus's tab.
export function qualify(range: string) {
  return range.includes("!") ? range : `'${READ_TAB}'!${range}`;
}

export function parseRange(range: string) {
  const m = qualify(range).match(/^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i);
  if (!m) throw new Error(`Bad range: ${range}`);
  const [, sheet, c0, r0, c1 = c0, r1 = r0] = m;
  return { sheet, c0: c0.toUpperCase(), r0: +r0, c1: c1.toUpperCase(), r1: +r1 };
}

const isFormula = (v: Cell) => typeof v === "string" && v.startsWith("=");

// Like Sheets' USER_ENTERED: "$1,200,000" and "12%" become numbers, blank becomes empty.
export function coerce(v: Cell): Cell {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return null;
  const n = s.replace(/[$,\s]/g, "");
  if (/^-?\d*\.?\d+%$/.test(n)) return Number(n.slice(0, -1)) / 100;
  if (/^-?\d*\.?\d+$/.test(n)) return Number(n);
  return s;
}

// Validates a write: Team 1 only, never over a formula, never a new formula. null = leave alone.
export function planWrite(range: string, values: Cell[][], formulas: Cell[][]) {
  const { sheet } = parseRange(range);
  if (sheet !== TEAM_TAB) throw new Error(sheet === READ_TAB ? `Nexus's books ('${READ_TAB}') are read-only in this tool; ask GN's CFO to enter it.` : `Writes are limited to the ${TEAM_TAB} tab.`);
  values.forEach((row, i) =>
    row.forEach((v, j) => {
      if (v === null) return;
      if (isFormula(formulas[i]?.[j] ?? null))
        throw new Error(`Cell row ${i + 1}, col ${j + 1} of ${range} is a formula; edit its inputs instead.`);
      if (isFormula(v)) throw new Error("Writing formulas is not allowed.");
    }),
  );
}
