// Appendix slides for the Shareholder Day deck: how the team runs Flying Dragon with the Mgt Tool.
// Fixed (not AI-written) and not counted in the 3-minute speaking time. Images live in
// public/deck/tool/ (web copies of the screenshots in docs/tool-in-use/).
export type ToolShot = { src: string; w: number; h: number; caption: string };
export type ToolSlide = { headline: string; lede: string; shots: ToolShot[]; tall?: boolean };

const shot = (name: string, w: number, h: number, caption: string): ToolShot => ({ src: `/deck/tool/${name}.jpg`, w, h, caption });

export const TOOL_SLIDES: ToolSlide[] = [
  {
    headline: "How we run Flying Dragon: one AI-assisted desk for every role",
    lede: "Each role works from the same live workbook. The copilot proposes; the team accepts or rejects; a critic audits every number before it is saved.",
    tall: true,
    shots: [
      shot("copilot-workbook-audit", 832, 1636, "The copilot audits our workbook and queues exact cell fixes, nothing changes until we accept"),
      shot("strategy-knob", 1400, 583, "One knob sets our H1 / H2 / H3 investment mix; every evaluation uses it"),
      shot("analyst-rating-goal", 1400, 473, "Our analyst rating goal, priced in market cap"),
      shot("capital-playbook-dial", 1400, 311, "The capital playbook: aggressive, but completely legal"),
    ],
  },
  {
    headline: "From research to a funded plan, year by year",
    lede: "Funding ideas come from real precedents and the game materials, get sized against the market-cap formula, and land in a year-by-year plan the whole team can see.",
    shots: [
      shot("top-funding-plays", 1400, 994, "Top funding plays, ranked, each with a real precedent"),
      shot("vendor-partner-financing", 1400, 653, "Every idea: fit for us, risks, and its source"),
      shot("year-by-year-plan", 918, 419, "Strategies placed by year; the projection follows"),
      shot("lever-planner-how-we-pay-for-it", 1400, 368, "How we pay for it: profit, borrowing capacity, bond cost"),
    ],
  },
];
