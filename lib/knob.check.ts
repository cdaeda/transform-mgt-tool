// Run: node lib/knob.check.ts
import assert from "node:assert";
import { mixFor } from "./knob.ts";

assert.deepEqual(mixFor(0), { h1: 80, h2: 15, h3: 5 });
assert.deepEqual(mixFor(100), { h1: 30, h2: 35, h3: 35 });
assert.deepEqual(mixFor(20), { h1: 70, h2: 19, h3: 11 });
for (let k = 0; k <= 100; k += 7) { const m = mixFor(k); assert.equal(m.h1 + m.h2 + m.h3, 100); }
assert.deepEqual(mixFor(140), mixFor(100));
console.log("knob ok");
