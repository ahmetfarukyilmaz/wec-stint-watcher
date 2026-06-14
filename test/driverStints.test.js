// test/driverStints.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDriverStints } from "../src/driverStints.js";

const start = Date.parse("2026-06-13T14:00:00Z");
const h = (n) => new Date(start + n * 3600000).toISOString();

test("sürücü başına süre + mevcut sürücü", () => {
  // başlangıç sürücü "1"; 1.saatte 2'ye, 3.saatte 1'e döner; şimdi 4.saat
  const swaps = [
    { previousDriverId: "1", newDriverId: "2", ts: h(1) },
    { previousDriverId: "2", newDriverId: "1", ts: h(3) },
  ];
  const now = start + 4 * 3600000;
  const r = computeDriverStints(swaps, start, now);
  assert.equal(Math.round(r.byDriver["1"] / 3600), 2); // 0-1h + 3-4h = 2 saat
  assert.equal(Math.round(r.byDriver["2"] / 3600), 2); // 1-3h = 2 saat
  assert.equal(r.currentId, "1");
  assert.equal(r.segments.at(-1).current, true);
});

test("hiç swap yoksa tüm süre tek (bilinmeyen) sürücüde", () => {
  const r = computeDriverStints([], start, start + 3600000);
  assert.deepEqual(r.byDriver, {}); // başlangıç sürücüsü bilinmiyor (swap yok)
  assert.equal(r.currentId, null);
});

test("sıralanmamış girdi de doğru hesaplanır", () => {
  const swaps = [
    { previousDriverId: "2", newDriverId: "1", ts: h(3) },
    { previousDriverId: "1", newDriverId: "2", ts: h(1) },
  ];
  const r = computeDriverStints(swaps, start, start + 4 * 3600000);
  assert.equal(Math.round(r.byDriver["1"] / 3600), 2);
});
