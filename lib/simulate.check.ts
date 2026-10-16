// node lib/simulate.check.ts - the simulator reproduces the workbook with no knobs, and each knob moves the right numbers.
import assert from "node:assert/strict";
import { emptyKnobs, infusion, simulate, type Base } from "./simulate.ts";

const z = () => Array(10).fill(0);
const b: Base = {
  now: 1, segRev: [z().map(() => 50e6), z(), z()], segCost: [z().map(() => 30e6), z(), z()], costBase: z().map(() => 10e6),
  interest: z(), net: z().map(() => 8e6), cash: z().map((_, i) => 5e6 + i * 8e6), units: [z().map(() => 2), z(), z()],
  analysts: [[0, ...z().slice(1)], [3, ...z().slice(1)], z(), [5, ...z().slice(1)], z()], shares: 1e9, debt: 25e6,
};
const none = simulate(b, emptyKnobs(3));
assert.equal(none.length, 3);
none.forEach((r) => assert.equal(r.uplift, 0)); // no knobs = the workbook
assert.equal(none[2].levers.analysts[3], 5); // ratings carry forward into empty future years
assert.equal(none[0].mc.total, 200 + 3000 - 5000); // 2 Core + 3 Buy + 5 Sell; negative base -> cash counts 0

const k = emptyKnobs(3);
k.newBMs.explore[1] = 1; // one Explore BM in Year 2
k.profile.explore = { revenue: 4, cost: 2, capex: 20 };
k.borrow[0] = 100; k.rate = 10; // $100M in Year 1 at 10%
const r = simulate(b, k);
assert.equal(r[0].uplift, 0); // borrowing alone: cash doesn't count while portfolio + analysts < 0
assert.equal(r[1].levers.explore, 1);
assert.equal(r[1].drivers.portfolio, 1000);
// Year 2 cash: +100M borrowed, +(4-2-10 interest)*0.79 profit delta, -20 capex
assert.equal(Math.round((r[1].cash - b.cash[1]) / 1e5) / 10, Math.round((100 + (4 - 2 - 10) * 0.79 - 20) * 10) / 10);
assert.equal(r[1].debt, 125e6);
k.analystMoves[0] = [0, 2, 0, -2, 0]; // turn 2 Sells into Buys in Year 1
assert.equal(simulate(b, k)[0].drivers.analysts, 4000);
console.log("simulate ok");

// Exit: sell Core in Year 2 for $50B, 2% fees, repay $25M; Core BMs and revenue leave, cash arrives.
const x = emptyKnobs(3);
x.exit = { year: 2, priceB: 50, feesPct: 2, repayM: 25, costBaseKeptPct: 100, sell: { core: true, growth: false, explore: false } };
const e = simulate(b, x);
assert.equal(e[0].levers.core, 2); // before the sale
assert.equal(e[1].levers.core, 0); // sold
assert.equal(e[1].revenue, 0); // Core was all our revenue
assert.equal(e[1].debt, 0);
assert.ok(e[1].cash > 48e9 && e[1].cash < 49.1e9); // ~$49B in, less the lost Core profit and the repayment
assert.equal(e[1].mc.cashTerm, 0); // all that cash counts for nothing while BMs + analysts are negative
console.log("exit ok");

// Infusion: $100M at $1 in Year 1 funding a $50M Explore card -> 100M new shares, $50M left, +1 Explore BM.
const inf = infusion(b, { amountM: 100, price: 1, year: 1, toYear: 3, cardIds: [9] }, [{ id: 9, title: "4D", type: "Explore", capex: 50e6, start_year: 1, revenue: Array(10).fill(10e6), cost: Array(10).fill(2e6) }]);
assert.equal(inf.newShares, 100e6);
assert.equal(inf.leftover, 50e6);
assert.equal(inf.rows[0].with.levers.explore, inf.rows[0].without.levers.explore + 1);
assert.equal(inf.rows[0].with.shares, 1.1e9);
console.log("infusion ok");
