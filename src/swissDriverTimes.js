// src/swissDriverTimes.js
// Pollar arası aktif sürücü gözlemlerinden per-sürücü kümülatif süre (saniye) biriktirir.
// Swiss'te DriverSwap log'u olmadığından her poll'daki CurrentDriverId'den hesaplanır.
export function createSwissDriverTimes() {
  const byPid = new Map(); // pid -> { totals: Map<driverId, sec>, curId, lastMs }

  function update(pid, driverId, nowMs) {
    if (driverId == null) return; // bilinmeyen sürücü: referans alma
    let st = byPid.get(pid);
    if (!st) { st = { totals: new Map(), curId: driverId, lastMs: nowMs }; byPid.set(pid, st); return; }
    // lastMs == null: load sonrası ilk gözlem — restart/downtime süresini sayma, sadece referans al
    if (st.lastMs != null && driverId === st.curId) {
      const dt = (nowMs - st.lastMs) / 1000;
      if (dt > 0) st.totals.set(driverId, (st.totals.get(driverId) ?? 0) + dt);
    }
    // sürücü değişse de değişmese de referansı ilerlet; değişimde yeni sürücüden başla
    st.curId = driverId;
    st.lastMs = nowMs;
  }

  function get(pid) {
    const st = byPid.get(pid);
    if (!st) return {};
    return Object.fromEntries(st.totals);
  }

  function all() {
    const out = {};
    for (const pid of byPid.keys()) out[pid] = get(pid);
    return out;
  }

  // Kalıcılık: restart'ta totals + aktif sürücü korunur (lastMs hariç — downtime sayılmaz).
  function dump() {
    const out = {};
    for (const [pid, st] of byPid) out[pid] = { totals: Object.fromEntries(st.totals), curId: st.curId };
    return out;
  }

  function load(data) {
    if (!data || typeof data !== "object") return;
    for (const [pid, st] of Object.entries(data)) {
      byPid.set(Number(pid), {
        totals: new Map(Object.entries(st?.totals ?? {})),
        curId: st?.curId ?? null,
        lastMs: null, // ilk update'te yeniden referans alınır (downtime sayılmaz)
      });
    }
  }

  return { update, get, all, dump, load };
}
