// src/apiClient.js
const ENDPOINTS = {
  ranks: "/live/ranks/",
  gaps: "/live/gaps/",
  laps: "/live/laps/",
  bestLaps: "/live/best-laps/",
  pitIn: "/live/pit-in/",
  pitOut: "/live/pit-out/",
  participants: "/live/participants/",
  flags: "/live/race-flags/",
};

/**
 * @param {{apiBase:string, sessionId:number}} cfg
 * @param {typeof fetch} [fetchImpl]
 */
export function createApiClient(cfg, fetchImpl = fetch) {
  async function getOne(path) {
    try {
      const res = await fetchImpl(`${cfg.apiBase}${path}${cfg.sessionId}`, {
        headers: { Accept: "application/json", "User-Agent": "wec-stint-watcher" },
      });
      if (!res.ok) { console.warn(`[api] ${path} HTTP ${res.status}`); return []; }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[api] ${path} hata: ${e.message}`);
      return [];
    }
  }

  return {
    async fetchAll() {
      const keys = Object.keys(ENDPOINTS);
      const results = await Promise.all(keys.map((k) => getOne(ENDPOINTS[k])));
      const snap = {};
      keys.forEach((k, i) => { snap[k] = results[i]; });
      return snap;
    },
  };
}
