// src/swissAdapter.js
// Swiss Timing (Spa24/SRO) snapshot → CarState. Saf fonksiyonlar.
import { makeCarState } from "./model.js";
import { parseLapMs, parseClockMs } from "./swissParse.js";

// İç pid: Bib (araç no) sayıya parse; boş/0/NaN ise CompetitorId'den deterministik hash.
export function pidOf(comp) {
  const n = Number(comp.Bib);
  if (Number.isInteger(n) && n > 0) return n;
  let h = 0;
  const s = String(comp.Id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 900000 + (Math.abs(h) % 90000); // çakışmayan yüksek aralık
}

// pid -> { competitor, competitorId }
function indexByPid(detail) {
  const out = new Map();
  for (const comp of Object.values(detail.Competitors ?? {})) {
    out.set(pidOf(comp), { comp, id: comp.Id });
  }
  return out;
}

export function swissBuildCars(snap) {
  const { timing, detail } = snap;
  const results = timing?.Results ?? {};
  const byPid = indexByPid(detail);
  const cars = [];
  for (const [pid, { comp, id }] of byPid) {
    const r = results[id]?.MainResult;
    cars.push({
      pid,
      competitorId: id,
      carNumber: comp.Bib ?? null,
      classId: comp.ClassId ?? null,
      team: comp.TeamName ?? null,
      overall: r?.Rank ?? null,
      classPos: r?.ClassRank ?? null,
      gapToFirstMs: null, // gap hesabı adapt içinde (lider referansı gerekir)
    });
  }
  return cars.filter((c) => c.carNumber != null);
}

export function swissAdaptSnapshot(snap, trackedPids) {
  const { timing, detail } = snap;
  const results = timing?.Results ?? {};
  const untInfo = timing?.UntInfo ?? {};
  const classes = detail?.Classes ?? {};
  const byPid = indexByPid(detail);
  const tracked = new Set(trackedPids.map(Number));

  // Gap referansı: lider (Rank 1) TotalTime + sınıf liderleri
  const allResults = Object.values(results).map((x) => x.MainResult);
  const overallLeader = allResults.find((r) => r.Rank === 1);
  const leaderTotalMs = parseClockMs(overallLeader?.TotalTime);
  const leaderLaps = overallLeader?.TotalLapCount ?? null;

  // Bayrak: TrackFlag (1=yeşil) → string; ChequeredFlag öncelikli
  const flag = untInfo.ChequeredFlag ? "Chequered" : flagName(untInfo.TrackFlag);

  // Kalan süre → raceClock
  const remainingMs = parseClockMs(untInfo.RemainingTime);
  const raceClock = remainingMs != null ? { elapsedMs: null, totalMs: null, remainingMs } : null;

  const map = new Map();
  for (const pid of tracked) {
    const entry = byPid.get(pid);
    if (!entry) continue;
    const { comp, id } = entry;
    const res = results[id]?.MainResult;
    if (!res) continue;

    // Sürücüler + aktif + FIA kategori
    const curId = comp.CurrentDriverId;
    const drivers = Object.values(comp.Drivers ?? {}).map((d) => ({
      id: d.Id != null ? String(d.Id) : null,
      name: d.ShortName || `${d.FirstName ?? ""} ${d.LastName ?? ""}`.trim() || "?",
      cat: d.LicenseTypeName ?? null,
      current: curId != null && String(d.Id) === String(curId),
    }));
    const cur = drivers.find((d) => d.current) ?? null;

    // Son tur sektörleri + top hız
    const last = res.LastLap ?? {};
    const inter = last.Intermediates ?? [];
    const sectors = inter.map((s, i) => ({ num: i + 1, ms: parseLapMs(s.Time), color: stateColor(s.TimeState) }));
    const topSpeedKph = inter.reduce((m, s) => Math.max(m, s.Speed ?? 0), 0) || null;

    // Gap (yaklaşık): aynı turdaysa TotalTime farkı; değilse lider turu - benim tur
    const myTotalMs = parseClockMs(res.TotalTime);
    let gapToFirstMs = null, gapToFirstLaps = null;
    if (leaderLaps != null && res.TotalLapCount != null && res.TotalLapCount < leaderLaps) {
      gapToFirstLaps = leaderLaps - res.TotalLapCount;
    } else if (leaderTotalMs != null && myTotalMs != null) {
      gapToFirstMs = Math.max(0, myTotalMs - leaderTotalMs);
    }

    const best = res.BestTime ?? {};

    map.set(pid, makeCarState({
      participantId: pid,
      carNumber: comp.Bib ?? null,
      classId: classes[comp.ClassId]?.ShortName ?? comp.ClassId ?? null,
      position: res.Rank ?? null,
      classPosition: res.ClassRank ?? null,
      lapNumber: res.TotalLapCount ?? null,
      lastLapMs: parseLapMs(last.Time),
      bestLapMs: parseLapMs(best.Time),
      bestLapIsPurple: best.TimeState === 2,
      gapAheadMs: null, // ahead hesabı v2 (komşu Rank); v1'de lidere fark gösterilir
      gapBehindMs: null,
      gapToFirstMs,
      inPit: comp.InPitLane === true,
      pitCount: comp.PitStopCount ?? 0,
      team: comp.TeamName ?? null,
      currentDriver: cur?.name ?? null,
      currentDriverCat: cur?.cat ?? null,
      drivers,
      flag,
      topSpeedKph,
      sectors,
      lapHistory: [], // Swiss tur serisi v2 (ayrı dosya gerekebilir)
      weather: null,
      tire: null,
      raceClock,
      lastPit: null,
      stintLaps: null,
      trackPositionPct: res.SectBasedPcntPos ?? null,
      manufacturer: comp.ManufacturerName ?? null,
      carType: comp.CarTypeName ?? null,
      gapToFirstLaps,
    }));
  }
  return map;
}

function flagName(tf) {
  switch (tf) {
    case 1: return "Green";
    case 2: return "Yellow";
    case 3: return "Red";
    case 4: return "SafetyCar";
    default: return tf != null ? String(tf) : null;
  }
}
function stateColor(ts) {
  switch (ts) {
    case 1: return "Green";   // kişisel en iyi
    case 2: return "Purple";  // oturum en iyisi
    default: return null;
  }
}
