import { z } from "zod";
import { ROLE_IDS } from "@/lib/roles";

export const DECK_EVENT = "Annual Shareholder Meeting & Analyst Day";

const Slide = z.object({
  kind: z.enum(["title", "progress", "achievements", "results", "earnings", "market_cap", "roadmap", "deliver", "acquisition", "ask"]),
  headline: z.string().describe("The slide's message as a sentence, not a topic label"),
  bullets: z.array(z.string()).describe("2-5 short lines; numbers from the workbook only, [placeholders] otherwise"),
  speaker: z.enum(ROLE_IDS).describe("Who presents this slide"),
  notes: z.string().describe("Exactly what the speaker says, speakable. The whole deck's notes total 400-460 words (3-minute limit at ~170 words/min): title ~35 words, others ~55-75."),
});
export const Deck = z.object({
  title: z.string(),
  subtitle: z.string(),
  slides: z.array(Slide).describe("In order: title, progress, achievements, results, earnings, market_cap, roadmap, deliver, acquisition (the sale and the investor return), ask"),
});

export type DeckT = z.infer<typeof Deck>;
