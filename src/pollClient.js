// src/pollClient.js
import { adaptSnapshot } from "./adapter.js";
import { createScheduler } from "./scheduler.js";

/**
 * @param {{trackedParticipants:number[], pollIntervalSeconds:number}} cfg
 * @param {{fetchAll: () => Promise<object>}} apiClient
 */
export function createPollClient(cfg, apiClient) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };

  async function pollOnce() {
    const snap = await apiClient.fetchAll();
    const map = adaptSnapshot(snap, cfg.trackedParticipants);
    emit(map);
    return map;
  }

  const scheduler = createScheduler(cfg.pollIntervalSeconds * 1000, () => pollOnce().catch((e) => console.error("[poll]", e)));

  return {
    onSnapshot(cb) { handlers.add(cb); },
    pollOnce,
    start() { scheduler.start(); return pollOnce(); }, // ilk poll'u hemen yap
    stop() { scheduler.stop(); },
  };
}
