// node lib/outlook.check.ts - earnings, EPS/price/DPS, buybacks, the sale and the investor's return add up.
import assert from "node:assert/strict";
import { defaultOutlook, outlook } from "./outlook.ts";

const base = { now: 1, vehicleRev: 100e6, vehicleCost: 60e6, exploreRev: 0, exploreCost: 0, costBase: 10e6, interest: 5e6, depreciation: 5e6, oneTime: 0, shares: 1e9 };
const o = defaultOutlook(1, 3);
const flat = outlook(base, o);
assert.equal(flat.rows.length, 3);
assert.equal(flat.rows[0].ebitda, 30e6); // 100 - 60 - 10
assert.equal(Math.round(flat.rows[0].net), Math.round(20e6 * 0.79)); // - interest - depreciation, 21% tax
assert.equal(flat.rows[0].price, flat.rows[0].eps * 15); // EPS x P/E (no cash pile before a sale)

// Buybacks lift EPS: same profit, fewer shares.
const bb = { ...o, buybackM: [0, 100, 0, 0, 0, 0, 0, 0, 0, 0] };
assert.ok(outlook(base, bb).rows[1].eps > flat.rows[1].eps);

// Sale at the end of Year 2 for $55B, repay $925M, 30% special dividend, 30% buyback.
const s = { ...o, saleYear: 2, salePriceB: 55, otherRevenue: [0, 0, 400, 0, 0, 0, 0, 0, 0, 0] };
const r = outlook(base, s);
const proceeds = 55e9 - 925e6;
assert.equal(r.rows[1].saleProceeds, proceeds);
assert.ok(r.rows[1].dps > (proceeds * 0.3) / 1e9 - 1e-9); // special dividend paid on the starting shares
assert.ok(r.rows[1].shares < 1e9 && r.rows[1].shares > 0.6e9); // buyback at ~proceeds per share retires ~30%
assert.equal(r.rows[2].company, "Terralink");
assert.equal(r.rows[2].vehicles, 0); // the vehicle business is gone
assert.equal(r.rows[2].interest, 0); // debt repaid
assert.ok(r.roi && r.roi.dividends > 16); // at least the special dividend
assert.ok(r.rows[2].cashPerShare > 25); // Terralink holds 40% of ~$54B on ~0.7BN shares
console.log("outlook ok");
