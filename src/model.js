// src/model.js
/**
 * @typedef {Object} CarState
 * @property {number} participantId
 * @property {string|null} carNumber
 * @property {string|null} classId
 * @property {number|null} position        genel sıra (overallPosition)
 * @property {number|null} classPosition   sınıf içi sıra (position)
 * @property {number|null} lapNumber        mevcut/son tamamlanan tur no
 * @property {number|null} lastLapMs
 * @property {number|null} bestLapMs
 * @property {boolean} bestLapIsPurple      genel en hızlı turu elinde tutuyor mu
 * @property {number|null} gapAheadMs       öndeki araca fark (ms)
 * @property {number|null} gapBehindMs      arkadaki araca fark (ms)
 * @property {number|null} gapToFirstMs
 * @property {string|null} aheadCarNumber   öndeki rakip araç no (sınıf içi)
 * @property {string|null} behindCarNumber  arkadaki rakip araç no (sınıf içi)
 * @property {boolean} inPit
 * @property {number} pitCount
 * @property {string|null} team               takım adı
 * @property {string|null} currentDriver
 * @property {string|null} currentDriverCat  FIA kategori: P/G/S/B
 * @property {Array<{name:string,cat:string|null,current:boolean}>} drivers  sürücü kadrosu
 * @property {string|null} flag
 * @property {number|null} topSpeedKph     son speed trap hızı
 * @property {Array<{num:number,ms:number,color:string}>} sectors  mevcut tur sektörleri
 * @property {Array<{lap:number,ms:number,valid:boolean}>} lapHistory  tur zamanı serisi
 * @property {{airTemp:number,trackTemp:number,humidity:number,windKph:number,windDir:string,sky:string}|null} weather
 * @property {{compound:string,ageLaps:number}|null} tire
 * @property {{elapsedMs:number,totalMs:number,remainingMs:number}|null} raceClock
 * @property {{lap:number,at:number,durationMs:number}|null} lastPit  son pit-out (tur, epoch ms, duruş)
 * @property {number|null} stintLaps  son pit'ten beri geçen tur
 */

/** @param {Partial<CarState>} partial @returns {CarState} */
export function makeCarState(partial = {}) {
  return {
    participantId: partial.participantId ?? null,
    carNumber: partial.carNumber ?? null,
    classId: partial.classId ?? null,
    position: partial.position ?? null,
    classPosition: partial.classPosition ?? null,
    lapNumber: partial.lapNumber ?? null,
    lastLapMs: partial.lastLapMs ?? null,
    bestLapMs: partial.bestLapMs ?? null,
    bestLapIsPurple: partial.bestLapIsPurple ?? false,
    gapAheadMs: partial.gapAheadMs ?? null,
    gapBehindMs: partial.gapBehindMs ?? null,
    gapToFirstMs: partial.gapToFirstMs ?? null,
    aheadCarNumber: partial.aheadCarNumber ?? null,
    behindCarNumber: partial.behindCarNumber ?? null,
    inPit: partial.inPit ?? false,
    pitCount: partial.pitCount ?? 0,
    team: partial.team ?? null,
    currentDriver: partial.currentDriver ?? null,
    currentDriverCat: partial.currentDriverCat ?? null,
    drivers: partial.drivers ?? [],
    flag: partial.flag ?? null,
    topSpeedKph: partial.topSpeedKph ?? null,
    sectors: partial.sectors ?? [],
    lapHistory: partial.lapHistory ?? [],
    weather: partial.weather ?? null,
    tire: partial.tire ?? null,
    raceClock: partial.raceClock ?? null,
    lastPit: partial.lastPit ?? null,
    stintLaps: partial.stintLaps ?? null,
  };
}

/**
 * @param {string} type @param {number} participantId
 * @param {object} payload @param {number} at epoch ms
 */
export function makeEvent(type, participantId, payload, at) {
  return { type, participantId, payload, at };
}
