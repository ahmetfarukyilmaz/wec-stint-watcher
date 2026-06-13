// public/app.js
const statusEl = document.getElementById("status");
const flagTextEl = document.getElementById("flagText");
const eventsEl = document.getElementById("events");
const carsEl = document.getElementById("cars");

document.getElementById("enableNotif").addEventListener("click", () => {
  if ("Notification" in window) Notification.requestPermission();
});

/* ---------- formatters ---------- */
function fmtLap(ms) { if (ms == null) return "—"; const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(3).padStart(6, "0")}`; }
function fmtGap(ms) { return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`; }
function fmtDelta(ms) { if (ms == null) return null; const s = (ms / 1000).toFixed(1); return ms > 0 ? `+${s}` : s; }
function fmtTime(at) { const d = new Date(at); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

/* ---------- flag theming ---------- */
const FLAG_COLORS = { green: "#c6ff2e", yellow: "#ffb327", fcy: "#ffb327", slow: "#ffb327", safety: "#ffb327", sc: "#ffb327", red: "#ff3b46", chequered: "#ffffff", checkered: "#ffffff", white: "#ffffff" };
function applyFlag(flag) {
  const key = (flag || "").toString().toLowerCase().replace(/[^a-z]/g, "");
  const color = FLAG_COLORS[key] || "#c6ff2e";
  document.documentElement.style.setProperty("--flag", color);
  flagTextEl.textContent = flag || "—";
}

/* ---------- trend (ardışık tick'ler) ---------- */
const lastSeen = {};
function arrowFor(prev, value) {
  if (prev == null || value == null) return { ch: "→", cls: "" };
  if (value < prev - 300) return { ch: "↑", cls: "closing" };  // fark kapanıyor
  if (value > prev + 300) return { ch: "↓", cls: "losing" };   // fark açılıyor
  return { ch: "→", cls: "" };
}

/* ---------- battle gauge ---------- */
const GAUGE_MAX = 30000; // 30sn = kenar
const HOT_MS = 2500;
function rivalPos(gapMs, side) {
  const f = Math.min(Math.abs(gapMs) / GAUGE_MAX, 1);
  return side === "ahead" ? 50 - f * 42 : 50 + f * 42;
}
function rivalHtml(carNo, gapMs, side, arrow) {
  if (gapMs == null) {
    const left = side === "ahead" ? 8 : 92;
    const label = side === "ahead" ? "LİDER" : "SONUNCU";
    return `<div class="rival" style="left:${left}%"><div class="gap">${label}</div></div>`;
  }
  const hot = gapMs < HOT_MS ? " hot" : "";
  return `<div class="rival${hot}" style="left:${rivalPos(gapMs, side)}%">
      <div class="car-no">#${carNo ?? "?"}</div>
      <div class="gap"><span class="arrow ${arrow.cls}">${arrow.ch}</span> ${fmtGap(gapMs)}</div>
    </div>`;
}

function renderCars(state) {
  const cars = Object.values(state);
  if (!cars.length) { carsEl.innerHTML = `<div class="empty">Veri bekleniyor…</div>`; return; }
  carsEl.innerHTML = cars.map((car) => {
    const pid = car.participantId;
    const aArrow = arrowFor(lastSeen[pid]?.gapAheadMs, car.gapAheadMs);
    const bArrow = arrowFor(lastSeen[pid]?.gapBehindMs, car.gapBehindMs);
    lastSeen[pid] = { gapAheadMs: car.gapAheadMs, gapBehindMs: car.gapBehindMs };

    const bestDelta = (car.lastLapMs != null && car.bestLapMs != null) ? car.lastLapMs - car.bestLapMs : null;
    const bd = fmtDelta(bestDelta);
    const deltaHtml = bd ? `<span class="delta ${bestDelta > 0 ? "up" : "down"}">${bd}</span>` : "";

    return `<div class="car">
      <div class="car-head">
        <div class="num">${car.carNumber ?? pid}</div>
        <div class="id">
          <div class="driver">${car.currentDriver ?? "—"}</div>
          <div class="meta"><span class="cls">${car.classId ?? "—"}</span> · tur ${car.lapNumber ?? "—"} · ${car.pitCount ?? 0} pit ${car.inPit ? "· PİTTE" : ""}</div>
        </div>
        <div class="posbox">
          <div class="plabel">Sınıf</div>
          <div class="pval">P${car.classPosition ?? "—"}</div>
          <div class="overall">genel ${car.position ?? "—"}.</div>
        </div>
      </div>

      <div class="strip">
        <div class="cell"><div class="k">Son Tur</div><div class="v">${fmtLap(car.lastLapMs)}${deltaHtml}</div></div>
        <div class="cell"><div class="k">En İyi</div><div class="v ${car.bestLapIsPurple ? "purple" : ""}">${fmtLap(car.bestLapMs)}</div></div>
        <div class="cell"><div class="k">Önü</div><div class="v">${fmtGap(car.gapAheadMs)}</div></div>
        <div class="cell"><div class="k">Arkası</div><div class="v">${fmtGap(car.gapBehindMs)}</div></div>
      </div>

      <div class="battle">
        <div class="bl"><span>◄ ÖNDEKİ #${car.aheadCarNumber ?? "—"}</span><span>ARKADAKİ #${car.behindCarNumber ?? "—"} ►</span></div>
        <div class="gauge">
          <div class="center"></div>
          ${rivalHtml(car.aheadCarNumber, car.gapAheadMs, "ahead", aArrow)}
          <div class="me">#${car.carNumber ?? pid}</div>
          ${rivalHtml(car.behindCarNumber, car.gapBehindMs, "behind", bArrow)}
        </div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- events ---------- */
const META = {
  position_change: (p) => ({ ico: p.gained ? "▲" : "▼", accent: p.gained ? "var(--signal)" : "var(--amber)", txt: `Pozisyon <b>P${p.from} → P${p.to}</b>${p.gained ? " kazandı" : " kaybetti"}` }),
  pit_in:        (p) => ({ ico: "↳", accent: "var(--amber)", txt: `Pite girdi · <b>${p.pitCount}. pit</b>` }),
  pit_out:       () => ({ ico: "↰", accent: "var(--amber)", txt: `Pitten çıktı` }),
  best_lap:      (p) => ({ ico: "★", accent: "var(--signal)", txt: `Yeni kişisel en iyi · <b>${fmtLap(p.to)}</b>` }),
  fastest_lap:   (p) => ({ ico: "✦", accent: "var(--purple)", txt: `<b>GENEL EN HIZLI TUR</b> · ${fmtLap(p.bestLapMs)}` }),
  lap_completed: (p) => {
    const dp = fmtDelta(p.deltaPrevMs), db = fmtDelta(p.deltaBestMs);
    const tail = [dp != null ? `öncekine ${dp}sn` : null, db != null ? `en iyiye ${db}sn` : null].filter(Boolean).join(" · ");
    const slow = (p.deltaPrevMs ?? 0) > 0;
    return { ico: "⏱", accent: slow ? "var(--dim)" : "var(--signal)", txt: `Tur ${p.lap} · <b>${fmtLap(p.lapMs)}</b>${tail ? ` (${tail})` : ""}` };
  },
  battle_ahead:  (p) => ({ ico: "⚔", accent: "var(--red)", txt: `Öndeki <b>#${p.carNumber ?? "?"}</b> ile mücadele · ${fmtGap(p.gapMs)}` }),
  battle_behind: (p) => ({ ico: "⚔", accent: "var(--red)", txt: `Arkadaki <b>#${p.carNumber ?? "?"}</b> yaklaşıyor · ${fmtGap(p.gapMs)}` }),
  driver_change: (p) => ({ ico: "⇄", accent: "var(--txt)", txt: `Sürücü değişti · <b>${p.from} → ${p.to}</b>` }),
  gap_threshold: (p) => ({ ico: "≈", accent: "var(--amber)", txt: `Öndeki araca fark <b>${p.thresholdSeconds}sn</b> altına indi` }),
  flag:          (p) => ({ ico: "⚑", accent: "var(--flag)", txt: `Bayrak · <b>${p.to}</b>` }),
  stint_summary: (p) => ({ ico: "Σ", accent: "var(--purple)", txt: `<b>Stint özeti</b> · sınıf P${p.classPosition} · ${p.pitCount} pit · en iyi ${fmtLap(p.bestLapMs)} · ${p.currentDriver ?? "—"}` }),
};
const NOTIFY = new Set(["position_change", "pit_in", "pit_out", "best_lap", "fastest_lap", "battle_ahead", "battle_behind", "driver_change", "gap_threshold", "flag"]);

function addEvent(ev) {
  if (ev.type === "connection") {
    statusEl.textContent = ev.payload.status === "connected" ? "canlı" : ev.payload.status;
    statusEl.className = ev.payload.status === "connected" ? "ok" : "bad";
    return;
  }
  const meta = (META[ev.type] || (() => ({ ico: "•", accent: "var(--dim)", txt: ev.type })))(ev.payload ?? {});
  if (eventsEl.querySelector(".empty")) eventsEl.innerHTML = "";

  const li = document.createElement("li");
  li.className = "ev" + (ev.type.startsWith("battle") || ev.type === "fastest_lap" ? " flash" : "");
  li.style.setProperty("--accent", meta.accent);
  li.innerHTML = `<div class="ico">${meta.ico}</div><div class="body"><div class="txt">${meta.txt}</div></div><div class="time">${fmtTime(ev.at)}</div>`;
  eventsEl.prepend(li);
  while (eventsEl.children.length > 80) eventsEl.lastChild.remove();

  if (NOTIFY.has(ev.type) && "Notification" in window && Notification.permission === "granted") {
    const plain = meta.txt.replace(/<[^>]+>/g, "");
    new Notification(`#${ev.participantId} · WEC`, { body: plain });
  }
}

/* ---------- SSE ---------- */
function refreshState() { fetch("/api/state").then((r) => r.json()).then((s) => { renderCars(s); const c = Object.values(s)[0]; if (c) applyFlag(c.flag); }).catch(() => {}); }
refreshState();

// ?static : SSE açmadan tek seferlik render (önizleme/test için)
if (location.search.includes("static")) {
  const t = Date.now();
  [
    { type: "battle_behind", participantId: 91, at: t, payload: { carNumber: "23", gapMs: 461 } },
    { type: "lap_completed", participantId: 91, at: t - 9000, payload: { lap: 69, lapMs: 239136, deltaPrevMs: 1340, deltaBestMs: 4165 } },
    { type: "fastest_lap", participantId: 91, at: t - 60000, payload: { bestLapMs: 234971 } },
    { type: "position_change", participantId: 91, at: t - 120000, payload: { from: 3, to: 2, gained: true } },
    { type: "pit_out", participantId: 91, at: t - 300000, payload: {} },
    { type: "driver_change", participantId: 91, at: t - 360000, payload: { from: "Ayhancan GÜVEN", to: "James COTTINGHAM" } },
  ].reverse().forEach(addEvent);
} else {
  const es = new EventSource("/events");
  es.onopen = () => { statusEl.textContent = "canlı"; statusEl.className = "ok"; };
  es.onerror = () => { statusEl.textContent = "bağlantı koptu"; statusEl.className = "bad"; };
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "tick") { renderCars(ev.state); const c = Object.values(ev.state)[0]; if (c) applyFlag(c.flag); return; }
    if (ev.type === "flag") applyFlag(ev.payload.to);
    addEvent(ev);
  };
}
