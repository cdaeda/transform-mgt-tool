import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

// Short briefing decks answering a management task card (e.g. the AI Bubble update for the Vice-chair).
// Stored in `decks` under their own event name; one generator, one page, one PowerPoint for all of them.
export const BRIEFS: Record<string, { event: string; label: string; ask: string; investorData?: boolean }> = {
  "sale-case": {
    event: "The business case for selling our core business for $60B",
    label: "Why sell for $60B",
    investorData: true,
    ask: `Write the compelling, honest BUSINESS CASE for selling our core business (the vehicle business and Dragon Nexus,
with the network effect and the UX our loyal customers love) to a strategic buyer for $60B - for our board, our
shareholders and a buyer's board. About 3 minutes spoken (all notes together 380-460 words). Leave "scenarios" empty.

Slides, in order: title; rationale (why sell, why now, why a strategic buyer: what they get - plants, legacy systems, the
Dragon Nexus platform, the customer base and network - and what we keep: the core human brains, rebuilt AI-native as
Terralink with none of the legacy infrastructure); valuation (why $60B: a sum of the parts - vehicle business, Dragon
Nexus platform, customer base & network, data assets, strategic premium/synergies - give each part its method, the
multiple or basis, the value and the evidence; use the team's bridge inputs when set, otherwise PROPOSE multiples
justified by the dated COMPARABLES and say they are our assumptions; the parts must add up to about $60B and say so
plainly); proceeds (what the $60B does: repay the $900M+ debt, special dividend, buyback, KingsRock-funded and sale-funded
Terralink launch capital for space and fintech, from the financing plan); returns (what a shareholder gets step by step:
EPS, share price, dividends, total return - from the earnings outlook); risks (gates: lead-lender consent, facilitator
ruling on a third-party sale, AI-bubble timing, buyer financing, what must be true); ask (what we ask the board to approve).
Never invent statistics, buyer names or quotes; [placeholders] where we have no number. The theme line is "The dragon
is shedding" - use that exact phrase, never "shedding its skin".`,
  },
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
  kind: z.enum(["title", "scenarios", "impact", "navigate", "rationale", "valuation", "proceeds", "returns", "risks", "ask"]),
  headline: z.string().describe("The slide's message as a sentence"),
  bullets: z.array(z.string()).describe("2-5 short lines"),
  speaker: z.enum(ROLE_IDS),
  notes: z.string().describe("Exactly what the speaker says"),
});
export const Brief = z.object({
  title: z.string(), subtitle: z.string(),
  scenarios: z.array(Scenario).describe("Exactly three, mild to severe, for a scenario briefing; empty otherwise"),
  valuation: z.array(z.object({
    part: z.string(), method: z.string().describe("e.g. 'after-tax earnings x P/E' or 'revenue x EV/revenue'"),
    basis: z.string().describe("The multiple or basis and where it comes from (a comparable with its date, or 'team assumption')"),
    value_b: z.number().describe("$ billions"),
  })).describe("The sum-of-the-parts bridge for a valuation case (should add up to the target); empty otherwise"),
  slides: z.array(Slide).describe("In the order the task asks for"),
});
export type BriefT = z.infer<typeof Brief>;
