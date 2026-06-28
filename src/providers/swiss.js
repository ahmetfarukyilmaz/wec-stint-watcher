// src/providers/swiss.js
import { createSwissApiClient } from "../swissApiClient.js";
import { swissBuildCars, swissAdaptSnapshot } from "../swissAdapter.js";
import { parseClockMs } from "../swissParse.js";

export function createSwissProvider(cfg, fetchOverride) {
  const api = fetchOverride
    ? { fetchAll: fetchOverride, resolve: async () => {} }
    : createSwissApiClient(cfg);
  return {
    fetchAll: () => api.fetchAll(),
    buildCars: (snap) => swissBuildCars(snap),
    adapt: (snap, pids) => swissAdaptSnapshot(snap, pids),
    // Swiss Messages şekli Griiip raceLog'dan farklı (raceLogItemId/type yok) → v1'de boş.
    // Race-control Messages eşlemesi v2 kapsamında.
    raceLog: () => [],
    clock: (snap) => ({ remainingMs: parseClockMs(snap.timing?.UntInfo?.RemainingTime) }),
  };
}
