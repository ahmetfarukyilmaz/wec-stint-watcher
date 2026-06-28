// src/pollClient.js
import { createScheduler } from "./scheduler.js";

/**
 * @param {{pollIntervalSeconds:number, trackedParticipants:number[]}} cfg
 * @param {{fetchAll, buildCars, adapt, raceLog, clock}} provider
 * @param {(cars:object[]) => number[]} [resolveTracked]
 */
export function createPollClient(cfg, provider, resolveTracked) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };
  const resolve = resolveTracked ?? (() => cfg.trackedParticipants);
  let cars = [], tracked = [], raceLog = [], clock = {};

  async function pollOnce() {
    const snap = await provider.fetchAll();
    cars = provider.buildCars(snap);
    raceLog = provider.raceLog(snap);
    clock = provider.clock(snap);
    tracked = resolve(cars);
    const map = provider.adapt(snap, tracked);
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
    start() { scheduler.start(); return pollOnce(); },
    stop() { scheduler.stop(); },
  };
}
