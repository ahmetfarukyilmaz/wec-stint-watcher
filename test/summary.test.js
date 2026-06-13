// test/summary.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStintSummary } from "../src/summary.js";
import { makeCarState } from "../src/model.js";

test("stint özeti pozisyon, pit sayısı ve best lap içerir", () => {
  const state = makeCarState({ participantId: 1, position: 12, classPosition: 3, bestLapMs: 205000, pitCount: 4, gapAheadMs: 8000, currentDriver: "GÜVEN" });
  const events = [{ type: "best_lap", participantId: 1, at: 100, payload: {} }, { type: "pit_in", participantId: 1, at: 200, payload: {} }];
  const sum = buildStintSummary(state, events, 1000);
  assert.equal(sum.type, "stint_summary");
  assert.equal(sum.participantId, 1);
  assert.equal(sum.classPosition, 3);
  assert.equal(sum.pitCount, 4);
  assert.equal(sum.bestLapMs, 205000);
  assert.equal(sum.currentDriver, "GÜVEN");
  assert.equal(sum.eventCount, 2);
  assert.equal(sum.at, 1000);
});
