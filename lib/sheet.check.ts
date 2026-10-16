// Run: node lib/sheet.check.ts
import assert from "node:assert";
import { coerce, parseRange, planWrite, qualify } from "./cells.ts";

assert.equal(qualify("B53"), "'Team 1'!B53");
assert.deepEqual(parseRange("'Leaderboard 2026'!A6:N15"), { sheet: "Leaderboard 2026", c0: "A", r0: 6, c1: "N", r1: 15 });
assert.deepEqual(parseRange("D36"), { sheet: "Team 1", c0: "D", r0: 36, c1: "D", r1: 36 });
assert.equal(coerce("$1,200,000"), 1200000);
assert.equal(coerce("12%"), 0.12);
assert.equal(coerce("Yes"), "Yes");
assert.equal(coerce("  "), null);
planWrite("A1:B1", [[5, null]], [[1, "=SUM(A1)"]]);
assert.throws(() => planWrite("A1", [[5]], [["=B106"]]), /formula/);
assert.throws(() => planWrite("A1", [["=1+1"]], [[""]]), /not allowed/);
assert.throws(() => planWrite("'Team 2'!A1", [[1]], [[null]]), /limited/);
console.log("cell guard ok");
