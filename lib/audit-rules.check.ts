// Run: node lib/audit-rules.check.ts
import assert from "node:assert";
import { auditRules } from "./audit-rules.ts";

const blank = () => Array.from({ length: 15 }, () => [null, ...Array(10).fill(0)]);
const revenue = { Core: blank(), Growth: blank(), Explore: blank() };
const cost = { Core: blank(), Growth: blank(), Explore: blank() };
revenue.Core[0] = ["Legacy", 44000000, ...Array(9).fill(0)];
cost.Core[0] = ["Legacy", 600000, ...Array(9).fill(0)];
revenue.Growth[0] = ["Grey Cruise", 0, 5, ...Array(8).fill(0)]; // entered in millions by mistake
const units = [Array(28).fill(0), Array(28).fill(0), Array(28).fill(0)];
units[0][0] = 1; // Y1 Core = 1 active, matches
const summary = Array.from({ length: 10 }, (_, i) => [i + 1, i < 2 ? "Yes" : "No", ...Array(17).fill(0)]);

const f = auditRules({ revenue, cost, units, summary, debtInterest: 1250000 });
const has = (cell: string, re: RegExp) => f.some((x) => x.cell === cell && re.test(x.problem));
assert.ok(has("C71", /millions/), "magnitude");
assert.ok(has("C131", /no cost/), "revenue without cost");
assert.ok(has("G246", /Y2: 1 Growth/), "units mismatch");
assert.ok(!f.some((x) => x.cell === "D245"), "Y1 Core units match");
assert.ok(has("K34", /interest/) && has("K35", /interest/) && !has("K36", /interest/), "interest only for completed years");
console.log("audit rules ok");
