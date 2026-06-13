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
