// test/trackedStore.test.js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { createTrackedStore } from "../src/trackedStore.js";

const DIR = "data-tracked-test";
beforeEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true }); });

test("ilk açılışta initial pid'leri kullanır ve diske yazar", () => {
  const s = createTrackedStore(DIR, [400061]);
  assert.deepEqual(s.list(), [400061]);
  // ikinci örnek diskten okur
  const s2 = createTrackedStore(DIR, [999]);
  assert.deepEqual(s2.list(), [400061]); // disktekini korur, initial'i yok sayar
});

test("add/remove kalıcı", () => {
  const s = createTrackedStore(DIR, [1]);
  assert.equal(s.add(2), true);
  assert.equal(s.add(2), false); // zaten var
  assert.deepEqual(s.list(), [1, 2]);
  assert.equal(s.remove(1), true);
  const reopened = createTrackedStore(DIR, [99]);
  assert.deepEqual(reopened.list(), [2]);
});

test("has çalışır", () => {
  const s = createTrackedStore(DIR, [5]);
  assert.equal(s.has(5), true);
  assert.equal(s.has(6), false);
});
