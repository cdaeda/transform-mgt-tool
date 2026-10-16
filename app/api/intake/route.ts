import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { buildContext } from "@/lib/context";

export const maxDuration = 300;

const client = new Anthropic();

const Intake = z.object({
  kind: z.enum(["card", "non_card_image", "workbook_change", "question", "instruction", "other"]),
  card_family: z.string().describe("If kind=card: the family printed on the card header (Business Model, Innovation Strategy, Management Event/Challenge/Task, Analyst, BOOM!, BUST!, Strategic Dilemma, Weak Signal, Market News, Advisor, Super CEO, Company...); else empty"),
  title: z.string().describe("Short name for the new chat thread"),
  understood: z.string().describe("One or two sentences: what this is and what the team most likely wants"),
  opening: z.string().describe("The copilot's first message: a crisp read of it (key numbers for a card), why it matters to Dragon Drive / H1-H3, and a one-line question asking what to do. Under 120 words."),
  chips: z.array(z.object({
    label: z.string().describe("2-5 words, verb first, e.g. 'Evaluate & log card'"),
    mode: z.enum(["evaluate_card", "chat", "create_tasks"]),
    prompt: z.string().describe("For mode=chat: the exact instruction to send to the CFO copilot. For create_tasks: what the tasks should accomplish. For evaluate_card: empty."),
  })).describe("2-4 options, best first. Pick the handling that suits this card family or intent."),
});

const ASK = `The team just captured this (photo and/or text). Work out what it is and what they most likely want,
aiming to get from strategy to action fast. Handling by card family:
- Business Model: evaluate & log (financial impact, H1-H3 fit, partner or not), compare against our portfolio, pass quickly.
- Innovation Strategy: cost/cash to activate, which horizon it feeds, partner fit, evaluate & log.
- Management Event / Challenge / Task: draft the presentation or response (spoken, per role), weigh the reward, evaluate & log.
- Analyst, Market News, BOOM!, BUST!: book the effect into the workbook (the critic audits it), response plan.
- Strategic Dilemma: compare the options and recommend one. Weak Signal: pay to learn more or ignore.
- Advisor / Super CEO: which of our cards or squares it multiplies, whether to hire.
Board square (we paid $100k to roll and landed on it): say what it does to us in numbers, the options if
it's a choice (recommend one, with why), and chips to take each option; mention if a card must be drawn.
Non-card image (handout, whiteboard, screenshot, spreadsheet): extract what matters and offer to update our
strategy, add financing ideas, or create tasks. Typed text: classify (question, instruction, workbook change)
and offer the fastest useful actions; plain conversation -> one 'chat' chip that answers it.
Always include a create_tasks chip when there is something the team must do.`;

export async function POST(req: Request) {
  const { image, text } = (await req.json()) as { image?: string; text?: string };
  if (!image && !text?.trim()) return Response.json({ error: "Add a photo or type something." }, { status: 400 });
  try {
    const content: Anthropic.ContentBlockParam[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } });
    content.push({ type: "text", text: `${text?.trim() ? `They wrote: ${text.trim()}\n\n` : ""}${ASK}` });
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(Intake) },
      system: await buildContext(),
      messages: [{ role: "user", content }],
    });
    if (!res.parsed_output) return Response.json({ error: `Couldn't read that (${res.stop_reason}).` }, { status: 502 });
    return Response.json(res.parsed_output);
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
