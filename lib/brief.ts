import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

// Short briefing decks answering a management task card (e.g. the AI Bubble update for the Vice-chair).
// Stored in `decks` under their own event name; one generator, one page, one PowerPoint for all of them.
export const BRIEFS: Record<string, { event: string; label: string; ask: string }> = {
  "ai-bubble": {
    event: "AI Bubble · update for the Vice-chair (management task #49)",
    label: "AI Bubble update",
    ask: `Management task card #49, "AI Bubble": the Vice-board chair, who also heads the Risk committee, says: "We fear there
is an AI bubble coming. Excessive AI build out, massive cap.ex commitments, aggressive debt- and bond financing, genuine
bottle necks in the supply chain, we have concerns. Can you provide us three scenarios on how you see the AI bubble
scenarios play out, how it will impact us and how we should navigate it smart?" Prepare a short update for the Vice-chair.

Write a SHORT, sharp board update (about 2 minutes spoken; all notes together 250-330 words). Three scenarios, from mild to
severe (for example a soft landing, a sharp correction and a burst with a credit crunch); for each: what happens and the
early-warning signals; how it hits US specifically (our analyst ratings and market cap, the $900M lead-lender debt and its
covenants, any bond or loan plans, the KingsRock $400M raise, the supply chain for chips and satellites, Dragon Nexus demand,
the vehicle business and the planned $50-60B sale and Terralink launch); and our pre-agreed moves. Then how we navigate it
smart overall: why our plan is bubble-resilient (manufacturing cash first, partner- and customer-funded build-out, gated
cap.ex, no bond binge, real revenue before scale) and what we ask of the Risk committee. Use our live numbers; never invent
statistics, probabilities or quotes - give the team's judgement as judgement and use [placeholders] where a number is unknown.`,
  },
};

const Scenario = z.object({
  name: z.string().describe("Short name, e.g. 'Soft landing'"),
  severity: z.enum(["mild", "sharp", "severe"]),
  what_happens: z.string(),
  signals: z.array(z.string()).describe("2-4 early-warning signals we watch"),
  impact_on_us: z.array(z.string()).describe("2-4 concrete hits to us, with our numbers where we have them"),
  our_moves: z.array(z.string()).describe("2-4 pre-agreed actions if it happens"),
});
const Slide = z.object({
  kind: z.enum(["title", "scenarios", "impact", "navigate", "ask"]),
  headline: z.string().describe("The slide's message as a sentence"),
  bullets: z.array(z.string()).describe("2-5 short lines"),
  speaker: z.enum(ROLE_IDS),
  notes: z.string().describe("Exactly what the speaker says"),
});
export const Brief = z.object({
  title: z.string(), subtitle: z.string(),
  scenarios: z.array(Scenario).describe("Exactly three, mild to severe"),
  slides: z.array(Slide).describe("In order: title, scenarios, impact, navigate, ask"),
});
export type BriefT = z.infer<typeof Brief>;
