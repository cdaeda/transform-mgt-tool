import { aiTool } from "@/lib/ai";
import { z } from "zod";
import { readRange } from "@/lib/sheet";

const cell = z.union([z.string(), z.number(), z.null()]);

export const readTool = aiTool({
  name: "read_range",
  description:
    "Read cells from the CFO workbook. Returns displayed values and formulas (formula cells are computed). A bare range like 'A30:S43' means Nexus's books (the 'Team 5' tab); \"'Team 1'!A30:S43\" is Flying Dragon's legacy tab; use \"'Leaderboard 2026'!A6:N15\" for other tabs.",
  schema: z.object({ range: z.string() }),
  run: async ({ range }) => {
    try {
      return JSON.stringify(await readRange(range));
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : e}`;
    }
  },
});

// Writes go to the in-memory workbook only; the chat route has the critic review them before saving.
export const makeWriteTool = (write: (range: string, values: (string | number | null)[][]) => Promise<unknown>) =>
  aiTool({
    name: "write_cells",
    description:
      "Stage input values in Flying Dragon's legacy 'Team 1' tab - write the range explicitly, e.g. \"'Team 1'!N36\" (Nexus's books on 'Team 5' are read-only). values is a 2D array matching the range; use null for cells to leave unchanged. Formula cells and other tabs are rejected. Staged changes are reviewed by an independent auditor at the end of your turn and only saved if they pass, so keep the workbook internally consistent (matching cost rows, cap.ex, units, interest).",
    schema: z.object({ range: z.string(), values: z.array(z.array(cell)) }),
    run: async ({ range, values }) => {
      try {
        return JSON.stringify(await write(range, values));
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : e}`;
      }
    },
  });

export { buildContext as systemPrompt } from "@/lib/context";
