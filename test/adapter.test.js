// test/adapter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptSnapshot } from "../src/adapter.js";

function loadFixtureSnapshot() {
  const j = (f) => JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));
  return {
    ranks: j("live_ranks.json"),
    gaps: j("live_gaps.json"),
    laps: j("live_laps.json"),
    bestLaps: j("live_best-laps.json"),
    pitIn: j("live_pit-in.json"),
    pitOut: j("live_pit-out.json"),
    participants: j("live_participants.json"),
    flags: j("live_race-flags.json"),
  };
}

test("adaptSnapshot takip edilen aracı (400061) CarState'e çevirir", () => {
  const map = adaptSnapshot(loadFixtureSnapshot(), [400061]);
  const car = map.get(400061);
  assert.ok(car, "400061 bulunmalı");
  assert.equal(car.participantId, 400061);
  assert.equal(car.carNumber, "91");
  assert.equal(car.classId, "LMGT3");
  assert.ok(typeof car.position === "number" || car.position === null);
  assert.ok(car.pitCount >= 1, "fixture'da en az 1 pit-in var");
  assert.ok(car.bestLapMs === null || car.bestLapMs > 0);
});

test("inPit: son pit-in ts'i son pit-out ts'inden büyükse true", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 3, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], participants: [], flags: [],
    pitIn: [{ pid: 9, ts: "2026-06-13T10:00:00+00:00" }],
    pitOut: [{ pid: 9, ts: "2026-06-13T09:00:00+00:00" }],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.inPit, true);
  assert.equal(car.pitCount, 1);
});

test("lastLapMs pid'in en yüksek lapNumber kaydından gelir", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    laps: [
      { pid: 9, lapNumber: 5, lapTimeMillis: 208000 },
      { pid: 9, lapNumber: 7, lapTimeMillis: 207000 },
      { pid: 9, lapNumber: 6, lapTimeMillis: 209000 },
    ],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.lastLapMs, 207000);
});

test("currentDriver currentDriverId -> drivers[].externalDriverID ile çözülür", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], flags: [],
    participants: [{ pid: 9, currentDriverId: "2", drivers: [
      { externalDriverID: "1", displayName: "A" },
      { externalDriverID: "2", displayName: "B" },
    ] }],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.currentDriver, "B");
});

test("lapNumber pid'in en yüksek lapNumber'ından gelir", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    laps: [{ pid: 9, lapNumber: 5, lapTimeMillis: 208000 }, { pid: 9, lapNumber: 7, lapTimeMillis: 207000 }],
  };
  assert.equal(adaptSnapshot(snap, [9]).get(9).lapNumber, 7);
});

test("sınıf komşuları: gapBehind ve ön/arka araç no türetilir", () => {
  // Sınıf X: P1=araç A (pid 1), P2=takip edilen (pid 9), P3=araç C (pid 3)
  const snap = {
    ranks: [
      { pid: 1, overallPosition: 1, position: 1, carNumber: "A", classId: "X" },
      { pid: 9, overallPosition: 2, position: 2, carNumber: "9", classId: "X" },
      { pid: 3, overallPosition: 3, position: 3, carNumber: "C", classId: "X" },
    ],
    gaps: [
      { pid: 9, gapToAheadMillis: 1500, gapToFirstMillis: 1500 },
      { pid: 3, gapToAheadMillis: 2200, gapToFirstMillis: 3700 }, // arkadaki C'nin bize farkı = bizim arka farkımız
    ],
    laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.gapAheadMs, 1500);
  assert.equal(car.gapBehindMs, 2200);
  assert.equal(car.aheadCarNumber, "A");
  assert.equal(car.behindCarNumber, "C");
});

test("sınıf lideriyse aheadCarNumber/gapAhead null; sonuncuysa behind null", () => {
  const snap = {
    ranks: [
      { pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" },
      { pid: 3, overallPosition: 2, position: 2, carNumber: "C", classId: "X" },
    ],
    gaps: [{ pid: 3, gapToAheadMillis: 2200, gapToFirstMillis: 2200 }],
    laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
  };
  const leader = adaptSnapshot(snap, [9]).get(9);
  assert.equal(leader.aheadCarNumber, null);
  assert.equal(leader.gapBehindMs, 2200);
  assert.equal(leader.behindCarNumber, "C");

  const last = adaptSnapshot(snap, [3]).get(3);
  assert.equal(last.behindCarNumber, null);
  assert.equal(last.gapBehindMs, null);
});

test("hava durumu global kayıttan normalize edilir", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    weather: [{ temperature: 26.1, trackTemperature: 33.3, humidity: 54, windSpeedKph: 3, windDirectionCode: "WSW", sky: "Cloudy", pid: -1 }],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.weather.airTemp, 26.1);
  assert.equal(car.weather.trackTemp, 33.3);
  assert.equal(car.weather.sky, "Cloudy");
  assert.equal(car.weather.windKph, 3);
});

test("topSpeedKph speed alanından gelir (0 ise null)", () => {
  const base = { ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }], gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [] };
  assert.equal(adaptSnapshot({ ...base, topSpeed: [{ pid: 9, speed: 287 }] }, [9]).get(9).topSpeedKph, 287);
  assert.equal(adaptSnapshot({ ...base, topSpeed: [{ pid: 9, speed: 0 }] }, [9]).get(9).topSpeedKph, null);
});

test("sektörler obje(pid->array)'den sıralı çıkarılır", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    sectors: { "9": [
      { sectorNumber: 2, sectorTimeMillis: 79886, color: "Green" },
      { sectorNumber: 1, sectorTimeMillis: 33612, color: "Purple" },
    ] },
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.sectors.length, 2);
  assert.equal(car.sectors[0].num, 1);
  assert.equal(car.sectors[0].color, "Purple");
  assert.equal(car.sectors[1].ms, 79886);
});

test("lapHistory tur numarasına göre sıralı {lap,ms,valid} dizisi verir", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    laps: [
      { pid: 9, lapNumber: 7, lapTimeMillis: 207000, isValid: true },
      { pid: 9, lapNumber: 5, lapTimeMillis: 208000, isValid: true },
      { pid: 9, lapNumber: 6, lapTimeMillis: 275000, isValid: false },
    ],
  };
  const h = adaptSnapshot(snap, [9]).get(9).lapHistory;
  assert.deepEqual(h.map((x) => x.lap), [5, 6, 7]);
  assert.equal(h[1].valid, false);
});
