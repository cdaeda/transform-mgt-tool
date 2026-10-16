// Run: node lib/marketcap.check.ts
import assert from "node:assert";
import { exploreNeeded, marketCap } from "./marketcap.ts";

// Team 1, Year 1 as in the workbook: 2 Core, 1 Growth, 1 Explore, 3 Buy, 5 Sell, no cash counted -> -300.
const today = { core: 2, growth: 1, explore: 1, analysts: [0, 3, 0, 5, 0], cash: 0 };
assert.equal(marketCap(today).total, -300);
assert.equal(marketCap({ ...today, cash: 5e6 }).cashTerm, 0, "cash adds nothing while portfolio + analysts < 0");
// Cash is capped at portfolio + analysts: 25B base + 250M cash = 50B.
assert.equal(marketCap({ core: 0, growth: 0, explore: 25, analysts: [0, 0, 0, 0, 0], cash: 250e6 }).total, 50_000);
assert.equal(marketCap({ core: 0, growth: 0, explore: 25, analysts: [0, 0, 0, 0, 0], cash: 900e6 }).total, 50_000);
const n = exploreNeeded(today);
assert.equal(marketCap({ ...today, explore: n, cash: 1e12 }).total >= 50_000, true);
assert.equal(marketCap({ ...today, explore: n - 1, cash: 1e12 }).total < 50_000, true);
console.log("marketcap ok", n);
