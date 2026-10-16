// Run: node lib/capital.check.ts
import assert from "node:assert";
import { project, requiredPath, type Strat } from "./capital.ts";

const today = { core: 2, growth: 1, explore: 1, analysts: [0, 3, 0, 5, 0], cash: 0, shares: 1e9, year: 1 };
const fx = (o: Partial<Strat["effect"]>) => ({ cash_m: 0, core: 0, growth: 0, explore: 0, analysts: [0, 0, 0, 0, 0], shares_m: 0, interest_m: 0, ...o });
const strats: Strat[] = [
  { id: 1, name: "Clear Sells", status: "locked", year: 2, scale: 1, effect: fx({ analysts: [0, 5, 0, -5, 0] }) },
  { id: 2, name: "Explore wave", status: "locked", year: 3, scale: 2, effect: fx({ explore: 5, cash_m: 125 }) },
  { id: 3, name: "Still pitching", status: "pitching", year: 2, scale: 1, effect: fx({ explore: 100 }) },
];
const p = project(today, strats, 3);
assert.equal(p[0].total, -300, "Y1 is today");
assert.equal(p[1].analysts, 8000, "Y2: 8 Buy");
assert.equal(p[1].total, 1700 + 8000, "Y2: no cash counted yet");
assert.equal(p[2].portfolio, 1700 + 10 * 1000, "Y3: +10 Explore from scale 2");
assert.equal(p[2].total, 11700 + 8000 + Math.min(25000, 19700), "Y3: cash 250M x100 capped at base");
assert.equal(project(today, strats, 3, (s) => s.status !== "rejected")[1].levers.explore, 101, "including pitching changes the plan");
const r = requiredPath(-300, 1, 3);
assert.deepEqual(r.map((x) => x.cap), [-300, 24850, 50000]);
console.log("capital ok");
