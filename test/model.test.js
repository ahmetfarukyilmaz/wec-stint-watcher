// test/model.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCarState, makeEvent } from "../src/model.js";

test("makeCarState varsayılan alanları doldurur", () => {
  const s = makeCarState({ participantId: 400061, position: 5 });
  assert.equal(s.participantId, 400061);
  assert.equal(s.position, 5);
  assert.equal(s.inPit, false);
  assert.equal(s.pitCount, 0);
  assert.equal(s.classPosition, null);
});

test("makeEvent zaman damgası ve tip içerir", () => {
  const e = makeEvent("pit_in", 400061, { lap: 12 }, 1000);
  assert.equal(e.type, "pit_in");
  assert.equal(e.participantId, 400061);
  assert.equal(e.at, 1000);
  assert.deepEqual(e.payload, { lap: 12 });
});

test("makeCarState: yeni opsiyonel alanlar default null", () => {
  const cs = makeCarState({});
  assert.equal(cs.trackPositionPct, null);
  assert.equal(cs.manufacturer, null);
  assert.equal(cs.carType, null);
  assert.equal(cs.gapToFirstLaps, null);
});

test("makeCarState: yeni alanlar set edilebilir", () => {
  const cs = makeCarState({ trackPositionPct: 0.8, manufacturer: "Porsche", carType: "911 GT3 R", gapToFirstLaps: 2 });
  assert.equal(cs.trackPositionPct, 0.8);
  assert.equal(cs.manufacturer, "Porsche");
  assert.equal(cs.carType, "911 GT3 R");
  assert.equal(cs.gapToFirstLaps, 2);
});
