// node lib/booking.check.ts - analyst card moves land in the right year column and never go negative.
import assert from "node:assert/strict";
import { analystWrites } from "./booking.ts";

const cells: Record<string, number> = { D255: 5, D253: 3 };
const read = async (c: string) => ({ values: [[cells[c] ?? 0]] });
const write = async (c: string, v: (string | number | boolean | null)[][]) => void (cells[c] = Number(v[0][0]));
await analystWrites(1, 3, 1, read, write); // Year 1: Sell -> Buy
assert.deepEqual([cells.D255, cells.D253], [4, 4]);
assert.equal(await analystWrites(2, -1, 1, read, write), 253); // Year 2 new Buy goes in column G
assert.equal(cells.G253, 1);
await assert.rejects(analystWrites(1, 0, 1, read, write)); // no Outperform to move
console.log("booking ok");
