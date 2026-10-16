"use client";

import { useRef, useState } from "react";
import { knobLabel, mixFor } from "@/lib/knob";

type Mix = { h1: number; h2: number; h3: number };
const HUES = { h1: "var(--core)", h2: "var(--growth)", h3: "var(--explore)" } as const;
const NAMES = { h1: "H1 Build the vehicles", h2: "H2 Dragon Nexus", h3: "H3 Intelligence network" } as const;

// 270° sweep: knob 0 sits at -135°, 100 at +135° (0° = straight up).
const angle = (k: number) => -135 + (k / 100) * 270;
const polar = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
};
const arc = (from: number, to: number, r: number) => {
  const [x1, y1] = polar(from, r), [x2, y2] = polar(to, r);
  return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

function MixBar({ label, mix, money }: { label: string; mix: Mix; money?: Mix }) {
  return (
    <div>
      <div className="eyebrow text-zinc-500 mb-1">{label}</div>
      <div className="flex h-7 gap-[2px] rounded-md overflow-hidden" role="img"
        aria-label={`${label}: H1 ${mix.h1}%, H2 ${mix.h2}%, H3 ${mix.h3}%`}>
        {(["h1", "h2", "h3"] as const).map((k) => mix[k] > 0 && (
          <div key={k} className="flex items-center justify-center text-xs font-semibold text-white min-w-0" style={{ width: `${mix[k]}%`, background: HUES[k] }}
            title={`${NAMES[k]}: ${mix[k]}%${money ? ` · $${(money[k] / 1e6).toFixed(1)}M` : ""}`}>
            {mix[k] >= 9 && `${mix[k]}%`}
          </div>
        ))}
        {mix.h1 + mix.h2 + mix.h3 === 0 && <div className="flex-1 bg-zinc-200 dark:bg-zinc-800 text-xs flex items-center justify-center text-zinc-500">no spend yet</div>}
      </div>
    </div>
  );
}

// Turning the knob is a live preview; nothing changes for the team until "Set as our strategy mix".
export function HorizonKnob({ value, target, actual, editable, onCommit, onTune }: {
  value: number; target: Mix; actual?: { pct: Mix; spend: Mix; total: number };
  editable?: boolean; onCommit?: (knob: number, mix: Mix) => Promise<unknown> | void; onTune?: () => void;
}) {
  const [k, setK] = useState(value);
  const [mix, setMix] = useState<Mix>(target);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const dirty = k !== value || mix.h1 !== target.h1 || mix.h2 !== target.h2 || mix.h3 !== target.h3;
  const valid = mix.h1 + mix.h2 + mix.h3 === 100;

  const commit = (nk: number, nm: Mix) => (setK(nk), setMix(nm), setSaved(false));
  const turnTo = (nk: number) => commit(Math.round(Math.min(100, Math.max(0, nk))), mixFor(nk));
  const instantiate = async () => {
    setSaving(true);
    await onCommit?.(k, mix);
    setSaving(false);
    setSaved(true);
  };
  // Live: how much money would have to move between horizons to hit this mix.
  const shift = actual && actual.total > 0
    ? (["h1", "h2", "h3"] as const).map((h) => ({ h, d: (actual.total * mix[h]) / 100 - actual.spend[h] })).filter((x) => Math.abs(x.d) >= 50_000)
    : [];

  const drag = (e: React.PointerEvent) => {
    if (!editable || !svg.current || (e.type === "pointermove" && e.buttons !== 1)) return;
    const b = svg.current.getBoundingClientRect();
    const deg = (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI + 90;
    const d = deg > 180 ? deg - 360 : deg;
    turnTo(((Math.min(135, Math.max(-135, d)) + 135) / 270) * 100);
  };

  const [nx, ny] = polar(angle(k), 62);
  const drift = actual && actual.total > 0 ? Math.abs(actual.pct.h1 - mix.h1) + Math.abs(actual.pct.h2 - mix.h2) + Math.abs(actual.pct.h3 - mix.h3) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-[13rem_1fr] items-center">
      <div className="relative mx-auto w-52">
        <svg ref={svg} viewBox="0 0 200 200" className={`w-full ${editable ? "cursor-grab active:cursor-grabbing touch-none" : ""}`}
          onPointerDown={drag} onPointerMove={drag} aria-hidden="true">
          <defs>
            <linearGradient id="knob-sweep" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--core)" /><stop offset="50%" stopColor="var(--growth)" /><stop offset="100%" stopColor="var(--explore)" />
            </linearGradient>
          </defs>
          {Array.from({ length: 11 }, (_, i) => {
            const [a, b] = polar(angle(i * 10), 92), [c, d] = polar(angle(i * 10), i % 5 ? 86 : 82);
            return <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="currentColor" className="text-zinc-400" strokeWidth={i % 5 ? 1 : 2} />;
          })}
          <path d={arc(-135, 135, 76)} fill="none" stroke="url(#knob-sweep)" strokeWidth="10" strokeLinecap="round" opacity="0.25" />
          <path d={arc(-135, Math.max(-134.9, angle(k)), 76)} fill="none" stroke="url(#knob-sweep)" strokeWidth="10" strokeLinecap="round" />
          <circle cx="100" cy="100" r="54" fill="var(--surface)" stroke="var(--frame)" strokeWidth="1" />
          <circle cx="100" cy="100" r="47" fill="none" stroke="var(--frame)" strokeOpacity="0.25" strokeDasharray="1 3" />
          <line x1="100" y1="100" x2={nx} y2={ny} stroke="var(--gold)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill="var(--gold)" />
          <text x="22" y="178" className="fill-zinc-500" fontSize="10" fontFamily="var(--font-display-face)" letterSpacing="1">DEFEND</text>
          <text x="140" y="178" className="fill-zinc-500" fontSize="10" fontFamily="var(--font-display-face)" letterSpacing="1">TRANSFORM</text>
        </svg>
        <div className="text-center -mt-2 font-display uppercase tracking-wider text-sm" aria-live="polite">{knobLabel(k)} · <span className="tabular-nums">{k}</span></div>
        {editable && (
          <input type="range" min={0} max={100} value={k} onChange={(e) => turnTo(Number(e.target.value))}
            aria-label="Horizon tuner: Defend to Transform" aria-valuetext={`${knobLabel(k)}: H1 ${mix.h1}%, H2 ${mix.h2}%, H3 ${mix.h3}%`}
            className="w-full accent-amber-500 mt-1" />
        )}
      </div>

      <div className="space-y-3 min-w-0">
        <MixBar label={dirty ? "Target mix · preview (not saved)" : "Target investment mix"} mix={mix} />
        {actual && <MixBar label={`Actual this year · $${(actual.total / 1e6).toFixed(1)}M spend`} mix={actual.pct} money={actual.spend} />}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(["h1", "h2", "h3"] as const).map((h) => (
            <span key={h} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: HUES[h] }} />{NAMES[h]}</span>
          ))}
        </div>
        {drift !== null && (
          <p className="text-sm">
            {drift <= 10 ? "✓ Spend matches the target mix." : `! Spend is ${drift / 2}% off the target mix — ${actual!.pct.h1 > mix.h1 ? "over-invested in H1" : "under-invested in H1"}.`}
          </p>
        )}
        {editable && (
          <fieldset className="flex flex-wrap gap-3 items-center text-sm">
            <legend className="eyebrow text-zinc-500 mb-1">Fine-tune (must total 100%)</legend>
            {(["h1", "h2", "h3"] as const).map((h) => (
              <label key={h} className="flex items-center gap-1">{h.toUpperCase()}
                <input type="number" min={0} max={100} value={mix[h]} aria-label={`${NAMES[h]} percent`}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    commit(k, { ...mix, [h]: v });
                  }}
                  className="w-16 rounded-md border border-zinc-300 dark:border-zinc-700 p-1 text-right" />%
              </label>
            ))}
            {mix.h1 + mix.h2 + mix.h3 !== 100 && <span className="text-red-600">Totals {mix.h1 + mix.h2 + mix.h3}% — adjust to 100%</span>}
          </fieldset>
        )}
        {shift.length > 0 && (
          <p className="text-sm">
            <span className="eyebrow text-zinc-500">To hit this mix this year: </span>
            {shift.map(({ h, d }) => `${d > 0 ? "+" : "−"}$${(Math.abs(d) / 1e6).toFixed(1)}M ${h.toUpperCase()}`).join(" · ")}
          </p>
        )}
        {editable && (dirty || saved) && (
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <>
                <button onClick={instantiate} disabled={!valid || saving}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm bg-green-700 text-white disabled:opacity-50">
                  {saving ? "Saving…" : "✓ Set as our strategy mix"}
                </button>
                <button onClick={() => commit(value, target)} className="rounded-md px-3 py-1.5 text-sm border border-zinc-400">Revert</button>
                <span className="text-xs text-zinc-500">Preview only until you set it. Card evaluations, the financing chat and the critic use the saved mix.</span>
              </>
            )}
            {!dirty && saved && <span className="text-sm text-green-700 dark:text-green-400">✓ This is now our strategy mix.</span>}
          </div>
        )}
        {onTune && <button onClick={onTune} className="text-sm underline">More what-ifs in Finances →</button>}
      </div>
    </div>
  );
}
