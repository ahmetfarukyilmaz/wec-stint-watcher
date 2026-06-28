// src/swissApiClient.js
// Swiss Timing açık JSON cache: keşif zinciri + canlı dosya fetch.
const DEFAULT_BASE = "https://ps-cache.web.swisstiming.com/node/db/RAC_PROD/";

export function createSwissApiClient(cfg = {}, fetchImpl = fetch) {
  const base = cfg.swissBase ?? DEFAULT_BASE;
  const tour = cfg.tournament ?? "SRO";
  let season = cfg.season ?? null;
  let meetingId = cfg.meetingId ?? null; // BÜYÜK harf GUID
  let unitId = cfg.unitId ?? null;       // BÜYÜK harf GUID

  async function getFull(key) {
    const res = await fetchImpl(base + key + ".json", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`[swiss] ${key} HTTP ${res.status}`);
    const j = await res.json();
    return j?.content?.full ?? j?.content ?? j;
  }

  async function resolve() {
    if (!season) {
      const s = await getFull(`${tour}_SEASONS_JSON`);
      season = String(s.CurrentSeason);
    }
    if (!meetingId) {
      const se = await getFull(`${tour}_${season}_SEASON_JSON`);
      meetingId = String(se.PresentationMeetingId).toUpperCase();
    }
    const sch = await getFull(`${tour}_${season}_SCHEDULE_${meetingId}_JSON`);
    if (!unitId) unitId = String(sch.PresentationRoundId).toUpperCase();
    return { season, meetingId, unitId };
  }

  async function fetchAll() {
    if (!unitId) await resolve();
    const [timing, detail] = await Promise.all([
      getFull(`${tour}_${season}_TIMING_${unitId}_JSON`),
      getFull(`${tour}_${season}_COMP_DETAIL_${unitId}_JSON`),
    ]);
    return { timing, detail };
  }

  return { resolve, fetchAll, getState: () => ({ season, meetingId, unitId }) };
}
