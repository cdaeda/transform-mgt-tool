// node lib/outlook.check.ts - earnings, EPS/price/DPS, buybacks, the sale and the investor's return add up.
import assert from "node:assert/strict";
import { bridge, defaultBridge, defaultOutlook, financingPlan, outlook } from "./outlook.ts";

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
// With the workbook's per-year projection, later years follow it (not this year's figure).
const wb = outlook({ ...base, vehicleRevY: [100e6, 150e6, 150e6, 0, 0, 0, 0, 0, 0, 0], vehicleCostY: [60e6, 60e6, 60e6, 0, 0, 0, 0, 0, 0, 0] }, o);
assert.equal(wb.rows[1].vehicles, 150e6);
assert.equal(Math.round(r.rows[2].valuation), Math.round(r.rows[2].earningsValue + r.rows[2].cashValue)); // value = earnings x P/E + cash
// Why $60B: parts add up, the premium sits on top, the gap is what's left to argue.
const bx = bridge({ vehicles: 100e6, vehicleCost: 40e6, nexus: 200e6 }, 20, { ...defaultBridge(15), nexusMultiple: 10, customers: 1e6, valuePerCustomer: 1000, networkB: 5, premiumPct: 20 });
assert.equal(bx.parts[0].v, 60e6 * 0.8 * 15); // vehicle earnings x P/E
assert.equal(bx.standalone, 720e6 + 2e9 + 1e9 + 5e9);
assert.equal(bx.total, bx.standalone * 1.2);
assert.equal(bx.gap, 60e9 - bx.total);
// Financing plan: strategies classified by instrument; ideas and rejected ones are left out.
const fp = financingPlan([
  { name: "Bond", status: "locked", year: 2, effect: { cash_m: 250, shares_m: 0, interest_m: 15 } },
  { name: "Gov equity", status: "pitching", year: 2, effect: { cash_m: 100, shares_m: 50, interest_m: 0 } },
  { name: "Prepaid", status: "pitching", year: 3, effect: { cash_m: 40, shares_m: 0, interest_m: 0 } },
  { name: "Idea", status: "idea", year: 2, effect: { cash_m: 999, shares_m: 0, interest_m: 0 } },
], { ...o, saleYear: 0, payout: 0 });
assert.equal(fp.totals["Bonds & loans"], 250);
assert.equal(fp.totals["Selling shares"], 100);
assert.equal(fp.totals["Partner & customer money"], 40);
assert.equal(fp.lines.length, 3);
// Space and fintech: separate lines, and the launch capital split by spaceSharePct.
const sf = outlook(base, { ...s, otherRevenue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], fintechRevenue: [0, 0, 200, 0, 0, 0, 0, 0, 0, 0], spaceSharePct: 75 });
assert.equal(sf.rows[2].fintech, 200e6);
assert.equal(Math.round(sf.rows[1].launchSpace / (sf.rows[1].launchSpace + sf.rows[1].launchFintech) * 100), 75);
const fps = financingPlan([], { ...o, saleYear: 2 });
assert.equal(Math.round(fps.totals["Investing in space & fintech"]), Math.round((55000 - 925) * 0.4));
console.log("outlook ok");
