"use client";

// Blog-style figures for the strategy write-up: one idea each, theme-aware, captioned.
const C = { H1: "var(--core)", H2: "var(--growth)", H3: "var(--explore)", gold: "var(--gold)" };

function Figure({ n, caption, children }: { n: number; caption: string; children: React.ReactNode }) {
  return (
    <figure className="my-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6">
      {children}
      <figcaption className="mt-3 text-sm text-zinc-600 dark:text-zinc-400"><span className="eyebrow text-amber-700 dark:text-amber-300 mr-2">Figure {n}</span>{caption}</figcaption>
    </figure>
  );
}

const label = "fill-zinc-800 dark:fill-zinc-100";
const muted = "fill-zinc-500 dark:fill-zinc-400";

// 1. The data flywheel: four steps around a loop, arrows on the circle.
export function Flywheel() {
  const steps = [
    { t: "Our cars, fuel network", s: "& factory software", c: C.H1 },
    { t: "Driving data", s: "+ satellite feeds", c: C.H2 },
    { t: "A smarter", s: "Dragon Drive", c: C.gold },
    { t: "More licensees", s: "& partners", c: C.H3 },
  ];
  const R = 120, cx = 260, cy = 165;
  const pos = (i: number) => { const a = (-90 + i * 90) * (Math.PI / 180); return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  return (
    <Figure n={1} caption="The Dragon Drive data flywheel: every kilometre driven makes the system better, which wins more partners, who feed it more data.">
      <svg viewBox="0 0 520 330" className="w-full max-w-xl mx-auto" role="img" aria-label="Flywheel: cars and fuel network produce driving data, which makes Dragon Drive smarter, which wins more licensees and partners, who add more data">
        <defs><marker id="fw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--color-zinc-400)" /></marker></defs>
        {steps.map((_, i) => {
          const a0 = (-90 + i * 90 + 22) * (Math.PI / 180), a1 = (-90 + (i + 1) * 90 - 22) * (Math.PI / 180);
          return <path key={i} d={`M${cx + R * Math.cos(a0)},${cy + R * Math.sin(a0)} A${R},${R} 0 0 1 ${cx + R * Math.cos(a1)},${cy + R * Math.sin(a1)}`} fill="none" stroke="var(--color-zinc-400)" strokeWidth="2" markerEnd="url(#fw-arrow)" />;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="15" className={label} fontFamily="var(--font-display-face)" letterSpacing="1">DATA</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="15" className={label} fontFamily="var(--font-display-face)" letterSpacing="1">FLYWHEEL</text>
        {steps.map((s, i) => {
          const [x, y] = pos(i);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="9" fill={s.c} />
              <text x={x + (i === 1 ? 16 : i === 3 ? -16 : 0)} y={y + (i === 0 ? -18 : i === 2 ? 30 : -4)} textAnchor={i === 1 ? "start" : i === 3 ? "end" : "middle"} fontSize="14" fontWeight="600" className={label}>{s.t}</text>
              <text x={x + (i === 1 ? 16 : i === 3 ? -16 : 0)} y={y + (i === 0 ? -2 : i === 2 ? 46 : 12)} textAnchor={i === 1 ? "start" : i === 3 ? "end" : "middle"} fontSize="12" className={muted}>{s.s}</text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}

// 2. Three horizons over the ten game years.
export function HorizonCurves({ when }: { when?: Record<string, string> }) {
  const W = 520, H = 260, x = (yr: number) => 50 + ((yr - 1) / 9) * (W - 80), y = (v: number) => H - 40 - v * (H - 80);
  const curve = (f: (t: number) => number) => Array.from({ length: 46 }, (_, i) => { const t = 1 + (i / 45) * 9; return `${i ? "L" : "M"}${x(t).toFixed(1)},${y(f(t)).toFixed(1)}`; }).join(" ");
  const s = (t: number, mid: number, k = 1.2) => 1 / (1 + Math.exp(-k * (t - mid)));
  const lines = [
    { id: "H1", name: "H1 · Maintain the legacy business", f: (t: number) => 0.55 * (1 - s(t, 7, 0.9)) + 0.12, c: C.H1, at: 2 },
    { id: "H2", name: "H2 · Satellite data products", f: (t: number) => 0.62 * s(t, 4.5), c: C.H2, at: 5.4 },
    { id: "H3", name: "H3 · Ecosystem network effect", f: (t: number) => 0.9 * s(t, 7.5, 1.1), c: C.H3, at: 8.9 },
  ];
  return (
    <Figure n={2} caption={`Three horizons: the legacy business funds today while satellite data and the partner ecosystem take over as the growth engines${when ? ` (${Object.entries(when).map(([k, v]) => `${k} ${v}`).join(" · ")})` : ""}. Illustrative shape, not a forecast.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl mx-auto" role="img" aria-label="Three S-curves: H1 declines slowly, H2 rises mid-period, H3 rises late and highest">
        <line x1={x(1)} x2={x(10)} y1={y(0)} y2={y(0)} stroke="var(--color-zinc-300)" />
        {[1, 4, 7, 10].map((t) => <text key={t} x={x(t)} y={y(0) + 18} textAnchor="middle" fontSize="11" className={muted}>Year {t}</text>)}
        <text x={x(1) - 8} y={y(0.95)} textAnchor="end" fontSize="11" className={muted}>value</text>
        {lines.map((l) => (
          <g key={l.id}>
            <path d={curve(l.f)} fill="none" stroke={l.c} strokeWidth="3" strokeLinecap="round" />
            <circle cx={x(l.at)} cy={y(l.f(l.at))} r="4" fill={l.c} />
            <text x={x(l.at) + (l.id === "H3" ? -8 : 8)} y={y(l.f(l.at)) - 10} textAnchor={l.id === "H3" ? "end" : "start"} fontSize="12" fontWeight="600" className={label}>{l.name}</text>
          </g>
        ))}
      </svg>
    </Figure>
  );
}

// 3. Who pays for which horizon.
export function FundingFlow() {
  const rows = [
    { from: "Operating cash from cars & legacy models", to: "H1 · Maintain", c: C.H1 },
    { from: "Data customers: fleets, cities, mobility services", to: "H2 · Satellite data", c: C.H2 },
    { from: "Partners: prepaid licences, pilots, co-investment", to: "H3 · Ecosystem", c: C.H3 },
  ];
  return (
    <Figure n={3} caption="How we pay for it: each horizon has its own funder, so the legacy business never has to carry the whole bet — and no new debt is secured on the lender's collateral.">
      <div className="space-y-3 max-w-2xl mx-auto">
        {rows.map((r) => (
          <div key={r.to} className="grid grid-cols-[1fr_auto_10rem] items-center gap-3">
            <span className="text-sm text-right">{r.from}</span>
            <svg viewBox="0 0 80 16" className="w-16 sm:w-20" aria-hidden><path d="M0 8 H70" stroke={r.c} strokeWidth="3" /><path d="M66 2 L78 8 L66 14 z" fill={r.c} /></svg>
            <span className="rounded-full px-3 py-1 text-sm font-semibold text-white text-center" style={{ background: r.c }}>{r.to}</span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

// 4. The valuation equation as the market sees it.
export function ValuationEquation() {
  const parts = [
    { n: "1", t: "Cash × 100", s: "counts up to 2 + 3", c: C.gold },
    { n: "2", t: "Business models", s: "Core 100M · Growth 500M · Explore 1B", c: C.H2 },
    { n: "3", t: "Analyst ratings", s: "Outperform +2.5B … Crash −2.5B", c: C.H3 },
  ];
  return (
    <Figure n={4} caption="How capital markets value us in the game: three parts, each mattering only up to a point. The fastest lever is turning Sell ratings into Buys; the most durable is a deeper business model portfolio.">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {parts.map((p, i) => (
          <div key={p.n} className="flex items-center gap-2 sm:gap-3">
            {i > 0 && <span className="font-display text-3xl text-zinc-400">+</span>}
            <div className="rounded-xl border-2 px-4 py-3 text-center min-w-36" style={{ borderColor: p.c }}>
              <span className="grid place-items-center w-7 h-7 mx-auto rounded-full text-white font-display text-sm" style={{ background: p.c }}>{p.n}</span>
              <p className="font-display uppercase tracking-wide mt-1">{p.t}</p>
              <p className="text-xs text-zinc-500">{p.s}</p>
            </div>
          </div>
        ))}
        <span className="font-display text-3xl text-zinc-400">=</span>
        <div className="rounded-xl bg-indigo-900 text-white px-4 py-3 text-center min-w-32"><p className="font-display uppercase tracking-wide">Market cap</p><p className="text-xs text-white/70">÷ shares = price</p></div>
      </div>
    </Figure>
  );
}
