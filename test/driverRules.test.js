// test/driverRules.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDriverRules } from "../src/driverRules.js";

const cfg = { maxTotalMin: 660, minTotalMin: 120, warnAtPct: 0.9, classOverrides: { Bronze: { Platinum: 480, Silver: 360 } } };

test("ok / warn / over eşikleri (genel 11s)", () => {
  const r = assessDriverRules([
    { id: "a", name: "A", cat: "Gold", seconds: 3600 },        // 1s → ok
    { id: "b", name: "B", cat: "Gold", seconds: 660 * 60 * 0.95 }, // %95 → warn
    { id: "c", name: "C", cat: "Gold", seconds: 660 * 60 + 1 },    // >11s → over
  ], "Gold", cfg);
  assert.equal(r[0].status, "ok");
  assert.equal(r[1].status, "warn");
  assert.equal(r[2].status, "over");
  assert.equal(r[0].maxSec, 660 * 60);
});

test("Bronze cup kategori override (Platinum 8s, Silver 6s)", () => {
  const r = assessDriverRules([
    { id: "p", name: "P", cat: "Platinum", seconds: 480 * 60 + 1 }, // >8s → over
    { id: "s", name: "S", cat: "Silver", seconds: 360 * 60 * 0.5 }, // %50 of 6s → ok
  ], "Bronze", cfg);
  assert.equal(r[0].maxSec, 480 * 60);
  assert.equal(r[0].status, "over");
  assert.equal(r[1].maxSec, 360 * 60);
  assert.equal(r[1].status, "ok");
});

test("eksik cfg güvenli varsayılan kullanır", () => {
  const r = assessDriverRules([{ id: "a", name: "A", cat: "Silver", seconds: 0 }], "Pro", undefined);
  assert.equal(r[0].maxSec, 660 * 60);
  assert.equal(r[0].status, "ok");
});

test("pctOfMax hesaplanır", () => {
  const r = assessDriverRules([{ id: "a", name: "A", cat: "Gold", seconds: 330 * 60 }], "Gold", cfg);
  assert.ok(Math.abs(r[0].pctOfMax - 0.5) < 1e-9);
});
