// test/store.test.js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { createStore } from "../src/store.js";

const DIR = "data-test";
beforeEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true }); });

test("olay append edilir ve geri okunur", () => {
  const s = createStore(DIR);
  s.appendEvent({ type: "pit_in", participantId: 1, payload: {}, at: 10 });
  s.appendEvent({ type: "pit_out", participantId: 1, payload: {}, at: 20 });
  assert.equal(s.readEvents().length, 2);
});

test("state yazılır ve restart sonrası okunur", () => {
  const s1 = createStore(DIR);
  s1.saveState({ 1: { participantId: 1, classPosition: 3 } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadState()[1].classPosition, 3);
});

test("boş dizinde loadState boş obje döner", () => {
  assert.deepEqual(createStore(DIR).loadState(), {});
});

test("driverTimes yazılır ve restart sonrası okunur; yoksa boş obje", () => {
  assert.deepEqual(createStore(DIR).loadDriverTimes(), {});
  const s1 = createStore(DIR);
  s1.saveDriverTimes({ 91: { totals: { A: 120 }, curId: "A" } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadDriverTimes()[91].totals.A, 120);
});

test("stintState yazılır/okunur; yoksa boş obje", () => {
  assert.deepEqual(createStore(DIR).loadStintState(), {});
  const s1 = createStore(DIR);
  s1.saveStintState({ 1: { stintStartLap: 5, laps: [], lastLap: 7, lap: 7, pitCount: 0 } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadStintState()[1].stintStartLap, 5);
});
