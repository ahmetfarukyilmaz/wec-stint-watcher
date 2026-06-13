// src/eventDetector.js
import { makeEvent } from "./model.js";

/**
 * Saf fonksiyon: önceki ve yeni durumu karşılaştırıp olay listesi üretir.
 * @param {import("./model.js").CarState} prev
 * @param {import("./model.js").CarState} next
 * @param {{events:Record<string,boolean>, gapThresholdSeconds:number, battleThresholdSeconds?:number}} cfg
 * @param {number} at epoch ms
 */
export function detectEvents(prev, next, cfg, at) {
  const events = [];
  const on = (k) => cfg.events?.[k];
  const pid = next.participantId;

  if (on("position_change") && prev.classPosition != null && next.classPosition != null && next.classPosition !== prev.classPosition) {
    events.push(makeEvent("position_change", pid, { from: prev.classPosition, to: next.classPosition, gained: next.classPosition < prev.classPosition }, at));
  }

  if (on("pit")) {
    if (!prev.inPit && next.inPit) events.push(makeEvent("pit_in", pid, { pitCount: next.pitCount }, at));
    if (prev.inPit && !next.inPit) events.push(makeEvent("pit_out", pid, { pitCount: next.pitCount }, at));
  }

  if (on("lap")) {
    if (prev.bestLapMs != null && next.bestLapMs != null && next.bestLapMs < prev.bestLapMs) {
      events.push(makeEvent("best_lap", pid, { from: prev.bestLapMs, to: next.bestLapMs }, at));
    }
    if (!prev.bestLapIsPurple && next.bestLapIsPurple) {
      events.push(makeEvent("fastest_lap", pid, { bestLapMs: next.bestLapMs }, at));
    }
  }

  if (on("driver_change") && next.currentDriver && prev.currentDriver && next.currentDriver !== prev.currentDriver) {
    events.push(makeEvent("driver_change", pid, { from: prev.currentDriver, to: next.currentDriver }, at));
  }

  if (on("gap_threshold") && prev.gapAheadMs != null && next.gapAheadMs != null) {
    const thr = cfg.gapThresholdSeconds * 1000;
    if (prev.gapAheadMs >= thr && next.gapAheadMs < thr) {
      events.push(makeEvent("gap_threshold", pid, { gapAheadMs: next.gapAheadMs, thresholdSeconds: cfg.gapThresholdSeconds }, at));
    }
  }

  if (on("flag") && next.flag && prev.flag !== next.flag) {
    events.push(makeEvent("flag", pid, { from: prev.flag, to: next.flag }, at));
  }

  if (on("lap_completed") && prev.lapNumber != null && next.lapNumber != null && next.lapNumber > prev.lapNumber && next.lastLapMs != null) {
    events.push(makeEvent("lap_completed", pid, {
      lap: next.lapNumber,
      lapMs: next.lastLapMs,
      deltaPrevMs: prev.lastLapMs != null ? next.lastLapMs - prev.lastLapMs : null,
      deltaBestMs: next.bestLapMs != null ? next.lastLapMs - next.bestLapMs : null,
    }, at));
  }

  if (on("battle")) {
    const thr = (cfg.battleThresholdSeconds ?? 2) * 1000;
    // Rakip eşik dışındayken (ya da bilinmezken) eşik içine girince bir kez tetikle (histerezis)
    if (next.gapAheadMs != null && next.gapAheadMs < thr && (prev.gapAheadMs == null || prev.gapAheadMs >= thr)) {
      events.push(makeEvent("battle_ahead", pid, { carNumber: next.aheadCarNumber, gapMs: next.gapAheadMs, thresholdSeconds: cfg.battleThresholdSeconds ?? 2 }, at));
    }
    if (next.gapBehindMs != null && next.gapBehindMs < thr && (prev.gapBehindMs == null || prev.gapBehindMs >= thr)) {
      events.push(makeEvent("battle_behind", pid, { carNumber: next.behindCarNumber, gapMs: next.gapBehindMs, thresholdSeconds: cfg.battleThresholdSeconds ?? 2 }, at));
    }
  }

  return events;
}
