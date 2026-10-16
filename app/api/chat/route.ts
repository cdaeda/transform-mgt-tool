import Anthropic from "@anthropic-ai/sdk";
import { logActivity } from "@/lib/activity";
import { gated } from "@/lib/critic";
import { sql } from "@/lib/db";
import { interactionTools } from "@/lib/proposals";
import { roleOf } from "@/lib/role-guard";
import { makeWriteTool, readTool, systemPrompt } from "@/lib/tools";

export const maxDuration = 300;

const client = new Anthropic();

const CHAT_TOOLS = `When you recommend a change to the organization, also call propose_changes so the team can accept or
reject it. When a decision is the team's to make, use offer_choices instead of a long question.`;
const ACT = `YOU ARE WORKING A TASK WITH THE TEAM (see the first message). Drive it to done, fast:
1. If how to approach it is genuinely open, ask 1-3 focused questions with offer_choices (one call per
   question, options tappable). Skip questions whose answers are already in our data or memory.
2. Then produce the deliverable or plan itself (the script, the numbers, the analysis) - do the work.
3. Propose every resulting change with propose_changes: workbook inputs, strategy fields, card or financing
   decisions, follow-up tasks for other roles, insights worth remembering (kind "knowledge"), and finally
   kind "task_status" status "done" with a summary of the result.
Never claim a change is made - the team accepts or rejects each proposal.`;

// What each tab's copilot concentrates on.
const FOCUS: Record<string, string> = {
  Dashboard: "the overall position: market cap, the $50B goal, the three horizons and the next moves",
  Tasks: "the team's task board: who owns what, what is due, and getting tasks done",
  Cards: "game cards: evaluating them, choosing which to play, and booking business-model cards",
  Capital: "capital strategies, analyst ratings, the lever plan to $50B and financing research",
  Finance: "what-if scenarios, strategy, innovation and investor relations",
  Teams: "the rival teams: their finances, moves and fit as partners",
  Workbook: "the Team 1 workbook: specific cells, formulas, and errors to fix",
  Activity: "the team's activity log: who decided and did what, and what it led to",
};

// The latest thread for a tab, so each tab's chat picks up where the team left off.
export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get("tab") ?? "Dashboard";
  return Response.json((await sql`select id, title, task_id, messages from threads where tab = ${tab} order by updated_at desc limit 1`)[0] ?? null);
}

export async function POST(req: Request) {
  const body = await req.json();
  const raw = body.messages as { role: "user" | "assistant"; content: string; image?: string; by?: string }[];
  const { mode = "chat", threadId, title = "", taskId = null, tab = "Dashboard" } = body as { mode?: "chat" | "act"; threadId?: string; title?: string; taskId?: number | null; tab?: string };
  // Who said each line: the newest message is from whoever is sending now.
  const me = roleOf(req) ?? "";
  const lastUser = raw.findLastIndex((m) => m.role === "user");
  if (lastUser >= 0) raw[lastUser].by = me;
  const ix = interactionTools();
  // A user message may carry a photo (from the capture modal).
  const messages: Anthropic.MessageParam[] = raw.map((m) =>
    m.image && m.role === "user"
      ? { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.image } }, { type: "text", text: m.content || "(photo)" }] }
      : { role: m.role, content: m.role === "user" && m.by ? `[${m.by}] ${m.content}` : m.content },
  );
  const log = tab === "Activity" ? await sql`select created_at, role, tab, kind, summary from activity order by created_at desc limit 80` : [];
  const last = messages.at(-1);
  const cfo = roleOf(req) === "CFO";
  try {
    let reply = "";
    // Any cells the CFO writes this turn are held in memory until the critic approves them.
    const result = await gated(`CFO chat request: ${typeof last?.content === "string" ? last.content : "(see chat)"}`, async (write) => {
      const final = await client.beta.messages.toolRunner({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: `${await systemPrompt()}\n\n${mode === "act" ? ACT : CHAT_TOOLS}\n\nYOU ARE THE ${tab.toUpperCase()} TAB'S COPILOT: focus on ${FOCUS[tab] ?? FOCUS.Dashboard}. Several team members share this thread; each of their messages starts with their role in [brackets].${log.length ? `\n\nRECENT ACTIVITY (newest first):\n${log.map((a) => `${new Date(a.created_at).toISOString().slice(0, 16)} ${a.role || "?"} @${a.tab || "?"} [${a.kind}] ${a.summary}`).join("\n")}` : ""}\n\nTHE PERSON CHATTING NOW IS THE ${roleOf(req) ?? "UNKNOWN ROLE"}.${cfo ? "" : " Only the CFO can change numbers: you cannot write cells for them. If they ask for a change, say exactly which cells and values the CFO should enter, and suggest a task for the CFO."}`,
        // In "act" mode (working a task) every change goes through accept/reject proposals.
        tools: cfo && mode !== "act" ? [readTool, makeWriteTool(write), ...ix.tools] : [readTool, ...ix.tools],
        max_iterations: 20,
        messages,
      });
      reply =
        final.stop_reason === "refusal"
          ? "The model declined this request."
          : final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    });
    if (result.audit) {
      const a = result.audit;
      const sheet = result.saved ? (result.pushError ? ` ⚠ ${result.pushError}` : ` Written to the class sheet (${result.pushed} cells).`) : "";
      reply += `\n\n— Critic: ${a.verdict}${result.saved ? " (saved)" : " — NOT saved, changes rolled back"}.${sheet} ${a.summary}` +
        a.issues.map((i) => `\n • ${i.cell} [${i.severity}] ${i.problem} → ${i.fix}`).join("");
    }
    if (threadId) {
      const transcript = [...raw.map(({ role, content, by }) => ({ role, content, by })), { role: "assistant", content: reply, proposals: ix.proposals, choices: ix.choices }];
      await sql`insert into threads ${sql({ id: threadId, title, task_id: taskId, tab, messages: sql.json(transcript) })}
        on conflict (id) do update set messages = excluded.messages, title = excluded.title, tab = excluded.tab, updated_at = now()`;
    }
    const asked = raw[lastUser]?.content ?? "";
    await logActivity(req, "chat", `${mode === "act" ? "⚡ " : ""}${asked.slice(0, 200)}`, {
      reply: reply.slice(0, 600),
      proposed: ix.proposals.map((p) => p.summary),
      cells: result.saved ? result.changes.map((c) => c.range) : [],
      critic: result.audit?.verdict,
    }, threadId ?? null);
    if (result.saved && result.changes.length) await logActivity(req, "decision", `Copilot wrote ${result.changes.length} workbook cells (critic ${result.audit?.verdict})`, { cells: result.changes.map((c) => c.range) }, threadId ?? null);
    return Response.json({ text: reply, proposals: ix.proposals, choices: ix.choices });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : String(e);
    return Response.json({ text: `Error: ${msg}` }, { status: 500 });
  }
}
