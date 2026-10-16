import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

const cell = z.union([z.string(), z.number(), z.null()]);
// A change the copilot suggests; nothing happens until someone on the team clicks Accept.
export const Proposal = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workbook"), summary: z.string(), range: z.string().describe("Team 1 input range, e.g. K34"), values: z.array(z.array(cell)) }),
  z.object({ kind: z.literal("strategy"), summary: z.string(), field: z.enum(["ambition", "core_strategy", "short_term", "opex_plan", "medium_term"]), value: z.string() }),
  z.object({ kind: z.literal("task"), summary: z.string(), role: z.enum(ROLE_IDS), title: z.string(), detail: z.string(), due: z.string() }),
  z.object({ kind: z.literal("task_status"), summary: z.string().describe("For 'done': the result of the task in 1-3 sentences - saved to organizational memory"), id: z.number().int(), status: z.enum(["todo", "doing", "done"]) }),
  z.object({ kind: z.literal("card"), summary: z.string(), id: z.number().int(), status: z.enum(["candidate", "selected", "passed"]).optional(), our_notes: z.string().optional() }),
  z.object({ kind: z.literal("financing"), summary: z.string(), id: z.number().int(), status: z.enum(["idea", "picked", "rejected"]).optional(), our_notes: z.string().optional() }),
  z.object({ kind: z.literal("knowledge"), summary: z.string().describe("The insight or decision to remember, one or two sentences") }),
]);
export type ProposalT = z.infer<typeof Proposal>;
export type Choice = { question: string; options: string[] };

// Per-request collectors: the copilot proposes and asks; the client renders accept/reject cards and chips.
export function interactionTools() {
  const proposals: ProposalT[] = [];
  const choices: Choice[] = [];
  const propose = betaZodTool({
    name: "propose_changes",
    description: "Propose concrete changes to the organization for the team to accept or reject one by one (workbook cells, strategy fields, new tasks, task status, card or financing decisions, or an insight to remember). Nothing is applied until accepted. Use for every change you recommend.",
    inputSchema: z.object({ proposals: z.array(Proposal) }),
    run: async ({ proposals: ps }) => (proposals.push(...ps), `Proposed ${ps.length} change(s); the team will accept or reject each.`),
  });
  const ask = betaZodTool({
    name: "offer_choices",
    description: "Ask the user a focused question with 2-4 short answer options they can tap (they can also type their own).",
    inputSchema: z.object({ question: z.string(), options: z.array(z.string()).min(2).max(4) }),
    run: async (c) => (choices.push(c), "Shown to the user as tappable options."),
  });
  return { proposals, choices, tools: [propose, ask] };
}
