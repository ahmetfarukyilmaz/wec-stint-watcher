// src/pollClient.js
import { adaptSnapshot } from "./adapter.js";
import { createScheduler } from "./scheduler.js";

/**
 * @param {{trackedParticipants:number[], pollIntervalSeconds:number}} cfg
 * @param {{fetchAll: () => Promise<object>}} apiClient
 * @param {() => number[]} [getTracked]  izlenecek pid'leri dinamik veren fonksiyon
 */
export function createPollClient(cfg, apiClient, getTracked) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };
  const tracked = getTracked ?? (() => cfg.trackedParticipants);
  let cars = []; // tüm araçların hafif listesi (seçici için)
  let raceLog = []; // son race log item'ları

  function buildCars(snap) {
    const drivers = new Map();
    for (const p of snap.participants ?? []) drivers.set(Number(p.pid), p.displayName ?? p.teamName ?? null);
    return (snap.ranks ?? []).map((r) => ({
      pid: Number(r.pid),
      carNumber: r.carNumber ?? null,
      classId: r.classId ?? null,
      team: drivers.get(Number(r.pid)) ?? null,
    })).filter((c) => c.carNumber != null);
  }

  async function pollOnce() {
    const snap = await apiClient.fetchAll();
    cars = buildCars(snap);
    raceLog = snap.raceLog?.items ?? [];
    const map = adaptSnapshot(snap, tracked());
    emit(map);
    return map;
  }

  const scheduler = createScheduler(cfg.pollIntervalSeconds * 1000, () => pollOnce().catch((e) => console.error("[poll]", e)));

  return {
    onSnapshot(cb) { handlers.add(cb); },
    getCars() { return cars; },
    getRaceLog() { return raceLog; },
    pollOnce,
    start() { scheduler.start(); return pollOnce(); }, // ilk poll'u hemen yap
    stop() { scheduler.stop(); },
  };
}
