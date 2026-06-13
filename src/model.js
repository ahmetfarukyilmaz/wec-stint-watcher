// src/model.js
/**
 * @typedef {Object} CarState
 * @property {number} participantId
 * @property {string|null} carNumber
 * @property {string|null} classId
 * @property {number|null} position        genel sıra (overallPosition)
 * @property {number|null} classPosition   sınıf içi sıra (position)
 * @property {number|null} lastLapMs
 * @property {number|null} bestLapMs
 * @property {boolean} bestLapIsPurple      genel en hızlı turu elinde tutuyor mu
 * @property {number|null} gapAheadMs       öndeki araca fark (ms)
 * @property {number|null} gapToFirstMs
 * @property {boolean} inPit
 * @property {number} pitCount
 * @property {string|null} currentDriver
 * @property {string|null} flag
 */

/** @param {Partial<CarState>} partial @returns {CarState} */
export function makeCarState(partial = {}) {
  return {
    participantId: partial.participantId ?? null,
    carNumber: partial.carNumber ?? null,
    classId: partial.classId ?? null,
    position: partial.position ?? null,
    classPosition: partial.classPosition ?? null,
    lastLapMs: partial.lastLapMs ?? null,
    bestLapMs: partial.bestLapMs ?? null,
    bestLapIsPurple: partial.bestLapIsPurple ?? false,
    gapAheadMs: partial.gapAheadMs ?? null,
    gapToFirstMs: partial.gapToFirstMs ?? null,
    inPit: partial.inPit ?? false,
    pitCount: partial.pitCount ?? 0,
    currentDriver: partial.currentDriver ?? null,
    flag: partial.flag ?? null,
  };
}

/**
 * @param {string} type @param {number} participantId
 * @param {object} payload @param {number} at epoch ms
 */
export function makeEvent(type, participantId, payload, at) {
  return { type, participantId, payload, at };
}
