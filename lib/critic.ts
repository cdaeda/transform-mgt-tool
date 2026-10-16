import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { auditRules, type Snapshot } from "@/lib/audit-rules";
import { sql } from "@/lib/db";
import { GAME_CONTEXT } from "@/lib/game-context";
import { num } from "@/lib/impact";
import { applyWrite, discard, persist, readRange, type Change } from "@/lib/sheet";
import type { Cell } from "@/lib/cells";

const client = new Anthropic();

const Audit = z.object({
  verdict: z.enum(["PASS", "WARN", "FAIL"]).describe("FAIL = the change makes the workbook wrong or inconsistent and must not be saved; WARN = saveable but has issues to fix; PASS = consistent"),
  summary: z.string().describe("One or two sentences"),
  issues: z.array(z.object({
    cell: z.string(),
    severity: z.enum(["error", "warning"]),
    problem: z.string(),
    fix: z.string().describe("The exact value or action that would fix it"),
  })),
});
export type AuditResult = z.infer<typeof Audit>;

const CRITIC = `You are an independent financial auditor (the critic) for a team's TRANSFORM! CFO workbook.
The workbook will be audited by the facilitators, so your job is to catch anything that is wrong or
internally inconsistent - you did not make these changes and you are not here to be agreeable.
Check every proposed change against the source it came from and against the rest of the workbook:
- Amounts are FULL DOLLARS in revenue/cost/summary cells (12M = 12000000); market cap block is $M.
- Each BM revenue row has its matching cost row (row + 60) in the same years; years line up with the
  card's start year; growth rules on the card are applied correctly.
- Cap.ex lands in column D of the right year; active BM units (rows 245-247) match the BMs with revenue.
- Interest (col K) matches the debt block; depreciation, cash, dividends, shares are coherent.
- Totals and formula results make sense (no #ERROR, no sign flips, no double counting such as the same
  operating cost in both cost base C and a BM cost row).
Rule-check findings are deterministic evidence - include the ones that matter. Distinguish problems
the CHANGE introduced (can be FAIL) from problems that already existed (WARN, mention as pre-existing).
${GAME_CONTEXT}`;

async function snapshot() {
  const grid = async (r: string) => (await readRange(r)).values;
  const [cR, gR, eR, cC, gC, eC, units, summary, debt] = await Promise.all([
    grid("A53:K67"), grid("A71:K85"), grid("A89:K103"),
    grid("A113:K127"), grid("A131:K145"), grid("A149:K163"),
    grid("D245:AE247"), grid("A34:S43"), grid("A321:D337"),
  ]);
  const snap: Snapshot = {
    revenue: { Core: cR, Growth: gR, Explore: eR },
    cost: { Core: cC, Growth: gC, Explore: eC },
    units,
    summary,
    debtInterest: num(debt[16]?.[2]),
  };
  const text = [["Summary rows 34-43 (A..S)", summary], ["Core revenue 53-67", cR], ["Growth revenue 71-85", gR],
    ["Explore revenue 89-103", eR], ["Core cost 113-127", cC], ["Growth cost 131-145", gC], ["Explore cost 149-163", eC],
    ["Units rows 245-247 (D..AE)", units], ["Debt block 321-337", debt]]
    .map(([label, rows]) => `${label}\n${(rows as Cell[][]).map((r) => r.join(" | ")).join("\n")}`).join("\n\n");
  return { snap, text };
}

// The critic: rule checks + an independent Claude auditor over the (possibly unsaved) workbook.
export async function critique(reason: string, changes: Change[]): Promise<AuditResult> {
  const { snap, text } = await snapshot();
  const findings = auditRules(snap);
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(Audit) },
    system: CRITIC,
    messages: [{
      role: "user",
      content: `WHY THIS CHANGE WAS MADE / SOURCE DATA:\n${reason}\n\nPROPOSED CHANGES (before -> after):\n${
        changes.length ? changes.map((c) => `${c.range}\n  before: ${JSON.stringify(c.before)}\n  after:  ${JSON.stringify(c.after)}`).join("\n") : "(none - full workbook audit)"
      }\n\nRULE-CHECK FINDINGS:\n${findings.map((f) => `${f.severity} ${f.cell}: ${f.problem}`).join("\n") || "(none)"}\n\nWORKBOOK AFTER THE CHANGE ('Team 1'):\n${text}`,
    }],
  });
  return res.parsed_output ?? { verdict: "FAIL", summary: `The critic could not complete (${res.stop_reason}); not saving.`, issues: [] };
}

async function log(reason: string, changes: Change[], audit: AuditResult, saved: boolean) {
  await sql`insert into audits ${sql({ reason, changes: sql.json(changes), verdict: audit.verdict, summary: audit.summary, issues: sql.json(audit.issues), saved })}`;
}

// Run `work` against the in-memory workbook, have the critic review the result, then save
// (PASS/WARN) or roll back (FAIL). Every outcome is logged.
export async function gated(reason: string, work: (write: (range: string, values: Cell[][]) => Promise<Change>) => Promise<void>) {
  const changes: Change[] = [];
  try {
    await work(async (range, values) => {
      const c = await applyWrite(range, values);
      changes.push(c);
      return c;
    });
  } catch (e) {
    discard();
    throw e;
  }
  if (!changes.length) return { audit: null, saved: false, changes, pushed: 0, pushError: undefined as string | undefined };
  let audit: AuditResult;
  try {
    audit = await critique(reason, changes);
  } catch (e) {
    discard();
    throw e;
  }
  const saved = audit.verdict !== "FAIL";
  const push: { pushed: number; pushError?: string } = saved ? await persist() : { pushed: 0 };
  if (!saved) discard();
  await log(reason, changes, audit, saved);
  return { audit, saved, changes, ...push };
}

export async function auditWorkbook() {
  const audit = await critique("On-demand audit of the whole workbook (no new change).", []);
  await log("Full workbook audit", [], audit, false);
  return audit;
}
