// src/providers/griiip.js
import { createApiClient } from "../apiClient.js";
import { adaptSnapshot } from "../adapter.js";

export function createGriiipProvider(cfg, apiOverride) {
  const api = apiOverride ?? createApiClient(cfg);
  return {
    fetchAll: () => api.fetchAll(),
    buildCars: (snap) => {
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
    },
    adapt: (snap, pids) => adaptSnapshot(snap, pids),
    raceLog: (snap) => snap.raceLog?.items ?? [],
    clock: (snap) => snap.clock ?? {},
    fetchRaceLogFull: () => api.fetchRaceLogFull(), // Griiip'e özel (driver times)
  };
}
