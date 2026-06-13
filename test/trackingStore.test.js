// test/trackingStore.test.js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { createTrackingStore } from "../src/trackingStore.js";

const DIR = "data-tracking-test";
beforeEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true }); });

const CARS = [
  { pid: 1, classId: "LMGT3", classPos: 1, overall: 30 },
  { pid: 2, classId: "LMGT3", classPos: 2, overall: 33 },
  { pid: 3, classId: "LMGT3", classPos: 3, overall: 35 },
  { pid: 9, classId: "LMGT3", classPos: 8, overall: 50 }, // pinli ama ilk-N dışı
  { pid: 100, classId: "HYPERCAR", classPos: 1, overall: 1 },
];

test("pin/unpin kalıcı, ilk açılışta initial pinli", () => {
  const s = createTrackingStore(DIR, [9]);
  assert.deepEqual(s.pinnedList(), [9]);
  s.pin(1); assert.equal(s.isPinned(1), true);
  s.unpin(9);
  const re = createTrackingStore(DIR, [999]);
  assert.deepEqual(re.pinnedList(), [1]); // disktekini korur
});

test("setSmart kalıcı", () => {
  const s = createTrackingStore(DIR, []);
  s.setSmart("LMGT3", 3);
  assert.deepEqual(createTrackingStore(DIR, []).getSmart(), { smartClass: "LMGT3", topN: 3 });
});

test("effective = pinli ∪ sınıf ilk-N", () => {
  const s = createTrackingStore(DIR, [9]); // 9 pinli (LMGT3 8.)
  s.setSmart("LMGT3", 3);
  const eff = s.effective(CARS).sort((a, b) => a - b);
  // LMGT3 ilk 3 = pid 1,2,3 ; pinli 9 da eklenir
  assert.deepEqual(eff, [1, 2, 3, 9]);
});

test("topN=0 ise sadece pinli", () => {
  const s = createTrackingStore(DIR, [9]);
  s.setSmart("LMGT3", 0);
  assert.deepEqual(s.effective(CARS), [9]);
});

test("genel (overall) kapsam: overall'a göre ilk-N", () => {
  const s = createTrackingStore(DIR, []);
  s.setSmart("__overall", 2);
  const eff = s.effective(CARS).sort((a, b) => a - b);
  assert.deepEqual(eff, [1, 100]); // overall 1 (pid100) ve 30 (pid1)
});
