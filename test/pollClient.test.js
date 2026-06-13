// test/pollClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPollClient } from "../src/pollClient.js";

const fakeApi = {
  async fetchAll() {
    return {
      ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
      gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    };
  },
};

test("pollOnce snapshot'ı adaptör'den geçirip yayar", async () => {
  const got = [];
  const pc = createPollClient({ trackedParticipants: [9], pollIntervalSeconds: 1 }, fakeApi);
  pc.onSnapshot((map) => got.push(map));
  await pc.pollOnce();
  assert.equal(got.length, 1);
  assert.equal(got[0].get(9).classPosition, 1);
});
