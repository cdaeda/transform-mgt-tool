import { z } from "zod";

// The Nexus strategy & investment case, as structured content (no markdown, so it renders
// the same in the dashboard, the Word download and the print view).
export const StrategyDoc = z.object({
  title: z.string().describe("e.g. 'Nexus: Connecting Intelligence. Powering the Future.'"),
  tagline: z.string().describe("One line: what Nexus is"),
  summary: z.string().describe("3-4 sentence plain-language summary of the core strategy for the dashboard card"),
  executive_summary: z.array(z.string()).describe("3-5 short paragraphs"),
  roadmap: z.array(z.object({
    horizon: z.enum(["H1", "H2", "H3"]),
    name: z.string().describe("e.g. 'Build the vehicles, fund the transformation'"),
    when: z.string().describe("Timing in game years, e.g. 'Years 1-3'; mark '(proposed)' unless the team set it"),
    goal: z.string(),
    entails: z.array(z.string()).describe("3-6 concrete moves / what it entails"),
    milestones: z.array(z.string()).describe("2-4 checkable milestones, with [placeholders] where a figure is not confirmed"),
    funded_by: z.string(),
    kpi: z.string().describe("The metric we track and its target (or 'target not set')"),
    status: z.string().describe("Where we stand today, from live numbers"),
  })).describe("Exactly H1, H2, H3 in order"),
  sections: z.array(z.object({
    heading: z.string(),
    paragraphs: z.array(z.string()),
    bullets: z.array(z.string()).describe("Optional list; empty if none"),
  })).describe("In order: The opportunity; What Dragon Nexus is (the two-sided 4D-intelligence marketplace, Dragon Ledger, Dragon Credits); Competitive position (threat, advantage, marketplace flywheel); Business model and portfolio (cards by horizon); Financial position (live figures); Capital plan and use of funds (financing stack, lender covenants); Governance and AI risk posture; Team and next 90 days; Key performance indicators"),
  risks: z.array(z.string()).describe("Risk factors, most material first"),
  assumptions: z.array(z.string()).describe("Unconfirmed assumptions and [placeholders] the team must confirm"),
});
export type StrategyDocT = z.infer<typeof StrategyDoc>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Self-contained, print-ready HTML. Saved with a .doc name, Word opens it as an editable document.
export function docHtml(d: StrategyDocT, asOf: Date) {
  const date = asOf.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const hue = { H1: "#3557b0", H2: "#2f8fb5", H3: "#6a4bc4" };
  const list = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>
  @page { size: A4; margin: 22mm 18mm; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1e0b2e; line-height: 1.5; max-width: 760px; margin: 2rem auto; padding: 0 1rem; }
  h1, h2, h3 { font-family: "Arial Narrow", Arial, sans-serif; letter-spacing: .02em; }
  h1 { font-size: 30px; margin: 0; } h2 { font-size: 19px; text-transform: uppercase; border-bottom: 2px solid #c9a227; padding-bottom: 4px; margin-top: 32px; }
  h3 { font-size: 15px; margin: 0 0 4px; }
  .cover { border-top: 8px solid #3a1257; padding-top: 18px; margin-bottom: 24px; }
  .asof { float: right; font: 12px Arial, sans-serif; color: #776b8c; }
  .tag { font-size: 16px; color: #5b4f6f; margin-top: 6px; }
  .note { font: 11px Arial, sans-serif; color: #776b8c; }
  .stage { border-left: 4px solid; padding: 4px 0 4px 14px; margin: 14px 0; page-break-inside: avoid; }
  .meta { font: 12px Arial, sans-serif; color: #43385a; }
  li { margin: 2px 0; }
</style></head><body>
<div class="cover"><span class="asof">As of ${date}</span><h1>${esc(d.title)}</h1><p class="tag">${esc(d.tagline)}</p>
<p class="note">Nexus (GN-Automaker, Relay, Flying Dragon) · prepared for the board. Figures from the team workbook; [bracketed] items are placeholders to confirm.</p></div>
<h2>Executive summary</h2>${d.executive_summary.map((p) => `<p>${esc(p)}</p>`).join("")}
<h2>Roadmap: three horizons</h2>
${d.roadmap.map((r) => `<div class="stage" style="border-color:${hue[r.horizon]}">
  <h3 style="color:${hue[r.horizon]}">${r.horizon} · ${esc(r.name)} <span class="meta">— ${esc(r.when)}</span></h3>
  <p><strong>Goal.</strong> ${esc(r.goal)}</p>
  <p class="meta"><strong>Funded by:</strong> ${esc(r.funded_by)} · <strong>KPI:</strong> ${esc(r.kpi)} · <strong>Today:</strong> ${esc(r.status)}</p>
  <p><strong>What it entails</strong></p>${list(r.entails)}
  <p><strong>Milestones</strong></p>${list(r.milestones)}
</div>`).join("")}
${d.sections.map((s) => `<h2>${esc(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${list(s.bullets)}`).join("")}
<h2>Risk factors</h2>${list(d.risks)}
<h2>Assumptions to confirm</h2>${list(d.assumptions)}
</body></html>`;
}
