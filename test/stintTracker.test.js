import { test } from "node:test";
import assert from "node:assert/strict";
import { createStintTracker } from "../src/stintTracker.js";

test("tamamlanan turları biriktirir, ortalama pace hesaplar", () => {
  const t = createStintTracker();
  t.update(1, { lap: 10, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 }); // referans
  t.update(1, { lap: 11, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  t.update(1, { lap: 12, lastLapMs: 121000, inPit: false, pitCount: 0, nowMs: 2 });
  const g = t.get(1);
  assert.equal(g.stintLaps, 2);
  assert.ok(g.avgPaceMs >= 120000 && g.avgPaceMs <= 121000);
});

test("pit stint'i sıfırlar", () => {
  const t = createStintTracker();
  t.update(1, { lap: 10, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  t.update(1, { lap: 11, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  t.update(1, { lap: 12, lastLapMs: 200000, inPit: true, pitCount: 1, nowMs: 2 }); // pit
  t.update(1, { lap: 13, lastLapMs: 121000, inPit: false, pitCount: 1, nowMs: 3 });
  const g = t.get(1);
  assert.equal(g.stintLaps, 1); // 12'de pit → stintStart 12, şu an 13
});

test("artan tur süreleri pozitif degradasyon verir", () => {
  const t = createStintTracker();
  t.update(1, { lap: 0, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  for (let i = 1; i <= 6; i++) t.update(1, { lap: i, lastLapMs: 120000 + i * 200, inPit: false, pitCount: 0, nowMs: i });
  const g = t.get(1);
  assert.ok(g.degradationMsPerLap > 0, "pace tur başına artıyor");
});

test("pit sayısından ortalama stint + pit tahmini", () => {
  const t = createStintTracker();
  t.update(1, { lap: 0, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  // 30 tur, 2 pit → avgStintLaps=15
  t.update(1, { lap: 30, lastLapMs: 120000, inPit: false, pitCount: 2, nowMs: 1 });
  const g = t.get(1);
  assert.equal(g.avgStintLaps, 15);
  assert.equal(typeof g.predictedPitLap, "number");
  assert.equal(typeof g.lapsToPit, "number");
});

test("dump/load durumu korur", () => {
  const t = createStintTracker();
  t.update(1, { lap: 5, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  t.update(1, { lap: 6, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  const t2 = createStintTracker();
  t2.load(t.dump());
  t2.update(1, { lap: 7, lastLapMs: 121000, inPit: false, pitCount: 0, nowMs: 2 });
  assert.equal(t2.get(1).stintLaps, 2);
});
