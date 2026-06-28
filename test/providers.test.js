// test/providers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSwissProvider } from "../src/providers/swiss.js";

const timing = JSON.parse(readFileSync("fixtures/swiss_timing.json")).content.full;
const detail = JSON.parse(readFileSync("fixtures/swiss_comp_detail.json")).content.full;

test("swissProvider: arayüzü sağlar", () => {
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail }));
  const snap = { timing, detail };
  assert.equal(typeof p.fetchAll, "function");
  assert.ok(p.buildCars(snap).length > 0);
  const cars = p.buildCars(snap);
  assert.ok(p.adapt(snap, [cars[0].pid]).size === 1);
  assert.ok(Array.isArray(p.raceLog(snap)));
});
