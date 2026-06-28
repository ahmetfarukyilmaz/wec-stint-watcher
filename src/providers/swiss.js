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
    // Swiss Messages'ı Griiip-benzeri RCMessage olaylarına map'le.
    // Messages (Time, Text, Type) → raceLogItemId (Time|Text), type, text, lapNumber.
    raceLog: (snap) => {
      const msgs = snap.detail?.Messages ?? [];
      return msgs.map((m) => ({
        raceLogItemId: `${m.Time}|${m.Text}`,
        type: "RCMessage",
        text: m.Text ?? "",
        lapNumber: null,
      }));
    },
    clock: (snap) => ({ remainingMs: parseClockMs(snap.timing?.UntInfo?.RemainingTime) }),
  };
}
