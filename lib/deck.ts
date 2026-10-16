import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

export const DECK_EVENT = "Annual Shareholder Meeting & Analyst Day";

const Slide = z.object({
  kind: z.enum(["title", "achievements", "results", "market_cap", "roadmap", "deliver", "ask"]),
  headline: z.string().describe("The slide's message as a sentence, not a topic label"),
  bullets: z.array(z.string()).describe("2-5 short lines; numbers from the workbook only, [placeholders] otherwise"),
  speaker: z.enum(ROLE_IDS).describe("Who presents this slide"),
  notes: z.string().describe("What the speaker says, speakable, ~20-40 seconds"),
});
export const Deck = z.object({
  title: z.string(),
  subtitle: z.string(),
  slides: z.array(Slide).describe("In order: title, achievements, results, market_cap, roadmap, deliver, ask"),
});

export type DeckT = z.infer<typeof Deck>;
