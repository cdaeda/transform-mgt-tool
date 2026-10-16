import Anthropic from "@anthropic-ai/sdk";
import { gated } from "@/lib/critic";
import { roleOf } from "@/lib/role-guard";
import { makeWriteTool, readTool, systemPrompt } from "@/lib/tools";

export const maxDuration = 300;

const client = new Anthropic();

export async function POST(req: Request) {
  const raw = (await req.json()).messages as { role: "user" | "assistant"; content: string; image?: string }[];
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
        system: `${await systemPrompt()}\n\nTHE PERSON CHATTING IS THE ${roleOf(req) ?? "UNKNOWN ROLE"}.${cfo ? "" : " Only the CFO can change numbers: you cannot write cells for them. If they ask for a change, say exactly which cells and values the CFO should enter, and suggest a task for the CFO."}`,
        tools: cfo ? [readTool, makeWriteTool(write)] : [readTool],
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
    return Response.json({ text: reply });
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}` : String(e);
    return Response.json({ text: `Error: ${msg}` }, { status: 500 });
  }
}
