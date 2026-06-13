// src/summary.js
/**
 * Belirli bir andaki durum + son olaylardan stint özeti üretir (saf fonksiyon).
 * @param {import("./model.js").CarState} state
 * @param {Array<{type:string,at:number}>} recentEvents
 * @param {number} at epoch ms
 */
export function buildStintSummary(state, recentEvents, at) {
  return {
    type: "stint_summary",
    participantId: state.participantId,
    carNumber: state.carNumber,
    position: state.position,
    classPosition: state.classPosition,
    bestLapMs: state.bestLapMs,
    lastLapMs: state.lastLapMs,
    gapAheadMs: state.gapAheadMs,
    gapToFirstMs: state.gapToFirstMs,
    pitCount: state.pitCount,
    currentDriver: state.currentDriver,
    eventCount: recentEvents.length,
    at,
  };
}
