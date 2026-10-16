// The horizon tuner: one dial from Defend (0) to Transform (100) sets the target investment mix.
// Defend = 80/15/5, the classic 70/20/10 sits near 20, Transform = 30/35/35.
// ponytail: linear curve between two presets; make the endpoints editable if the team wants its own.
export function mixFor(knob: number) {
  const t = Math.min(100, Math.max(0, knob)) / 100;
  const h1 = 80 - 50 * t, h2 = 15 + 20 * t;
  return { h1: Math.round(h1), h2: Math.round(h2), h3: 100 - Math.round(h1) - Math.round(h2) };
}

export const knobLabel = (knob: number) =>
  knob < 20 ? "Defend" : knob < 40 ? "Balanced core" : knob < 60 ? "Balanced" : knob < 80 ? "Lean in" : "Transform";
