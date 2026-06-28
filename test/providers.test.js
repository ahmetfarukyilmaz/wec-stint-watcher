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

test("swissProvider.raceLog: Messages'ı RCMessage olaylarına map'ler", () => {
  const detailMsgs = JSON.parse(readFileSync("fixtures/swiss_comp_detail_msgs.json")).content.full;
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail: detailMsgs }));
  const items = p.raceLog({ timing, detail: detailMsgs });
  assert.ok(items.length >= 1, "en az bir mesaj");
  for (const it of items) {
    assert.equal(it.type, "RCMessage");
    assert.equal(typeof it.raceLogItemId, "string");
    assert.equal(typeof it.text, "string");
  }
  // dedup için id benzersiz olmalı
  const ids = new Set(items.map((x) => x.raceLogItemId));
  assert.equal(ids.size, items.length);
});
