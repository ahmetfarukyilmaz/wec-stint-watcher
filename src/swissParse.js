// Swiss Timing zaman string'lerini ms'ye çeviren saf yardımcılar.

/** "2:17.484" | "39.697" → ms (tur süresi). */
export function parseLapMs(s) {
  if (!s || typeof s !== "string") return null;
  const [main, frac = "0"] = s.split(".");
  const parts = main.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p; // [ss] veya [mm, ss]
  const ms = Number((frac + "000").slice(0, 3));
  return sec * 1000 + ms;
}

/** "20:05:04.277" | "3:17:46" → ms (saat/kalan süre). */
export function parseClockMs(s) {
  if (!s || typeof s !== "string") return null;
  const [main, frac = "0"] = s.split(".");
  const parts = main.split(":").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p; // [hh, mm, ss]
  const ms = Number((frac + "000").slice(0, 3));
  return sec * 1000 + ms;
}
