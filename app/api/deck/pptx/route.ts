import { readFileSync } from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { sql, type Strategy } from "@/lib/db";
import { DECK_EVENT, type DeckT } from "@/lib/deck";
import { ANALYST_NAMES, marketCap } from "@/lib/marketcap";
import { ROLES } from "@/lib/roles";
import { listRounds } from "@/lib/rounds";
import { getSnapshot } from "@/lib/snapshot";
import { defaultOutlook, infusionSlide, outlook, outlookBaseFrom, whyPriceSlide, type Outlook } from "@/lib/outlook";
import { simBaseFrom, type InfusionCard } from "@/lib/simulate";
import { TOOL_SLIDES, type ToolShot } from "@/lib/tool-slides";
import type { StrategyDocT } from "@/lib/strategy-doc";

// The Shareholder Day deck as an editable PowerPoint: Claude's narrative + live workbook charts.
const INK = "1E0B2E", PLUM = "3A1257", GOLD = "C9A227", GREY = "776B8C", RED = "D2353F";
const HUE = { H1: "3557B0", H2: "2F8FB5", H3: "6A4BC4" } as const;
const FONT = "Arial";
const money = (n: number) => { const a = Math.abs(n), s = n < 0 ? "-" : ""; if (a < 500) return "$0"; return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : `${s}$${(a / 1e3).toFixed(0)}k`; };
const who = (id: string) => { const r = ROLES.find((x) => x.id === id); return r?.name ? `${r.name} (${r.id})` : id; };

export async function GET() {
  const [deckRow] = await sql<{ content: DeckT; created_at: Date }[]>`select content, created_at from decks where event = ${DECK_EVENT} order by created_at desc limit 1`;
  if (!deckRow) return new Response("No deck yet - write it on the deck page first.", { status: 404 });
  const [[st], [docRow], snap, rounds] = await Promise.all([
    sql<Strategy[]>`select current_year, goal_year, outlook from strategy where id = 1`,
    sql<{ content: StrategyDocT }[]>`select content from strategy_docs order by created_at desc limit 1`,
    getSnapshot(),
    listRounds(),
  ]);
  const i = st.current_year - 1, y = snap.years[i];
  const units = { core: snap.units[0]?.[i] ?? 0, growth: snap.units[1]?.[i] ?? 0, explore: snap.units[2]?.[i] ?? 0 };
  const analysts = (snap.analysts ?? []).map((r) => r[i] ?? 0);
  const mc = marketCap({ ...units, analysts, cash: snap.cashUnits?.[i] ?? 0 });
  const deck = deckRow.content;
  const out: Outlook = { ...defaultOutlook(st.current_year, st.goal_year), ...(st.outlook ?? {}) };
  const ol = outlook(outlookBaseFrom(snap, st.current_year), out);
  const ps = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = deck.title;
  pptx.company = "Flying Dragon";

  // The built-in "Why $60B" slide goes right after the acquisition slide.
  const why = out.saleYear ? whyPriceSlide(ol.rows, out) : null;
  const cards = await sql<InfusionCard[]>`select id, title, type, capex, start_year, revenue, cost from cards`;
  const inf = infusionSlide(simBaseFrom(snap, st.current_year), out, cards.map((c) => ({ ...c, capex: Number(c.capex) })));
  const all = deck.slides.flatMap((s) =>
    s.kind === "acquisition" && why ? [s, { ...why, speaker: s.speaker } as unknown as typeof s]
      : s.kind === "deliver" && inf ? [s, { ...inf, speaker: s.speaker } as unknown as typeof s] : [s]);
  all.forEach((s, k) => {
    const slide = pptx.addSlide();
    const secs = Math.round((s.notes.trim().split(/\s+/).length / 170) * 60);
    slide.addNotes(`${who(s.speaker)} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}\n\n${s.notes}`);
    if (s.kind === "title") {
      slide.background = { color: PLUM };
      slide.addText("TRANSFORM!  ·  " + DECK_EVENT.toUpperCase() + `  ·  YEAR ${st.current_year}`, { x: 0.7, y: 0.6, w: 12, h: 0.4, fontFace: FONT, fontSize: 12, color: GOLD, bold: true, charSpacing: 2 });
      slide.addText("Terralink", { x: 0.7, y: 2.4, w: 12, h: 1.4, fontFace: FONT, fontSize: 66, color: "FFFFFF", bold: true });
      slide.addText(s.headline, { x: 0.7, y: 3.9, w: 11.5, h: 1.2, fontFace: FONT, fontSize: 24, color: "FFFFFF" });
      slide.addText(deck.subtitle, { x: 0.7, y: 5.3, w: 11.5, h: 0.8, fontFace: FONT, fontSize: 14, color: "D9CCE8" });
      slide.addText(`Presenter: ${who(s.speaker)}`, { x: 0.7, y: 6.7, w: 8, h: 0.4, fontFace: FONT, fontSize: 11, color: GOLD });
      return;
    }
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText(s.kind.replace("_", " ").toUpperCase(), { x: 0.6, y: 0.35, w: 8, h: 0.35, fontFace: FONT, fontSize: 11, color: "8A6414", bold: true, charSpacing: 2 });
    slide.addText(s.headline, { x: 0.6, y: 0.7, w: 12.1, h: 1.1, fontFace: FONT, fontSize: 28, color: INK, bold: true, valign: "top" });
    const visual = ["turnaround", "progress", "results", "earnings", "market_cap", "roadmap", "acquisition", "ask", "why_price", "infusion"].includes(s.kind);
    slide.addText(s.bullets.map((b) => ({ text: b, options: { bullet: { code: "25B8" }, breakLine: true } })), {
      x: 0.6, y: 2.0, w: visual ? 5.6 : 12.1, h: 4.6, fontFace: FONT, fontSize: 17, color: INK, valign: "top", paraSpaceAfter: 10,
    });
    const X = 6.6, W = 6.2;
    // Bars drawn as shapes (native charts render blank in Keynote / Google Slides).
    const bars = (items: { label: string; v: number; color: string }[], top: number) => {
      const max = Math.max(1, ...items.map((it) => Math.abs(it.v)));
      const neg = items.some((it) => it.v < 0);
      const L = X + 1.9, span = W - 3.2, zero = neg ? L + span / 2 : L;
      items.forEach((it, j) => {
        const yy = top + j * 0.95, len = (Math.abs(it.v) / max) * (neg ? span / 2 : span);
        slide.addText(it.label, { x: X, y: yy, w: 1.8, h: 0.6, fontFace: FONT, fontSize: 13, color: INK, align: "right", valign: "middle" });
        slide.addShape(pptx.ShapeType.rect, { x: L, y: yy + 0.08, w: span, h: 0.44, fill: { color: "F1EDF6" }, line: { color: "F1EDF6" } });
        if (len > 0.01) slide.addShape(pptx.ShapeType.rect, { x: it.v < 0 ? zero - len : zero, y: yy + 0.08, w: len, h: 0.44, fill: { color: it.v < 0 ? RED : it.color }, line: { color: it.v < 0 ? RED : it.color } });
        slide.addText(money(it.v), { x: L + span + 0.1, y: yy, w: 1.2, h: 0.6, fontFace: FONT, fontSize: 13, bold: true, color: it.v < 0 ? RED : INK, valign: "middle" });
      });
      if (neg) slide.addShape(pptx.ShapeType.line, { x: zero, y: top, w: 0, h: items.length * 0.95, line: { color: GREY, width: 1 } });
    };
    if (s.kind === "progress") {
      const low = Math.min(...rounds.map((r) => r.data.cap), 0);
      bars(rounds.slice(-5).map((r) => ({ label: r.label.length > 24 ? r.label.slice(0, 23) + "…" : r.label, v: r.data.cap * 1e6, color: r.data.cap === low ? RED : GOLD })), 2.2);
      if (rounds.length < 2) slide.addText("Baseline set — every round from here is progress.", { x: X, y: 3.4, w: W, h: 0.5, fontFace: FONT, fontSize: 14, color: GREY, align: "center" });
    }
    if (s.kind === "results")
      bars([
        { label: "Revenue", v: y.revenue + y.oneTime, color: HUE.H1 },
        { label: "EBITDA", v: y.ebitda, color: HUE.H2 },
        { label: "Net profit", v: y.net, color: HUE.H3 },
        { label: "Cash", v: y.cash, color: GOLD },
      ], 2.2);
    if ((s.kind as string) === "infusion" && inf) {
      // Market cap with the infusion each year, then the final year without it, for contrast.
      const rows = inf.result.rows.slice(-4), last = rows[rows.length - 1];
      bars([...rows.map((r) => ({ label: `Year ${r.year}`, v: r.with.mc.total * 1e6, color: GOLD })), { label: `Y${last.year} without`, v: last.without.mc.total * 1e6, color: "B8AFC9" }], 2.0);
    }
    if (s.kind === "turnaround") {
      const yrs = Array.from({ length: Math.max(3, st.current_year + 1) }, (_, j) => j + 1);
      const cw = W / yrs.length;
      slide.addShape(pptx.ShapeType.line, { x: X + cw / 2, y: 2.45, w: W - cw, h: 0, line: { color: GOLD, width: 4 } });
      yrs.forEach((y, j) => {
        const yr = snap.years[y - 1], ahead = y > st.current_year, cx = X + j * cw;
        const col = ahead ? "4338CA" : yr && yr.cap < 0 ? RED : "15803D";
        slide.addShape(pptx.ShapeType.ellipse, { x: cx + cw / 2 - 0.35, y: 2.1, w: 0.7, h: 0.7, fill: { color: col }, line: { color: col } });
        slide.addText(`Y${y}`, { x: cx + cw / 2 - 0.35, y: 2.1, w: 0.7, h: 0.7, fontFace: FONT, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        const snaps = rounds.filter((r) => r.year === y).map((r) => r.label).join(" · ");
        slide.addText([
          { text: `${y === 1 ? "THE LOW POINT" : ahead ? "ENTERING NOW" : "THE RECOVERY"}\n`, options: { fontSize: 9, bold: true, color: GREY } },
          { text: ahead ? "The dragon sheds\n" : `${money((yr?.cap ?? 0) * 1e6)}\n`, options: { fontSize: 18, bold: true, color: col } },
          ...(ahead ? [] : [{ text: `net profit ${money(yr?.net ?? 0)}\n`, options: { fontSize: 11, color: INK } }]),
          ...(snaps ? [{ text: snaps, options: { fontSize: 9, color: GREY } }] : []),
        ], { x: cx, y: 2.95, w: cw - 0.1, h: 2.4, fontFace: FONT, align: "center", valign: "top" });
      });
    }
    if ((s.kind as string) === "why_price" && why) {
      const b = why.bridge, target = (out.bridge?.targetB ?? 60) * 1e9, max = Math.max(target, b.total) * 1.05;
      const colors = [HUE.H1, HUE.H2, HUE.H3, "7C6AA8", GOLD];
      let x0 = X;
      b.parts.forEach((p, j) => {
        const w = (Math.max(0, p.v) / max) * W;
        if (w > 0.01) slide.addShape(pptx.ShapeType.rect, { x: x0, y: 2.1, w, h: 0.6, fill: { color: colors[j] }, line: { color: colors[j] } });
        x0 += w;
        slide.addText([{ text: `${p.k}\n`, options: { fontSize: 10, color: GREY, bold: true } }, { text: money(p.v), options: { fontSize: 16, bold: true, color: INK } }, { text: `\n${p.how}`, options: { fontSize: 9, color: GREY } }],
          { x: X + (j % 2) * (W / 2), y: 3.0 + Math.floor(j / 2) * 1.0, w: W / 2 - 0.1, h: 0.95, fontFace: FONT, valign: "top" });
      });
      if (b.gap > 0) slide.addShape(pptx.ShapeType.rect, { x: x0, y: 2.1, w: (b.gap / max) * W, h: 0.6, fill: { color: "F6D5D7" }, line: { color: RED, dashType: "dash" } });
      slide.addShape(pptx.ShapeType.line, { x: X + (target / max) * W, y: 1.95, w: 0, h: 0.9, line: { color: INK, width: 2 } });
      slide.addText(`$${(target / 1e9).toFixed(0)}B`, { x: X + (target / max) * W - 0.5, y: 1.65, w: 1, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: INK, align: "center" });
    }
    if (s.kind === "earnings") {
      bars(ol.rows.map((r) => ({ label: `Year ${r.year}${r.year === st.current_year ? "" : "*"}`, v: r.net, color: HUE.H2 })), 2.0);
      const top = 2.0 + ol.rows.length * 0.95 + 0.1;
      slide.addText(`EPS   ${ol.rows.map((r) => ps(r.eps)).join("   ·   ")}\nPrice   ${ol.rows.map((r) => ps(r.price)).join("   ·   ")}\nDPS   ${ol.rows.map((r) => ps(r.dps)).join("   ·   ")}`, { x: X, y: top, w: W, h: 0.8, fontFace: FONT, fontSize: 14, color: INK, bold: true, align: "center" });
      slide.addText("Net profit by year · * team assumptions, not forecasts", { x: X, y: top + 0.8, w: W, h: 0.35, fontFace: FONT, fontSize: 10, color: GREY, align: "center" });
    }
    if (s.kind === "acquisition") {
      const r = ol.rows[ol.rows.length - 1], roi = ol.roi;
      const m = (n: number) => money(n);
      const steps = [["Revenue", m(r.revenue)], ["EBITDA", m(r.ebitda)], ["Net profit", m(r.net)], ["EPS", ps(r.eps)], [`Share price (x${out.pe} P/E)`, ps(r.price)],
        ...(roi ? [["Dividends received", ps(roi.dividends)], ["Return", `${roi.multiple.toFixed(1)}x (${roi.annualPct.toFixed(0)}%/yr)`]] : [])];
      steps.forEach(([k2, v], j) => {
        const cx = X + (j % 2) * (W / 2), cy = 2.0 + Math.floor(j / 2) * 1.05, last = roi && j === steps.length - 1;
        slide.addShape(pptx.ShapeType.roundRect, { x: cx, y: cy, w: W / 2 - 0.15, h: 0.9, fill: { color: last ? GOLD : "F6F2FA" }, line: { color: last ? GOLD : "E4DDEE" }, rectRadius: 0.08 });
        slide.addText([{ text: `${j + 1} · ${k2.toUpperCase()}\n`, options: { fontSize: 9, color: GREY, bold: true } }, { text: v, options: { fontSize: 20, bold: true, color: v.startsWith("-") ? RED : INK } }],
          { x: cx + 0.1, y: cy, w: W / 2 - 0.35, h: 0.9, fontFace: FONT, valign: "middle" });
      });
    }
    if (s.kind === "market_cap") {
      bars([
        { label: "Cash × 100", v: mc.cashTerm * 1e6, color: GOLD },
        { label: "Business models", v: mc.portfolio * 1e6, color: HUE.H2 },
        { label: "Analyst ratings", v: mc.analysts * 1e6, color: HUE.H3 },
        { label: "Market cap", v: mc.total * 1e6, color: HUE.H1 },
      ], 2.2);
      slide.addText(`${units.core} Core · ${units.growth} Growth · ${units.explore} Explore  |  ${ANALYST_NAMES.map((n, j) => (analysts[j] ? `${analysts[j]} ${n}` : "")).filter(Boolean).join(", ") || "no ratings"}`,
        { x: X, y: 6.1, w: W, h: 0.5, fontFace: FONT, fontSize: 12, color: GREY, align: "center" });
    }
    if (s.kind === "roadmap" && docRow?.content.roadmap?.length) {
      const rm = docRow.content.roadmap;
      slide.addShape(pptx.ShapeType.line, { x: X + 0.6, y: 2.55, w: W - 1.2, h: 0, line: { color: "CFC5DE", width: 3 } });
      rm.forEach((r, j) => {
        const cx = X + 0.25 + j * (W / 3);
        slide.addShape(pptx.ShapeType.ellipse, { x: cx + 0.45, y: 2.2, w: 0.7, h: 0.7, fill: { color: HUE[r.horizon] }, line: { color: HUE[r.horizon] } });
        slide.addText(r.horizon, { x: cx + 0.45, y: 2.2, w: 0.7, h: 0.7, fontFace: FONT, fontSize: 14, color: "FFFFFF", bold: true, align: "center", valign: "middle" });
        slide.addText([{ text: r.when + "\n", options: { color: HUE[r.horizon], bold: true, fontSize: 11 } }, { text: r.name + "\n", options: { color: INK, bold: true, fontSize: 14 } }, { text: r.goal, options: { color: GREY, fontSize: 11 } }],
          { x: cx, y: 3.05, w: W / 3 - 0.1, h: 3.3, fontFace: FONT, align: "center", valign: "top" });
      });
    }
    if (s.kind === "ask") {
      const now = mc.total, pct = Math.max(0.01, Math.min(1, now / 50000));
      slide.addText([{ text: `Today ${money(now * 1e6)}`, options: { color: now < 0 ? RED : INK, bold: true } }, { text: "   →   Goal $50B", options: { color: "8A6414", bold: true } }], { x: X, y: 2.4, w: W, h: 0.6, fontFace: FONT, fontSize: 20 });
      slide.addShape(pptx.ShapeType.roundRect, { x: X, y: 3.2, w: W, h: 0.45, fill: { color: "E4DDEE" }, line: { color: "E4DDEE" }, rectRadius: 0.2 });
      slide.addShape(pptx.ShapeType.roundRect, { x: X, y: 3.2, w: Math.max(0.12, W * pct), h: 0.45, fill: { color: GOLD }, line: { color: GOLD }, rectRadius: 0.2 });
      slide.addText("$50B = $50 a share at 1BN shares", { x: X, y: 3.8, w: W, h: 0.4, fontFace: FONT, fontSize: 12, color: GREY });
    }
    slide.addText(`Flying Dragon · ${DECK_EVENT}`, { x: 0.6, y: 7.0, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY });
    slide.addText(`Presenter: ${who(s.speaker)}   ${k + 1}`, { x: 6.7, y: 7.0, w: 6, h: 0.3, fontFace: FONT, fontSize: 9, color: GREY, align: "right" });
  });

  // Appendix: how we use the Mgt Tool (screenshots; not part of the 3-minute talk).
  TOOL_SLIDES.forEach((t, j) => {
    const slide = pptx.addSlide();
    const k = all.length + j + 1;
    slide.addNotes("Appendix: not part of the 3:00. Show if asked how we run the company.");
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: GOLD }, line: { color: GOLD } });
    slide.addText("APPENDIX · HOW WE USE THE MGT TOOL", { x: 0.65, y: 0.34, w: 7.9, h: 0.26, fontFace: FONT, fontSize: 11, color: "8A6414", bold: true, charSpacing: 2 });
    slide.addText(t.headline, { x: 0.65, y: 0.68, w: 12, h: 0.48, fontFace: FONT, fontSize: 24, color: INK, bold: true });
    slide.addText(t.lede, { x: t.ledeBox[0], y: t.ledeBox[1], w: t.ledeBox[2], h: t.ledeBox[3], fontFace: FONT, fontSize: 12, color: GREY });
    // Images and captions where the team placed them by hand (lib/tool-slides.ts).
    t.shots.forEach((sh: ToolShot) => {
      const data = readFileSync(path.join(process.cwd(), "public", sh.src)).toString("base64");
      const [x, y, w, h] = sh.box;
      slide.addImage({ data: `image/jpeg;base64,${data}`, x, y, w, h });
      if (sh.cap) slide.addText(sh.caption, { x: sh.cap[0], y: sh.cap[1], w: sh.cap[2], h: sh.cap[3], fontFace: FONT, fontSize: 10, color: GREY, align: "center" });
    });
    if (t.footerLeft) slide.addText(`Flying Dragon · ${DECK_EVENT}`, { x: 0.65, y: 7.03, w: 5.9, h: 0.23, fontFace: FONT, fontSize: 9, color: GREY });
    slide.addText(`Appendix   ${k}`, { x: 6.75, y: 7.03, w: 5.9, h: 0.23, fontFace: FONT, fontSize: 9, color: GREY, align: "right" });
  });

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const stamp = deckRow.created_at.toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="Flying-Dragon-Shareholder-Day-${stamp}.pptx"`,
    },
  });
}
