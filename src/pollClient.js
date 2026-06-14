// src/pollClient.js
import { adaptSnapshot } from "./adapter.js";
import { createScheduler } from "./scheduler.js";

/**
 * @param {{trackedParticipants:number[], pollIntervalSeconds:number}} cfg
 * @param {{fetchAll: () => Promise<object>}} apiClient
 * @param {(cars:object[]) => number[]} [resolveTracked]  güncel araçlardan efektif izlenecek pid'leri veren fonksiyon
 */
export function createPollClient(cfg, apiClient, resolveTracked) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };
  const resolve = resolveTracked ?? (() => cfg.trackedParticipants);
  let cars = []; // tüm araçların hafif listesi (seçici için)
  let tracked = []; // son efektif takip listesi
  let raceLog = []; // son race log item'ları
  let clock = {}; // son yarış saati

  function buildCars(snap) {
    const drivers = new Map();
    for (const p of snap.participants ?? []) drivers.set(Number(p.pid), p.displayName ?? p.teamName ?? null);
    const gap = new Map();
    for (const g of snap.gaps ?? []) gap.set(Number(g.pid), g.gapToFirstMillis ?? null);
    return (snap.ranks ?? []).map((r) => ({
      pid: Number(r.pid),
      carNumber: r.carNumber ?? null,
      classId: r.classId ?? null,
      team: drivers.get(Number(r.pid)) ?? null,
      overall: r.overallPosition ?? null,
      classPos: r.position ?? null,
      gapToFirstMs: gap.get(Number(r.pid)) ?? null,
    })).filter((c) => c.carNumber != null);
  }

  async function pollOnce() {
    const snap = await apiClient.fetchAll();
    cars = buildCars(snap);
    raceLog = snap.raceLog?.items ?? [];
    clock = snap.clock ?? {};
    tracked = resolve(cars); // pinli ∪ otomatik ilk-N
    const map = adaptSnapshot(snap, tracked);
    emit(map);
    return map;
  }

  const scheduler = createScheduler(cfg.pollIntervalSeconds * 1000, () => pollOnce().catch((e) => console.error("[poll]", e)));

  return {
    onSnapshot(cb) { handlers.add(cb); },
    getCars() { return cars; },
    getTracked() { return tracked; },
    getRaceLog() { return raceLog; },
    getClock() { return clock; },
    pollOnce,
    start() { scheduler.start(); return pollOnce(); }, // ilk poll'u hemen yap
    stop() { scheduler.stop(); },
  };
}
