// Run: node lib/impact.check.ts
import assert from "node:assert";
import { freeRow, impact, unitsCol } from "./impact.ts";

const ten = (v: number, from = 1) => Array.from({ length: 10 }, (_, i) => (i + 1 >= from ? v : 0));
const rows = impact([{ type: "Growth", capex: 12e6, start_year: 3, revenue: ten(5e6, 3), cost: ten(5e5, 3) }]);
assert.equal(rows[1].bmMcap, 0);
assert.equal(rows[2].bmMcap, 500);
assert.equal(rows[2].profit, 4.5e6);
assert.equal(Math.round(rows[2].cash), Math.round(4.5e6 * 0.79 - 12e6));
assert.equal(unitsCol(1), "D");
assert.equal(unitsCol(3), "J");
assert.equal(unitsCol(10), "AE");
assert.equal(freeRow(71, [["(Core) Legacy", "$44,000,000"], ["(Growth) BM 2", "0"], ["(Growth) BM 3"]]), 72);
assert.equal(freeRow(71, [["Hydrogen", "5"]]), null);
console.log("impact ok");
