// src/trackingStore.js
// Akıllı takip: pinli araçlar (her zaman) + otomatik sınıf ilk-N. data/tracking.json'a yazar.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function createTrackingStore(dir, initialPinned = []) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "tracking.json");

  let state;
  if (existsSync(path)) {
    try { state = JSON.parse(readFileSync(path, "utf8")); } catch { state = null; }
  }
  if (!state) state = { pinned: [...initialPinned].map(Number), topN: 0, smartClass: null };
  state.pinned = (state.pinned ?? []).map(Number);

  if (!existsSync(path)) persist();
  function persist() { writeFileSync(path, JSON.stringify(state)); }

  return {
    pinnedList() { return [...state.pinned]; },
    isPinned(pid) { return state.pinned.includes(Number(pid)); },
    pin(pid) { pid = Number(pid); if (!state.pinned.includes(pid)) { state.pinned.push(pid); persist(); } return true; },
    unpin(pid) { pid = Number(pid); const n = state.pinned.length; state.pinned = state.pinned.filter((p) => p !== pid); if (state.pinned.length !== n) persist(); return true; },
    getSmart() { return { smartClass: state.smartClass ?? null, topN: state.topN ?? 0 }; },
    setSmart(smartClass, topN) { state.smartClass = smartClass || null; state.topN = Math.max(0, Number(topN) || 0); persist(); },

    /**
     * Efektif takip listesi: pinli ∪ otomatik(sınıf ilk-N).
     * @param {Array<{pid:number,classId:string,classPos:number,overall:number}>} cars
     */
    effective(cars) {
      const auto = [];
      if (state.topN > 0 && Array.isArray(cars)) {
        const overall = !state.smartClass || state.smartClass === "__overall";
        const pool = overall ? cars.slice() : cars.filter((c) => c.classId === state.smartClass);
        pool.sort((a, b) => (overall ? (a.overall ?? 9999) - (b.overall ?? 9999) : (a.classPos ?? 9999) - (b.classPos ?? 9999)));
        for (const c of pool.slice(0, state.topN)) auto.push(Number(c.pid));
      }
      return [...new Set([...state.pinned, ...auto])];
    },
  };
}
