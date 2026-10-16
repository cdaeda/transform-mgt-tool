import ExcelJS from "exceljs";
import { GoogleAuth } from "google-auth-library";
import { HyperFormula, type RawCellContent } from "hyperformula";
import { sql } from "@/lib/db";
import { TEAM_TAB, coerce, parseRange, planWrite, qualify, type Cell } from "@/lib/cells";

export { TEAM_TAB, READ_TAB, OUR_TEAM, qualify } from "@/lib/cells";

// The CFO workbook is an uploaded .xlsx stored in Postgres. ExcelJS keeps the file (formatting
// and all) for download; HyperFormula recalculates the formulas the way Google Sheets would.
// ponytail: one in-memory copy per server instance, last write wins; add row locking if
// several people edit numbers at the same moment.
type Book = { updatedAt: string; filename: string; wb: ExcelJS.Workbook; hf: HyperFormula; pending: Record<string, Cell> };
let cache: Book | null = null;

const plain = (cell: ExcelJS.Cell): RawCellContent => {
  if (cell.formula) return "=" + cell.formula;
  const v = cell.value;
  return v !== null && typeof v === "object" && !(v instanceof Date) ? cell.text : (v as RawCellContent);
};

// Single-flight: concurrent reads share one load (and one database round trip).
let inflight: Promise<Book> | null = null;
function load(): Promise<Book> {
  return (inflight ??= loadOnce().finally(() => (inflight = null)));
}

async function loadOnce(): Promise<Book> {
  const [meta] = await sql<{ updated_at: Date }[]>`select updated_at from workbook where id = 1`;
  if (!meta) throw new Error("No workbook uploaded yet. Upload the CFO .xlsx first.");
  const updatedAt = meta.updated_at.toISOString();
  if (cache?.updatedAt === updatedAt) return cache;

  const [row] = await sql<{ filename: string; data: Buffer }[]>`select filename, data from workbook where id = 1`;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(row.data as unknown as ArrayBuffer);
  const sheets: Record<string, RawCellContent[][]> = {};
  wb.eachSheet((ws) => {
    const grid: RawCellContent[][] = [];
    ws.eachRow({ includeEmpty: true }, (r, ri) =>
      r.eachCell((cell, ci) => ((grid[ri - 1] ??= [])[ci - 1] = plain(cell))),
    );
    sheets[ws.name] = Array.from(grid, (r) => Array.from(r ?? [], (v) => v ?? null));
  });
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3" });
  return (cache = { updatedAt, filename: row.filename, wb, hf, pending: {} });
}

function addresses(range: string, hf: HyperFormula) {
  const { sheet, c0, r0, c1, r1 } = parseRange(range);
  const id = hf.getSheetId(sheet);
  if (id === undefined) throw new Error(`No tab named '${sheet}'.`);
  const start = hf.simpleCellAddressFromString(`${c0}${r0}`, id)!;
  const end = hf.simpleCellAddressFromString(`${c1}${r1}`, id)!;
  return { id, sheet, start, rows: end.row - start.row + 1, cols: end.col - start.col + 1 };
}

const shown = (v: unknown): Cell =>
  v === null || v === undefined ? null : typeof v === "object" ? String((v as { value?: string }).value ?? "#ERROR") : (v as Cell);

// Computed values plus formulas (formula cells start with "="), like the old Sheets read.
export async function readRange(range: string) {
  const { hf } = await load();
  const { id, start, rows, cols } = addresses(range, hf);
  const values: Cell[][] = [];
  const formulas: Cell[][] = [];
  for (let i = 0; i < rows; i++) {
    values.push([]);
    formulas.push([]);
    for (let j = 0; j < cols; j++) {
      const addr = { sheet: id, row: start.row + i, col: start.col + j };
      values[i].push(shown(hf.getCellValue(addr)));
      formulas[i].push(hf.getCellFormula(addr) ?? shown(hf.getCellSerialized(addr)));
    }
  }
  return { range: qualify(range), values, formulas };
}

export type Change = { range: string; before: Cell[][]; after: Cell[][] };

// Applies a write to the in-memory workbook only (validated by planWrite). Call persist() to save
// or discard() to throw it away - this is how the critic agent gates changes before they're saved.
export async function applyWrite(range: string, values: Cell[][]): Promise<Change> {
  const book = await load();
  const { values: before, formulas } = await readRange(range);
  planWrite(range, values, formulas);
  const { id, sheet, start } = addresses(range, book.hf);
  const ws = book.wb.getWorksheet(sheet)!;
  values.forEach((row, i) =>
    row.forEach((v, j) => {
      if (v === null) return;
      const value = coerce(v);
      book.hf.setCellContents({ sheet: id, row: start.row + i, col: start.col + j }, [[value]]);
      const c = ws.getCell(start.row + i + 1, start.col + j + 1);
      c.value = value;
      if (sheet === TEAM_TAB) book.pending[c.address] = value;
    }),
  );
  return { range: qualify(range), before, after: (await readRange(range)).values };
}

// Saves the app copy, then writes the changed Team 1 cells into the class Google Sheet.
// Cells that fail to push stay in `unpushed` and go out with the next save.
export async function persist() {
  const book = await load();
  book.wb.calcProperties.fullCalcOnLoad = true; // Excel/Sheets recompute cached results on open
  const data = Buffer.from(await book.wb.xlsx.writeBuffer());
  const [saved] = await sql<{ updated_at: Date; unpushed: Record<string, Cell> }[]>`
    update workbook set data = ${data}, unpushed = unpushed || ${sql.json(book.pending)}, updated_at = now()
    where id = 1 returning updated_at, unpushed`;
  book.updatedAt = saved.updated_at.toISOString();
  book.pending = {};
  return pushToClassSheet(saved.unpushed);
}

const google = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  ? new GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ["https://www.googleapis.com/auth/spreadsheets"] })
  : null;

async function pushToClassSheet(cells: Record<string, Cell>): Promise<{ pushed: number; pushError?: string }> {
  const data = Object.entries(cells).map(([a1, v]) => ({ range: `'${TEAM_TAB}'!${a1}`, values: [[v ?? ""]] }));
  if (!data.length) return { pushed: 0 };
  if (!CLASS_SHEET_ID) return { pushed: 0, pushError: "CLASS_SHEET_ID is not set; saved in the app only." };
  if (!google) return { pushed: 0, pushError: "Google write access isn't configured; the change is saved in the app only." };
  try {
    const client = await google.getClient();
    await client.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${CLASS_SHEET_ID}/values:batchUpdate`,
      method: "POST",
      data: { valueInputOption: "USER_ENTERED", data },
    });
    await sql`update workbook set unpushed = unpushed - ${Object.keys(cells)}::text[] where id = 1`;
    return { pushed: data.length };
  } catch (e) {
    return { pushed: 0, pushError: `Saved in the app, but writing to the class sheet failed: ${e instanceof Error ? e.message : e}` };
  }
}

// Drop unsaved in-memory changes; the next read reloads the saved workbook.
export function discard() {
  cache = null;
}

// Direct human edit from the grid: apply and save immediately.
export async function writeRange(range: string, values: Cell[][]) {
  const change = await applyWrite(range, values);
  const push = await persist();
  return { range: change.range, written: values.flat().filter((v) => v !== null).length, ...push };
}

const grids = (wb: ExcelJS.Workbook) => {
  const out: Record<string, Map<string, string>> = {};
  wb.eachSheet((ws) => {
    const m = new Map<string, string>();
    ws.eachRow((r) => r.eachCell((c) => void m.set(c.address, String(plain(c) ?? ""))));
    out[ws.name] = m;
  });
  return out;
};

// Cell-level diff between two workbooks: changed-cell count per tab, and Team 1's changes in full.
function diff(oldWb: ExcelJS.Workbook, newWb: ExcelJS.Workbook) {
  const a = grids(oldWb), b = grids(newWb);
  const tabs: Record<string, number> = {};
  const team1: { cell: string; before: string; after: string }[] = [];
  for (const name of Object.keys(b)) {
    const before = a[name] ?? new Map<string, string>(), after = b[name];
    let n = 0;
    for (const addr of new Set([...before.keys(), ...after.keys()])) {
      const x = before.get(addr) ?? "", y = after.get(addr) ?? "";
      if (x === y) continue;
      n++;
      if (name === "Team 1") team1.push({ cell: addr, before: x, after: y });
    }
    if (n) tabs[name] = n;
  }
  return { tabs, team1 };
}

export async function saveWorkbook(filename: string, data: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  if (!wb.getWorksheet("Team 1")) throw new Error("That file has no 'Team 1' tab.");
  const previous = await load().catch(() => null);
  const changes = previous ? diff(previous.wb, wb) : { tabs: {}, team1: [] };
  const lastDiff = { at: new Date().toISOString(), from: previous?.filename ?? null, ...changes };
  await sql`
    insert into workbook (id, filename, data, last_diff, unpushed) values (1, ${filename}, ${data}, ${sql.json(lastDiff)}, '{}')
    on conflict (id) do update set filename = excluded.filename, data = excluded.data,
      last_diff = excluded.last_diff, unpushed = '{}', updated_at = now()`;
  cache = null;
  return lastDiff;
}

// The class sheet is shared "anyone with the link can view", so its .xlsx export needs no credentials.
// The sheet is editable by anyone with its link, so its id is a secret: env only, never in the repo.
export const CLASS_SHEET_ID = process.env.CLASS_SHEET_ID ?? "";

export async function syncFromClassSheet(force = false, maxAgeMs = 0) {
  const [w] = await sql<{ unpushed: Record<string, Cell>; synced_at: Date | null }[]>`select unpushed, synced_at from workbook where id = 1`;
  if (maxAgeMs && w?.synced_at && Date.now() - w.synced_at.getTime() < maxAgeMs) return { skipped: true as const };
  const waiting = Object.keys(w?.unpushed ?? {});
  if (waiting.length && !force)
    throw Object.assign(new Error(`${waiting.length} Team 1 cell(s) saved in the app aren't in the class sheet yet (${waiting.slice(0, 8).join(", ")}). Syncing replaces them with the class sheet's values - OK to continue?`), { status: 409 });
  if (!CLASS_SHEET_ID) throw new Error("CLASS_SHEET_ID is not set.");
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${CLASS_SHEET_ID}/export?format=xlsx`, { cache: "no-store" });
  if (!r.ok || !r.headers.get("content-type")?.includes("spreadsheetml"))
    throw new Error(`Couldn't download the class sheet (HTTP ${r.status}). Is it still shared "anyone with the link"?`);
  const changes = await saveWorkbook("Class sheet (live sync).xlsx", Buffer.from(await r.arrayBuffer()));
  await sql`update workbook set synced_at = now() where id = 1`;
  return changes;
}

export async function workbookFile() {
  const [row] = await sql<{ filename: string; data: Buffer; updated_at: Date }[]>`select filename, data, updated_at from workbook where id = 1`;
  return row ?? null;
}
