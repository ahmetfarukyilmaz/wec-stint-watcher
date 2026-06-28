// test/swissDriverTimes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSwissDriverTimes } from "../src/swissDriverTimes.js";

test("ilk gözlem süre eklemez, sonraki gözlemler biriktirir", () => {
  const t = createSwissDriverTimes();
  t.update(91, "A", 1000);          // referans
  t.update(91, "A", 4000);          // +3s A
  assert.equal(Math.round(t.get(91)["A"]), 3);
});

test("sürücü değişince yeni sürücüye geçer", () => {
  const t = createSwissDriverTimes();
  t.update(91, "A", 0);
  t.update(91, "A", 10000);         // +10s A
  t.update(91, "B", 12000);         // değişim anı: 0..2s'lik dilim A'ya mı B'ye mi? referans=12000, B başlar
  t.update(91, "B", 15000);         // +3s B
  assert.equal(Math.round(t.get(91)["A"]), 10);
  assert.equal(Math.round(t.get(91)["B"]), 3);
});

test("birden çok araç bağımsız izlenir; all() hepsini verir", () => {
  const t = createSwissDriverTimes();
  t.update(1, "X", 0); t.update(1, "X", 5000);
  t.update(2, "Y", 0); t.update(2, "Y", 2000);
  const all = t.all();
  assert.equal(Math.round(all[1]["X"]), 5);
  assert.equal(Math.round(all[2]["Y"]), 2);
});

test("null driverId güvenli (atla)", () => {
  const t = createSwissDriverTimes();
  t.update(1, null, 0);
  t.update(1, null, 5000);
  assert.deepEqual(t.get(1), {});
});
