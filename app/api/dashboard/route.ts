import { sql, type Card, type FinancingIdea, type Strategy, type Team } from "@/lib/db";
import { getSnapshot } from "@/lib/snapshot";
import { outlookBaseFrom } from "@/lib/outlook";

type Status = "on-track" | "at-risk" | "off-track" | "no-target";

// actual / target: >= 100% on track, >= 50% at risk, else off track.
const status = (actual: number, target: number | null): Status =>
  !target ? "no-target" : actual >= target ? "on-track" : actual >= target * 0.5 ? "at-risk" : "off-track";

type S = Strategy & { h1_target: number | null; h2_target: number | null; h3_target: number | null; h3_partners: number; updated_at: Date };

// The first screen in one request: certificate + KPIs + horizons + knob, from the precomputed
// workbook snapshot plus our own tables (no spreadsheet work on the read path).
export async function GET() {
  try {
    const [snap, [st], cards, teams, financing, [wb], [lastAudit]] = await Promise.all([
      getSnapshot(),
      sql<S[]>`select * from strategy where id = 1`,
      sql<Card[]>`select id, type, status, capex, start_year, partner_verdict from cards`,
      sql<Team[]>`select team_number, plug_in from teams`,
      sql<FinancingIdea[]>`select id, name, status, year, scale, effect, category, recommendation from financing_ideas where status <> 'rejected'`,
      sql<{ unpushed: Record<string, unknown>; updated_at: Date }[]>`select unpushed, updated_at from workbook where id = 1`,
      sql<{ verdict: string; summary: string; created_at: Date }[]>`select verdict, summary, created_at from audits order by created_at desc limit 1`,
    ]);
    const y = st.current_year, i = y - 1;
    const now = snap.years[i], prev = y > 1 ? snap.years[i - 1] : null;
    const at = (row: number) => snap.seg[row]?.[i] ?? 0;
    const [coreRev, growthRev, exploreRev] = [at(68), at(86), at(104)];
    const [coreProfit, growthProfit, exploreProfit] = [at(187), at(205), at(223)];
    const units = snap.units.map((r) => r[i] ?? 0);
    const fixed = now.costBase + now.interest;
    const live = (c: Card) => c.status === "selected" || c.status === "booked";

    // Actual spend by horizon: BM operating costs + cap.ex of cards booked for this year.
    const booked = cards.filter((c) => c.status === "booked" && c.start_year === y);
    const capex = (t: string) => booked.filter((c) => c.type === t).reduce((s, c) => s + Number(c.capex), 0);
    const spend = { h1: at(128) + capex("Core"), h2: at(146) + capex("Growth"), h3: at(164) + capex("Explore") };
    const total = spend.h1 + spend.h2 + spend.h3;
    const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

    const ours = snap.leaderboard.find((b) => b.team === 1)?.caps[i] ?? 0;
    const rank = snap.leaderboard.length ? `#${snap.leaderboard.filter((b) => b.caps[i] > ours).length + 1} of ${snap.leaderboard.length}` : "";

    return Response.json({
      year: y,
      certificate: {
        caps: snap.years.map((r) => r.cap), price: snap.years.map((r) => r.price), eps: snap.years.map((r) => r.eps),
        parts: { Cash: now.capCash, "BM portfolio": now.capBM, "Analyst cards": now.capAnalyst }, rank,
      },
      kpis: {
        revenue: now.revenue + now.oneTime, revenuePrev: prev ? prev.revenue + prev.oneTime : null,
        ebitda: now.ebitda, ebitdaPrev: prev?.ebitda ?? null,
        margin: now.revenue ? now.ebitda / now.revenue : null,
        net: now.net, netPrev: prev?.net ?? null,
        cash: now.cash, fundingGap: now.cash < 0 ? -now.cash : 0,
        interestShare: now.revenue ? now.interest / now.revenue : null,
        capex: now.capex,
      },
      horizons: [
        {
          id: "H1", name: "Build the vehicles, fund the transformation", portfolio: "Core",
          metric: "Core BM profit this year", actual: coreProfit, target: st.h1_target, unit: "$", status: status(coreProfit, st.h1_target),
          facts: [
            { label: "Core revenue", value: coreRev, unit: "$" },
            { label: "Covers fixed costs (cost base + interest)", value: fixed ? coreProfit / fixed : null, unit: "x" },
            { label: "Active Core BMs (market cap)", value: units[0], unit: "#" },
          ],
        },
        {
          id: "H2", name: "Launch Dragon Nexus", portfolio: "Growth",
          metric: "Growth / data revenue this year", actual: growthRev, target: st.h2_target, unit: "$", status: status(growthRev, st.h2_target),
          facts: [
            { label: "Growth BM profit", value: growthProfit, unit: "$" },
            { label: "Active Growth BMs (market cap)", value: units[1], unit: "#" },
            { label: "Growth cards selected or booked", value: cards.filter((c) => c.type === "Growth" && live(c)).length, unit: "#" },
          ],
        },
        {
          id: "H3", name: "Own the intelligence network", portfolio: "Explore → network",
          metric: "Network partners signed", actual: st.h3_partners, target: st.h3_target, unit: "#", status: status(st.h3_partners, st.h3_target),
          facts: [
            { label: "Teams profiled as partner fits", value: teams.filter((t) => t.plug_in.trim()).length, unit: "#" },
            { label: "Cards where AI says partner", value: cards.filter((c) => c.partner_verdict === "Partner").length, unit: "#" },
            { label: "Explore revenue / profit", value: exploreRev, unit: "$", extra: exploreProfit },
            { label: "Active Explore BMs (market cap)", value: units[2], unit: "#" },
          ],
        },
      ],
      pipeline: {
        drawn: cards.length,
        candidate: cards.filter((c) => c.status === "candidate").length,
        selected: cards.filter((c) => c.status === "selected").length,
        booked: cards.filter((c) => c.status === "booked").length,
        financingPicked: financing.filter((f) => f.status === "locked").map((f) => f.name),
      },
      health: { unpushed: Object.keys(wb?.unpushed ?? {}).length, workbookUpdated: wb?.updated_at ?? null, lastAudit: lastAudit ?? null },
      targets: { h1: st.h1_target, h2: st.h2_target, h3: st.h3_target, h3_partners: st.h3_partners },
      knob: { value: st.knob, target: { h1: st.h1_pct, h2: st.h2_pct, h3: st.h3_pct }, actual: { spend, total, pct: { h1: pct(spend.h1), h2: pct(spend.h2), h3: pct(spend.h3) } } },
      strategyUpdated: st.updated_at,
      teams: snap.teams,
      goal: { year: st.goal_year ?? 3, cap: st.goal_cap ?? 50000 },
      capital: financing.map((f) => ({ id: f.id, name: f.name, status: f.status, year: f.year, scale: f.scale, effect: f.effect, category: f.category })),
      // This year's starting point and the team's assumptions for the earnings outlook (lib/outlook.ts).
      outlookBase: outlookBaseFrom(snap, y),
      outlook: st.outlook ?? {},
      // Workbook baseline for the multi-year simulator (lib/simulate.ts), plus data-derived defaults.
      sim: {
        now: y,
        segRev: [68, 86, 104].map((r) => snap.seg[r] ?? []), segCost: [128, 146, 164].map((r) => snap.seg[r] ?? []),
        costBase: snap.years.map((r) => r.costBase), interest: snap.years.map((r) => r.interest),
        net: snap.years.map((r) => r.net), cash: snap.years.map((r) => r.cash),
        units: snap.units, analysts: snap.analysts ?? [], shares: now.shares || 1e9, debt: snap.debt ?? 0,
        avgCapex: Object.fromEntries((["Core", "Growth", "Explore"] as const).map((t) => {
          const xs = cards.filter((c) => c.type === t && Number(c.capex) > 0).map((c) => Number(c.capex));
          return [t.toLowerCase(), xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0];
        })),
      },
      plan: {
        units: { core: units[0], growth: units[1], explore: units[2] },
        analysts: (snap.analysts ?? []).map((r) => r[i] ?? 0),
        cashForCap: snap.cashUnits?.[i] ?? 0,
        cash: now.cash, shares: now.shares || 1e9,
        revenue: now.revenue + now.oneTime, expenses: now.bmCost + now.costBase + now.interest,
        bmProfit10y: [187, 205, 223].reduce((s, r) => s + (snap.seg[r] ?? []).reduce((a, b) => a + b, 0), 0),
        revenue10y: [68, 86, 104].reduce((s, r) => s + (snap.seg[r] ?? []).reduce((a, b) => a + b, 0), 0),
        net: now.net, debt: snap.debt ?? 0,
        years: snap.years.map((r) => ({ year: r.year, revenue: r.revenue + r.oneTime, expenses: r.bmCost + r.costBase + r.interest })),
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
