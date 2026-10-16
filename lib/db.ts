import postgres from "postgres";

// Server-only. Supabase TRANSACTION pooler (port 6543), built for serverless: Vercel pauses idle
// instances, so the session pooler (5432, 15 clients max) filled up with connections that never got
// to close. A 5432 URL is switched to 6543 here. Tested: 750 pipelined queries and concurrent
// transactions on one connection came back matched. One client per process (reused across dev hot
// reloads via globalThis), one connection, closed after 1s idle.
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
export const sql = (g.__sql ??= postgres((process.env.DATABASE_URL ?? "postgres://unset").replace(".pooler.supabase.com:5432/", ".pooler.supabase.com:6543/"), { prepare: false, max: 1, idle_timeout: 1 }));

export const BM_TYPES = ["Core", "Growth", "Explore"] as const;
export const CARD_TYPES = [
  ...BM_TYPES, "Innovation Strategy", "Analyst", "BOOM", "BUST", "Advisor", "Management Event", "Management Challenge",
  "Management Task", "Strategic Dilemma", "Weak Signal", "Market News", "Company", "Super CEO", "Other",
] as const;
export type CardType = (typeof CARD_TYPES)[number];
export const isBM = (t: string): t is (typeof BM_TYPES)[number] => (BM_TYPES as readonly string[]).includes(t);
export type Card = {
  id: number;
  created_at: string;
  type: CardType;
  title: string;
  card_text: string;
  capex: number;
  start_year: number;
  revenue: number[];
  cost: number[];
  recommendation: string;
  evaluation: string;
  partner_verdict: string;
  partner_with: string;
  partner_reasoning: string;
  status: "candidate" | "selected" | "booked" | "passed";
  our_notes: string;
  sheet_row: number | null;
  lens: string;
  horizon_fit: Partial<Record<"H1" | "H2" | "H3", { score: number; why: string }>>;
  primary_horizon: string;
};
export type Strategy = {
  ambition: string;
  short_term: string;
  opex_plan: string;
  medium_term: string;
  current_year: number;
  core_strategy: string;
  knob: number;
  h1_pct: number;
  h2_pct: number;
  h3_pct: number;
  goal_year: number;
  goal_cap: number;
  analyst_target: number[];
};
export type Team = {
  team_number: number;
  company: string;
  observed_cards: string;
  ambition: string;
  notes: string;
  ai_profile: string;
  plug_in: string;
};

// Keep only whitelisted keys from a request body, for `update ... set ${sql(patch)}`.
export const pick = (body: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => k in body).map((k) => [k, body[k]]));
export type FinancingIdea = {
  id: number;
  created_at: string;
  name: string;
  category: string;
  how_it_works: string;
  source: string;
  source_quote: string;
  amount: string;
  cost: string;
  fit: string;
  risks: string;
  recommendation: string;
  status: "idea" | "pitching" | "locked" | "rejected";
  our_notes: string;
  rank: number | null;
  effect: Effect | null;
  year: number | null;
  scale: number;
  aggressiveness: number | null;
  legal_basis: string;
  red_lines: string;
  pitch_to: string;
};
// What a capital strategy does to the market-cap levers when it lands (all optional, 0 = no change).
export type Effect = { cash_m: number; core: number; growth: number; explore: number; analysts: number[]; shares_m: number; interest_m: number };
