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
    // Swiss Messages'ı Griiip-benzeri race-log olaylarına sınıflandır.
    // Metin "CAR <no> ..." formatında: RETIRED/WITHDRAWN → çekilme, PENALTY → zaman kaybı,
    // diğerleri → genel yarış kontrol (RCMessage). dedup id'ye Type de eklenir (çakışmayı azaltır).
    raceLog: (snap) => {
      const msgs = snap.detail?.Messages ?? [];
      return msgs.map((m) => {
        const text = m.Text ?? "";
        const id = `${m.Time}|${m.Type}|${text}`;
        const carMatch = text.match(/CAR\s+(\d+)/i);
        const pid = carMatch ? Number(carMatch[1]) : null;
        if (pid != null && /\bRETIR(?:E|ED|ING)?\b|WITHDRAWN?/i.test(text)) {
          return { raceLogItemId: id, type: "ParticipantRetired", pid, carNumber: String(pid), lapNumber: null };
        }
        if (pid != null && /PENALTY/i.test(text)) {
          return { raceLogItemId: id, type: "SignificantTimeLoss", pid, lapNumber: null, sectorNumber: null, diffFromRacePace: null };
        }
        return { raceLogItemId: id, type: "RCMessage", text, lapNumber: null };
      });
    },
    clock: (snap) => ({ remainingMs: parseClockMs(snap.timing?.UntInfo?.RemainingTime) }),
  };
}
