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
