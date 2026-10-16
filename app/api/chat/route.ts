import Anthropic from "@anthropic-ai/sdk";
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

export async function POST(req: Request) {
  const body = await req.json();
  const raw = body.messages as { role: "user" | "assistant"; content: string; image?: string }[];
  const { mode = "chat", threadId, title = "", taskId = null } = body as { mode?: "chat" | "act"; threadId?: string; title?: string; taskId?: number | null };
  const ix = interactionTools();
  // A user message may carry a photo (from the capture modal).
  const messages: Anthropic.MessageParam[] = raw.map((m) =>
    m.image && m.role === "user"
      ? { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.image } }, { type: "text", text: m.content || "(photo)" }] }
      : { role: m.role, content: m.content },
  );
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
        system: `${await systemPrompt()}\n\n${mode === "act" ? ACT : CHAT_TOOLS}\n\nTHE PERSON CHATTING IS THE ${roleOf(req) ?? "UNKNOWN ROLE"}.${cfo ? "" : " Only the CFO can change numbers: you cannot write cells for them. If they ask for a change, say exactly which cells and values the CFO should enter, and suggest a task for the CFO."}`,
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
      const transcript = [...raw.map(({ role, content }) => ({ role, content })), { role: "assistant", content: reply, proposals: ix.proposals, choices: ix.choices }];
      await sql`insert into threads ${sql({ id: threadId, title, task_id: taskId, messages: sql.json(transcript) })}
        on conflict (id) do update set messages = excluded.messages, title = excluded.title, updated_at = now()`;
    }
    return Response.json({ text: reply, proposals: ix.proposals, choices: ix.choices });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : String(e);
    return Response.json({ text: `Error: ${msg}` }, { status: 500 });
  }
}
