// src/driverRules.js
// SRO Spa24 sürüş-süresi kurallarına göre sürücü değerlendirmesi. Saf fonksiyon.
const DEFAULTS = { maxTotalMin: 660, minTotalMin: 120, warnAtPct: 0.9, classOverrides: { Bronze: { Platinum: 480, Silver: 360 } } };

export function assessDriverRules(drivers, classShortName, cfg) {
  const c = cfg || DEFAULTS;
  const maxDefault = (c.maxTotalMin ?? DEFAULTS.maxTotalMin) * 60;
  const minSec = (c.minTotalMin ?? DEFAULTS.minTotalMin) * 60;
  const warnAt = c.warnAtPct ?? DEFAULTS.warnAtPct;
  const overrides = (c.classOverrides ?? {})[classShortName] ?? {};
  return (drivers ?? []).map((d) => {
    const maxSec = overrides[d.cat] != null ? overrides[d.cat] * 60 : maxDefault;
    const seconds = d.seconds ?? 0;
    let status = "ok";
    if (seconds > maxSec) status = "over";
    else if (seconds >= maxSec * warnAt) status = "warn";
    return { ...d, maxSec, minSec, status, pctOfMax: maxSec ? seconds / maxSec : null };
  });
}
