import PptxGenJS from "pptxgenjs";
import { BRIEFS, type BriefT } from "@/lib/brief";
import { sql } from "@/lib/db";
import { ROLES } from "@/lib/roles";

const INK = "1E0B2E", PLUM = "3A1257", GOLD = "C9A227", GREY = "776B8C", FONT = "Arial";
const SEV: Record<string, string> = { mild: "15803D", sharp: "D97706", severe: "D2353F" };
const who = (id: string) => { const r = ROLES.find((x) => x.id === id); return r?.name ? `${r.name} (${r.id})` : id; };

// A briefing deck as an editable PowerPoint (scenario columns drawn as shapes).
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug, b = BRIEFS[slug];
  if (!b) return new Response("Unknown briefing", { status: 404 });
  const [row] = await sql<{ content: BriefT; created_at: Date }[]>`select content, created_at from decks where event = ${b.event} order by created_at desc limit 1`;
  if (!row) return new Response("Not written yet - write it on the briefing page first.", { status: 404 });
  const d = row.content, pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = d.title;
  d.slides.forEach((s, k) => {
    const slide = pptx.addSlide();
    slide.addNotes(`${who(s.speaker)}\n\n${s.notes}`);
    if (s.kind === "title") {
      slide.background = { color: PLUM };
      slide.addText("UPDATE FOR THE VICE-CHAIR  ·  RISK COMMITTEE", { x: 0.7, y: 0.6, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: GOLD, bold: true, charSpacing: 2 });
      slide.addText(d.title, { x: 0.7, y: 2.3, w: 12, h: 1.4, fontFace: FONT, fontSize: 48, color: "FFFFFF", bold: true });
      slide.addText(s.headline, { x: 0.7, y: 3.8, w: 11.5, h: 1.2, fontFace: FONT, fontSize: 22, color: "FFFFFF" });
      slide.addText(d.subtitle, { x: 0.7, y: 5.2, w: 11.5, h: 0.8, fontFace: FONT, fontSize: 14, color: "D9CCE8" });
      return;
    }
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText(s.kind.toUpperCase(), { x: 0.6, y: 0.35, w: 8, h: 0.35, fontFace: FONT, fontSize: 11, color: "8A6414", bold: true, charSpacing: 2 });
    slide.addText(s.headline, { x: 0.6, y: 0.7, w: 12.1, h: 1.0, fontFace: FONT, fontSize: 24, color: INK, bold: true, valign: "top" });
    if (["scenarios", "impact", "navigate"].includes(s.kind)) {
      d.scenarios.forEach((x, j) => {
        const cx = 0.6 + j * 4.1, col = SEV[x.severity] ?? GREY;
        slide.addShape(pptx.ShapeType.rect, { x: cx, y: 1.85, w: 3.9, h: 0.08, fill: { color: col }, line: { color: col } });
        const items = s.kind === "scenarios" ? [x.what_happens, ...x.signals.map((t) => `Signal: ${t}`)] : s.kind === "impact" ? x.impact_on_us : x.our_moves;
        slide.addText([{ text: `${x.severity.toUpperCase()}\n`, options: { fontSize: 10, bold: true, color: col } }, { text: `${x.name}\n`, options: { fontSize: 18, bold: true, color: INK } },
          ...items.map((t) => ({ text: t, options: { fontSize: 12, color: INK, bullet: { code: "25B8" }, breakLine: true } }))],
          { x: cx, y: 2.0, w: 3.9, h: 4.8, fontFace: FONT, valign: "top", paraSpaceAfter: 4 });
      });
    } else {
      slide.addText(s.bullets.map((t) => ({ text: t, options: { bullet: { code: "25B8" }, breakLine: true } })), { x: 0.6, y: 1.9, w: 12.1, h: 4.8, fontFace: FONT, fontSize: 18, color: INK, valign: "top", paraSpaceAfter: 10 });
    }
    slide.addText(`Flying Dragon · ${b.label}`, { x: 0.6, y: 7.0, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY });
    slide.addText(`Presenter: ${who(s.speaker)}   ${k + 1}`, { x: 6.7, y: 7.0, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY, align: "right" });
  });
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation", "content-disposition": `attachment; filename="Flying-Dragon-${slug}-${row.created_at.toISOString().slice(0, 10)}.pptx"` } });
}
