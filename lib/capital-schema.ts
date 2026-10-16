import { z } from "zod";

// What a capital strategy does to the market-cap levers when it lands. Every field is a change.
export const EffectSchema = z.object({
  cash_m: z.number().describe("Cash raised (+) or spent (-) in $M that counts for market cap"),
  core: z.number().int(), growth: z.number().int(), explore: z.number().int().describe("Business models added (+) or sold (-)"),
  analysts: z.array(z.number().int()).describe("5 numbers: change in Outperform, Buy, Hold, Sell, Crash cards we expect it to earn or remove"),
  shares_m: z.number().describe("New shares issued (+) or bought back (-), in millions"),
  interest_m: z.number().describe("Added annual interest cost in $M"),
});

export const CapitalStrategy = z.object({
  name: z.string(),
  category: z.string().describe("e.g. Government equity, Equity-for-supply, Customer prepayment, Strategic backstop, Off-balance-sheet SPV, Bond, Convertible, Spin-off/IPO of a unit, Share buyback, Analyst & investor campaign, Asset-light partnership, M&A"),
  how_it_works: z.string(),
  aggressiveness: z.number().int().describe("1-10"),
  legal_basis: z.string().describe("Why it is completely legal: the precedent, rule or structure that makes it so (cite real public examples where they exist; never invent)"),
  red_lines: z.string().describe("Exactly what would make it cross the line (misstatement, undisclosed liabilities, covenant breach, market manipulation...) and how we stay on the right side"),
  pitch_to: z.string().describe("Who must say yes (lead lender, government fund, an anchor OEM, the board, the facilitators...)"),
  amount: z.string().describe("Size, e.g. '$250M' or '[placeholder]'"),
  cost: z.string(),
  year: z.number().int().describe("Game year it lands"),
  effect: EffectSchema,
  fit: z.string().describe("How it moves us toward $50B by the goal year and which horizon it funds"),
  risks: z.string(),
  recommendation: z.enum(["USE", "CONSIDER", "AVOID"]),
});
