// test/pollClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPollClient } from "../src/pollClient.js";
import { createGriiipProvider } from "../src/providers/griiip.js";

const fakeApi = {
  async fetchAll() {
    return {
      ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
      gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    };
  },
  async fetchRaceLogFull() { return []; },
};

test("pollOnce snapshot'ı adaptör'den geçirip yayar", async () => {
  const got = [];
  const provider = createGriiipProvider({ trackedParticipants: [9], pollIntervalSeconds: 1 }, fakeApi);
  const pc = createPollClient({ trackedParticipants: [9], pollIntervalSeconds: 1 }, provider);
  pc.onSnapshot((map) => got.push(map));
  await pc.pollOnce();
  assert.equal(got.length, 1);
  assert.equal(got[0].get(9).classPosition, 1);
});

test("getCars sıralama için zenginleştirilmiş liste verir", async () => {
  const api = {
    async fetchAll() {
      return {
        ranks: [{ pid: 9, overallPosition: 5, position: 2, carNumber: "9", classId: "LMGT3" }],
        gaps: [{ pid: 9, gapToFirstMillis: 12000 }], laps: [], bestLaps: [], pitIn: [], pitOut: [],
        participants: [{ pid: 9, displayName: "TEAM X" }], flags: [],
      };
    },
    async fetchRaceLogFull() { return []; },
  };
  const provider = createGriiipProvider({}, api);
  const pc = createPollClient({ trackedParticipants: [], pollIntervalSeconds: 1 }, provider);
  await pc.pollOnce();
  const c = pc.getCars()[0];
  assert.equal(c.carNumber, "9");
  assert.equal(c.overall, 5);
  assert.equal(c.classPos, 2);
  assert.equal(c.gapToFirstMs, 12000);
  assert.equal(c.team, "TEAM X");
});
