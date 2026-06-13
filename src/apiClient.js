// src/apiClient.js
// Dizi dönen endpoint'ler: {sid} sona eklenir.
const ARR_ENDPOINTS = {
  ranks: "/live/ranks/",
  gaps: "/live/gaps/",
  laps: "/live/laps/",
  bestLaps: "/live/best-laps/",
  pitIn: "/live/pit-in/",
  pitOut: "/live/pit-out/",
  participants: "/live/participants/",
  flags: "/live/race-flags/",
  topSpeed: "/live/current-top-speeds/",
};

/**
 * @param {{apiBase:string, sessionId:number}} cfg
 * @param {typeof fetch} [fetchImpl]
 */
export function createApiClient(cfg, fetchImpl = fetch) {
  async function getJson(url, fallback) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "wec-stint-watcher" } });
      if (!res.ok) { console.warn(`[api] ${url} HTTP ${res.status}`); return fallback; }
      const data = await res.json();
      if (Array.isArray(fallback)) return Array.isArray(data) ? data : fallback;
      return (data && typeof data === "object") ? data : fallback;
    } catch (e) {
      console.warn(`[api] ${url} hata: ${e.message}`);
      return fallback;
    }
  }

  const url = (path, suffix = "") => `${cfg.apiBase}${path}${cfg.sessionId}${suffix}`;

  return {
    async fetchAll() {
      const arrKeys = Object.keys(ARR_ENDPOINTS);
      const [arrResults, sectors, weather] = await Promise.all([
        Promise.all(arrKeys.map((k) => getJson(url(ARR_ENDPOINTS[k]), []))),
        // sektörler {sid}/current-lap ile biter ve pid'e göre OBJE döner
        getJson(url("/live/sectors/", "/current-lap"), {}),
        // hava tek OBJE döner (dizi değil)
        getJson(url("/live/weather-current/"), {}),
      ]);
      const snap = { sectors, weather };
      arrKeys.forEach((k, i) => { snap[k] = arrResults[i]; });
      return snap;
    },
  };
}
