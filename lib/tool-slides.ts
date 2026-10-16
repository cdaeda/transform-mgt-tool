// Appendix slides for the Shareholder Day deck: how the team runs Flying Dragon with the Mgt Tool.
// Fixed (not AI-written) and not counted in the 3-minute speaking time. Images live in
// public/deck/tool/ (web copies of the screenshots in docs/tool-in-use/).
// box / cap: where the image and its caption sit on the PowerPoint slide (inches, 13.33 x 7.5),
// as the team laid them out by hand; cap null = no caption on the slide.
type Box = [x: number, y: number, w: number, h: number];
export type ToolShot = { src: string; w: number; h: number; caption: string; box: Box; cap: Box | null };
export type ToolSlide = { headline: string; lede: string; shots: ToolShot[]; tall?: boolean; ledeBox: Box; footerLeft: boolean };

const shot = (name: string, w: number, h: number, caption: string, box: Box, cap: Box | null): ToolShot => ({ src: `/deck/tool/${name}.jpg`, w, h, caption, box, cap });

export const TOOL_SLIDES: ToolSlide[] = [
  {
    headline: "How we run Flying Dragon: one AI-assisted desk for every role",
    lede: "Each role works from the same live workbook. The copilot proposes; the team accepts or rejects; a critic audits every number before it is saved.",
    tall: true,
    ledeBox: [0.65, 1.33, 12, 0.29],
    footerLeft: true,
    shots: [
      shot("copilot-workbook-audit", 832, 1636, "The copilot audits our workbook and queues exact cell fixes, nothing changes until we accept", [0.48, 1.85, 2.34, 4.6], [0, 6.43, 3.3, 0.4]),
      shot("strategy-knob", 1400, 583, "One knob sets our H1 / H2 / H3 investment mix; every evaluation uses it", [3.02, 1.78, 4.63, 1.93], [3.45, 3.71, 3.94, 0.4]),
      shot("analyst-rating-goal", 1400, 473, "Our analyst rating goal, priced in market cap", [7.75, 1.78, 5.43, 1.83], [9.24, 3.63, 2.97, 0.25]),
      shot("capital-playbook-dial", 1400, 291, "The capital playbook: aggressive, but completely legal", [3.58, 4.15, 9.25, 1.93], [3.61, 6.06, 8.3, 0.25]),
    ],
  },
  {
    headline: "From research to a funded plan, year by year",
    lede: "Funding ideas come from real precedents and the game materials, get sized against the market-cap formula, and land in a year-by-year plan the whole team can see.",
    ledeBox: [0.63, 1.22, 12.51, 0.29],
    footerLeft: false,
    shots: [
      shot("top-funding-plays", 1400, 994, "Top funding plays, ranked, each with a real precedent", [1.04, 1.56, 4.27, 3.03], null),
      shot("vendor-partner-financing", 1400, 653, "Every idea: fit for us, risks, and its source", [6.4, 1.56, 5.9, 2.75], [6.64, 4.25, 5.8, 0.25]),
      shot("year-by-year-plan", 918, 419, "Strategies placed by year; the projection follows", [0.99, 4.72, 5.24, 2.39], [0.5, 7.13, 5.8, 0.25]),
      shot("lever-planner-how-we-pay-for-it", 1400, 368, "How we pay for it: profit, borrowing capacity, bond cost", [6.47, 4.99, 5.9, 1.55], [6.52, 6.66, 5.8, 0.25]),
    ],
  },
];
