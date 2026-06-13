// test/eventDetector.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEvents } from "../src/eventDetector.js";
import { makeCarState } from "../src/model.js";

const cfg = { events: { position_change: true, pit: true, lap: true, driver_change: true, gap_threshold: true, flag: true }, gapThresholdSeconds: 10 };
const NOW = 1000;

test("sınıf pozisyonu iyileşince position_change üretir (gained=true)", () => {
  const prev = makeCarState({ participantId: 1, classPosition: 5 });
  const next = makeCarState({ participantId: 1, classPosition: 3 });
  const e = detectEvents(prev, next, cfg, NOW).find((x) => x.type === "position_change");
  assert.ok(e);
  assert.deepEqual(e.payload, { from: 5, to: 3, gained: true });
});

test("inPit false->true pit_in üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, inPit: false }), makeCarState({ participantId: 1, inPit: true, pitCount: 3 }), cfg, NOW);
  const e = evs.find((x) => x.type === "pit_in");
  assert.ok(e);
  assert.equal(e.payload.pitCount, 3);
});

test("inPit true->false pit_out üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, inPit: true }), makeCarState({ participantId: 1, inPit: false }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "pit_out"));
});

test("bestLap düşünce best_lap üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, bestLapMs: 206000 }), makeCarState({ participantId: 1, bestLapMs: 205000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "best_lap"));
});

test("bestLapIsPurple false->true fastest_lap üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, bestLapIsPurple: false }), makeCarState({ participantId: 1, bestLapIsPurple: true, bestLapMs: 205000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "fastest_lap"));
});

test("sürücü değişince driver_change üretir", () => {
  const e = detectEvents(makeCarState({ participantId: 1, currentDriver: "A" }), makeCarState({ participantId: 1, currentDriver: "B" }), cfg, NOW).find((x) => x.type === "driver_change");
  assert.deepEqual(e.payload, { from: "A", to: "B" });
});

test("gap eşiği yalnızca geçişte tetiklenir (histerezis)", () => {
  let evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 12000 }), makeCarState({ participantId: 1, gapAheadMs: 9000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "gap_threshold"));
  evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 9000 }), makeCarState({ participantId: 1, gapAheadMs: 8000 }), cfg, NOW);
  assert.equal(evs.find((x) => x.type === "gap_threshold"), undefined);
});

test("flag değişince flag üretir", () => {
  const e = detectEvents(makeCarState({ participantId: 1, flag: "GF" }), makeCarState({ participantId: 1, flag: "FCY" }), cfg, NOW).find((x) => x.type === "flag");
  assert.deepEqual(e.payload, { from: "GF", to: "FCY" });
});

test("değişiklik yoksa boş dizi döner", () => {
  const s = makeCarState({ participantId: 1, classPosition: 3 });
  assert.deepEqual(detectEvents(s, makeCarState({ participantId: 1, classPosition: 3 }), cfg, NOW), []);
});

test("kapatılan olay türü üretilmez", () => {
  const c = { ...cfg, events: { ...cfg.events, position_change: false } };
  const evs = detectEvents(makeCarState({ participantId: 1, classPosition: 5 }), makeCarState({ participantId: 1, classPosition: 3 }), c, NOW);
  assert.equal(evs.find((x) => x.type === "position_change"), undefined);
});

const cfg2 = { events: { lap_completed: true, battle: true }, gapThresholdSeconds: 10, battleThresholdSeconds: 2 };

test("lapNumber artınca lap_completed üretir (önceki + en iyi delta)", () => {
  const prev = makeCarState({ participantId: 1, lapNumber: 67, lastLapMs: 207000, bestLapMs: 205000 });
  const next = makeCarState({ participantId: 1, lapNumber: 68, lastLapMs: 208500, bestLapMs: 205000 });
  const e = detectEvents(prev, next, cfg2, NOW).find((x) => x.type === "lap_completed");
  assert.ok(e);
  assert.equal(e.payload.lap, 68);
  assert.equal(e.payload.lapMs, 208500);
  assert.equal(e.payload.deltaPrevMs, 1500);   // öncekine göre +1.5sn yavaş
  assert.equal(e.payload.deltaBestMs, 3500);   // en iyiye göre +3.5sn
});

test("lapNumber aynıysa lap_completed üretmez", () => {
  const s = makeCarState({ participantId: 1, lapNumber: 68, lastLapMs: 208000, bestLapMs: 205000 });
  assert.equal(detectEvents(s, makeCarState({ ...s }), cfg2, NOW).find((x) => x.type === "lap_completed"), undefined);
});

test("öndeki araç eşik içine girince battle_ahead (histerezis)", () => {
  let evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 3000, aheadCarNumber: "7" }), makeCarState({ participantId: 1, gapAheadMs: 1800, aheadCarNumber: "7" }), cfg2, NOW);
  const e = evs.find((x) => x.type === "battle_ahead");
  assert.ok(e);
  assert.equal(e.payload.carNumber, "7");
  assert.equal(e.payload.gapMs, 1800);
  // zaten eşik içindeyken tekrar tetiklemez
  evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 1800, aheadCarNumber: "7" }), makeCarState({ participantId: 1, gapAheadMs: 1500, aheadCarNumber: "7" }), cfg2, NOW);
  assert.equal(evs.find((x) => x.type === "battle_ahead"), undefined);
});

test("arkadaki araç eşik içine girince battle_behind", () => {
  const e = detectEvents(makeCarState({ participantId: 1, gapBehindMs: 3000, behindCarNumber: "92" }), makeCarState({ participantId: 1, gapBehindMs: 1900, behindCarNumber: "92" }), cfg2, NOW).find((x) => x.type === "battle_behind");
  assert.ok(e);
  assert.equal(e.payload.carNumber, "92");
});

test("battle kapalıysa üretilmez", () => {
  const c = { ...cfg2, events: { ...cfg2.events, battle: false } };
  const evs = detectEvents(makeCarState({ participantId: 1, gapBehindMs: 3000, behindCarNumber: "92" }), makeCarState({ participantId: 1, gapBehindMs: 1900, behindCarNumber: "92" }), c, NOW);
  assert.equal(evs.find((x) => x.type === "battle_behind"), undefined);
});
