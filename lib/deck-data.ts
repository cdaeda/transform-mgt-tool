import { sql, type Strategy } from "@/lib/db";
import { defaultOutlook, financingPlanText, outlookBaseFrom, outlookText, type PlanStrat } from "@/lib/outlook";
import { getSnapshot } from "@/lib/snapshot";

// The investor data the deck writer and the briefings read: the outlook, the comparables, the financing plan
// and the saved "Why $60B" bridge.
export async function outlookPrompt() {
  const [[st], snap] = await Promise.all([sql<Strategy[]>`select current_year, goal_year, outlook from strategy where id = 1`, getSnapshot()]);
  const o = { ...defaultOutlook(st.current_year, st.goal_year), ...(st.outlook ?? {}) };
  const strats = await sql<PlanStrat[]>`select name, status, year, scale, category, effect from financing_ideas where status in ('locked', 'pitching')`;
  const comps = await sql<{ company: string; ticker: string; valuation_usd_b: number | null; basis: string; as_of: string; revenue_usd_b: number | null }[]>`select company, ticker, valuation_usd_b, basis, as_of, revenue_usd_b from comps where batch = (select max(batch) from comps)`;
  const compsText = comps.map((c) => `${c.company} (${c.ticker}): ${c.valuation_usd_b === null ? "n/a" : `$${c.valuation_usd_b}B`} ${c.basis}, ${c.as_of}${c.revenue_usd_b !== null ? `, revenue $${c.revenue_usd_b}B` : ""}`).join("\n") || "(none researched yet)";
  const b = o.bridge;
  const bridgeText = b ? `WHY $${b.targetB}B BRIDGE (team inputs): vehicle P/E ${b.vehiclePe}x, Dragon Nexus EV/revenue ${b.nexusMultiple}x, ${b.customers} customers x $${b.valuePerCustomer}, network & data $${b.networkB}B, strategic premium ${b.premiumPct}%.` : "WHY $60B BRIDGE: not set by the team yet.";
  return `${bridgeText}\n\n${outlookText(outlookBaseFrom(snap, st.current_year), o)}\n\nCOMPARABLES (dated; the value pools for space and fintech):\n${compsText}\n\nFINANCING PLAN (by instrument; use it on the deliver slide - say plainly whether we sell shares, issue bonds or take loans, raise partner/customer money, and how we return cash; and say how the NEW VENTURES (Terralink space and fintech) are funded: the initial funding raised now - including any advisor-structured raise and its fee - and then the launch capital from the sale):\n${financingPlanText(strats, o)}`;
}

