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
  const gapOf = (pid) => byPid(snap.gaps ?? [], pid)[0];

  // Hava global (pid=-1); tek obje döner (eski sürümlerde dizi olabilir)
  const w = Array.isArray(snap.weather) ? snap.weather[0] : snap.weather;
  const weather = w && w.temperature != null ? {
    airTemp: w.temperature ?? null,
    trackTemp: w.trackTemperature ?? null,
    humidity: w.humidity ?? null,
    windKph: w.windSpeedKph ?? null,
    windDir: w.windDirectionCode ?? null,
    sky: w.sky ?? null,
  } : null;

  // Yarış saati global: kalan süre = toplam limit - geçen
  const totalMs = (snap.sessionLength?.timeLimitSeconds ?? 0) * 1000;
  const elapsedMs = snap.clock?.elapsedTimeMillis ?? null;
  const raceClock = (elapsedMs != null && elapsedMs >= 0)
    ? { elapsedMs, totalMs, remainingMs: totalMs ? Math.max(0, totalMs - elapsedMs) : null }
    : null;

  for (const pid of trackedPids) {
    const rank = byPid(snap.ranks ?? [], pid)[0];
    const gap = gapOf(pid);
    const best = byPid(snap.bestLaps ?? [], pid)[0];
    const part = byPid(snap.participants ?? [], pid)[0];

    // sınıf içi komşular: aynı classId, classPosition'a göre sıralı
    let aheadCar = null, behindCar = null, gapBehindMs = null;
    if (rank?.classId != null && rank?.position != null) {
      const classRanks = (snap.ranks ?? [])
        .filter((r) => r.classId === rank.classId && r.position != null)
        .sort((a, b) => a.position - b.position);
      const idx = classRanks.findIndex((r) => Number(r.pid) === pid);
      if (idx > 0) aheadCar = classRanks[idx - 1];
      if (idx >= 0 && idx < classRanks.length - 1) {
        behindCar = classRanks[idx + 1];
        // arkadaki aracın "öndekine farkı" = bizim arka farkımız
        gapBehindMs = gapOf(Number(behindCar.pid))?.gapToAheadMillis ?? null;
      }
    }

    // son tur: en yüksek lapNumber + tur serisi (grafik için, son 50 tur)
    const laps = byPid(snap.laps ?? [], pid);
    const lastLap = laps.reduce((m, l) => (m == null || l.lapNumber > m.lapNumber ? l : m), null);
    const lapHistory = laps
      .slice()
      .sort((a, b) => a.lapNumber - b.lapNumber)
      .slice(-50)
      .map((l) => ({ lap: l.lapNumber, ms: l.lapTimeMillis, valid: l.isValid !== false }));

    // speed trap (kph)
    const ts = byPid(snap.topSpeed ?? [], pid)[0];
    const topSpeedKph = ts?.speed ? ts.speed : null;

    // lastik: compound + yaş (4 teker, yaşı en büyüğü al)
    const tireRec = byPid(snap.tires ?? [], pid)[0];
    const tire = tireRec?.tires?.length
      ? { compound: tireRec.tires[0].compound ?? null, ageLaps: Math.max(...tireRec.tires.map((t) => t.ageInLaps ?? 0)) }
      : null;

    // mevcut tur sektörleri (obje pid -> array)
    const sectorRows = (snap.sectors && snap.sectors[String(pid)]) || (snap.sectors && snap.sectors[pid]) || [];
    const sectors = sectorRows
      .slice()
      .sort((a, b) => a.sectorNumber - b.sectorNumber)
      .map((s) => ({ num: s.sectorNumber, ms: s.sectorTimeMillis, color: s.color ?? null }));

    // pit: pid'in pit-in sayısı + son in/out karşılaştırması
    const pitIns = byPid(snap.pitIn ?? [], pid);
    const pitOuts = byPid(snap.pitOut ?? [], pid);
    const lastInTs = pitIns.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);
    const lastOutTs = pitOuts.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);
    // son pit-out kaydı (tur, zaman, duruş süresi)
    const lastOut = pitOuts.reduce((m, x) => (m == null || tsMs(x.ts) > tsMs(m.ts) ? x : m), null);
    const lastPit = lastOut ? { lap: lastOut.lapNumber ?? null, at: tsMs(lastOut.ts), durationMs: lastOut.durationMillis ?? null } : null;

    // sürücü: currentDriverId -> drivers[].externalDriverID + FIA kategori (P/G/S/B)
    let driver = null, driverCat = null, drivers = [];
    if (part?.drivers) {
      drivers = part.drivers.map((dr) => ({
        name: dr.threeLettersName || dr.displayName || "?",
        cat: dr.categoryId ?? null,
        current: part.currentDriverId != null && String(dr.externalDriverID) === String(part.currentDriverId),
      }));
      const d = part.drivers.find((x) => String(x.externalDriverID) === String(part.currentDriverId));
      driver = d?.displayName ?? null;
      driverCat = d?.categoryId ?? null;
    }

    map.set(pid, makeCarState({
      participantId: pid,
      carNumber: rank?.carNumber ?? part?.carNumber ?? null,
      classId: rank?.classId ?? null,
      position: rank?.overallPosition ?? null,
      classPosition: rank?.position ?? null,
      lapNumber: lastLap?.lapNumber ?? null,
      lastLapMs: lastLap?.lapTimeMillis ?? null,
      bestLapMs: best?.lapTimeMillis ?? null,
      bestLapIsPurple: best?.color === "Purple",
      gapAheadMs: aheadCar ? (gap?.gapToAheadMillis ?? null) : null,
      gapBehindMs,
      gapToFirstMs: gap?.gapToFirstMillis ?? null,
      aheadCarNumber: aheadCar?.carNumber ?? null,
      behindCarNumber: behindCar?.carNumber ?? null,
      inPit: lastInTs > lastOutTs,
      pitCount: pitIns.length,
      currentDriver: driver,
      currentDriverCat: driverCat,
      drivers,
      flag: currentFlag,
      topSpeedKph,
      sectors,
      lapHistory,
      weather,
      tire,
      raceClock,
      lastPit,
      stintLaps: lastLap?.lapNumber != null ? lastLap.lapNumber - (lastOut?.lapNumber ?? 0) : null,
    }));
  }
  return map;
}
