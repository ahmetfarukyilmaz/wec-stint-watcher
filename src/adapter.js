// src/adapter.js
import { makeCarState } from "./model.js";

const tsMs = (s) => (s ? Date.parse(s) : 0);
const byPid = (arr, pid) => arr.filter((x) => Number(x.pid) === pid);

/**
 * Bir poll snapshot'ındaki tüm endpoint yanıtlarını takip edilen pid'ler için
 * Map<pid, CarState>'e birleştirir.
 * @param {{ranks:any[],gaps:any[],laps:any[],bestLaps:any[],pitIn:any[],pitOut:any[],participants:any[],flags:any[]}} snap
 * @param {number[]} trackedPids
 * @returns {Map<number, import("./model.js").CarState>}
 */
export function adaptSnapshot(snap, trackedPids) {
  const map = new Map();
  const currentFlag = snap.flags?.length ? (snap.flags[snap.flags.length - 1].flag ?? snap.flags[snap.flags.length - 1].flagType ?? null) : null;

  for (const pid of trackedPids) {
    const rank = byPid(snap.ranks ?? [], pid)[0];
    const gap = byPid(snap.gaps ?? [], pid)[0];
    const best = byPid(snap.bestLaps ?? [], pid)[0];
    const part = byPid(snap.participants ?? [], pid)[0];

    // son tur: en yüksek lapNumber
    const laps = byPid(snap.laps ?? [], pid);
    const lastLap = laps.reduce((m, l) => (m == null || l.lapNumber > m.lapNumber ? l : m), null);

    // pit: pid'in pit-in sayısı + son in/out karşılaştırması
    const pitIns = byPid(snap.pitIn ?? [], pid);
    const pitOuts = byPid(snap.pitOut ?? [], pid);
    const lastInTs = pitIns.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);
    const lastOutTs = pitOuts.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);

    // sürücü: currentDriverId -> drivers[].externalDriverID
    let driver = null;
    if (part?.drivers && part.currentDriverId != null) {
      const d = part.drivers.find((x) => String(x.externalDriverID) === String(part.currentDriverId));
      driver = d?.displayName ?? null;
    }

    map.set(pid, makeCarState({
      participantId: pid,
      carNumber: rank?.carNumber ?? part?.carNumber ?? null,
      classId: rank?.classId ?? null,
      position: rank?.overallPosition ?? null,
      classPosition: rank?.position ?? null,
      lastLapMs: lastLap?.lapTimeMillis ?? null,
      bestLapMs: best?.lapTimeMillis ?? null,
      bestLapIsPurple: best?.color === "Purple",
      gapAheadMs: gap?.gapToAheadMillis ?? null,
      gapToFirstMs: gap?.gapToFirstMillis ?? null,
      inPit: lastInTs > lastOutTs,
      pitCount: pitIns.length,
      currentDriver: driver,
      flag: currentFlag,
    }));
  }
  return map;
}
