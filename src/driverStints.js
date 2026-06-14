// src/driverStints.js
// DriverSwap olaylarından sürücü başına toplam süre (saniye) hesaplar. Saf fonksiyon.

/**
 * @param {Array<{previousDriverId:string,newDriverId:string,ts:string}>} swaps  ts'ye göre artan sırada
 * @param {number} startMs yarış başlangıcı (epoch ms)
 * @param {number} nowMs   şu an (epoch ms)
 * @returns {{byDriver:Record<string,number>, segments:Array<{id:string,seconds:number,current?:boolean}>, currentId:string|null}}
 */
export function computeDriverStints(swaps, startMs, nowMs) {
  const list = [...(swaps ?? [])].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const byDriver = {};
  const segments = [];
  let t0 = startMs;
  let drv = list.length ? String(list[0].previousDriverId) : null;
  for (const s of list) {
    const t = Date.parse(s.ts);
    if (drv != null && t >= t0) {
      const seconds = (t - t0) / 1000;
      byDriver[drv] = (byDriver[drv] ?? 0) + seconds;
      segments.push({ id: drv, seconds });
    }
    t0 = t;
    drv = String(s.newDriverId);
  }
  if (drv != null && nowMs >= t0) {
    const seconds = (nowMs - t0) / 1000;
    byDriver[drv] = (byDriver[drv] ?? 0) + seconds;
    segments.push({ id: drv, seconds, current: true });
  }
  return { byDriver, segments, currentId: drv };
}
