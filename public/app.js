// public/app.js
const statusEl = document.getElementById("status");
const flagTextEl = document.getElementById("flagText");
const weatherEl = document.getElementById("weather");
const boardEl = document.getElementById("board");
const carInput = document.getElementById("carInput");
const carList = document.getElementById("carList");

document.getElementById("enableNotif").addEventListener("click", () => {
  if ("Notification" in window) Notification.requestPermission();
});

/* ---------- tema (dark / light) ---------- */
const themeBtn = document.getElementById("themeToggle");
function syncThemeIcon() {
  themeBtn.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "☀" : "☾";
}
themeBtn.addEventListener("click", () => {
  const light = document.documentElement.getAttribute("data-theme") === "light";
  if (light) document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", "light");
  localStorage.setItem("sw-theme", light ? "dark" : "light");
  syncThemeIcon();
});
syncThemeIcon();

/* ---------- formatters ---------- */
function fmtLap(ms) { if (ms == null) return "—"; const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(3).padStart(6, "0")}`; }
function fmtLapShort(ms) { if (ms == null) return "—"; const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(1).padStart(4, "0")}`; }
function fmtGap(ms) { return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`; }
function fmtDelta(ms) { if (ms == null) return null; const s = (ms / 1000).toFixed(1); return ms > 0 ? `+${s}` : s; }
function fmtTime(at) { const d = new Date(at); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function fmtDur(ms) { if (ms == null) return "—"; const s = Math.floor(ms / 1000); const p = (n) => String(n).padStart(2, "0"); return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`; }

/* ---------- yarış saati ---------- */
const clockEl = document.getElementById("clock");
const clockValEl = document.getElementById("clockVal");
function applyClock(rc) {
  if (!rc || rc.remainingMs == null) { clockEl.style.display = "none"; return; }
  clockEl.style.display = "";
  clockValEl.textContent = fmtDur(rc.remainingMs);
}

/* ---------- lastik rozeti ---------- */
function tireHtml(tire) {
  if (!tire) return "";
  const a = tire.ageLaps ?? 0;
  const cls = a <= 4 ? "fresh" : a <= 16 ? "mid" : a <= 27 ? "old" : "worn";
  return `<span class="tire ${cls}">🛞 ${tire.compound ?? "—"} <b>${a}t</b></span>`;
}

/* ---------- flag theming ---------- */
const FLAG_COLORS = { green: "#c6ff2e", yellow: "#ffb327", fcy: "#ffb327", slow: "#ffb327", safety: "#ffb327", sc: "#ffb327", red: "#ff3b46", chequered: "#ffffff", checkered: "#ffffff", white: "#ffffff" };
function applyFlag(flag) {
  const key = (flag || "").toString().toLowerCase().replace(/[^a-z]/g, "");
  document.documentElement.style.setProperty("--flag", FLAG_COLORS[key] || "#c6ff2e");
  flagTextEl.textContent = flag || "—";
}

/* ---------- trend (ardışık tick'ler) ---------- */
const lastSeen = {};
function arrowFor(prev, value) {
  if (prev == null || value == null) return { ch: "→", cls: "" };
  if (value < prev - 300) return { ch: "↑", cls: "closing" };
  if (value > prev + 300) return { ch: "↓", cls: "losing" };
  return { ch: "→", cls: "" };
}

/* ---------- battle gauge ---------- */
const GAUGE_MAX = 30000, HOT_MS = 2500;
function rivalPos(gapMs, side) { const f = Math.min(Math.abs(gapMs) / GAUGE_MAX, 1); return side === "ahead" ? 50 - f * 42 : 50 + f * 42; }
function rivalHtml(carNo, gapMs, side, arrow) {
  if (gapMs == null) {
    const left = side === "ahead" ? 8 : 92;
    return `<div class="rival" style="left:${left}%"><div class="gap">${side === "ahead" ? "LİDER" : "SONUNCU"}</div></div>`;
  }
  const hot = gapMs < HOT_MS ? " hot" : "";
  return `<div class="rival${hot}" style="left:${rivalPos(gapMs, side)}%"><div class="car-no">#${carNo ?? "?"}</div><div class="gap"><span class="arrow ${arrow.cls}">${arrow.ch}</span> ${fmtGap(gapMs)}</div></div>`;
}

/* ---------- sektörler ---------- */
const SEC_CLASS = { Purple: "purple", Green: "green", Yellow: "yellow", Gray: "gray" };
function fmtSec(ms) { return ms == null ? "—" : (ms / 1000).toFixed(3); }
function sectorsHtml(sectors) {
  const cells = [1, 2, 3].map((n) => {
    const s = (sectors || []).find((x) => x.num === n);
    const cls = s ? (SEC_CLASS[s.color] || "gray") : "gray";
    return `<div class="sec ${cls}"><div class="sk">S${n}</div><div class="sv">${s ? fmtSec(s.ms) : "—"}</div></div>`;
  });
  return `<div class="sectors">${cells.join("")}</div>`;
}

/* ---------- tur zamanı grafiği (SVG) ---------- */
function lapChartSvg(history, bestMs) {
  const laps = (history || []).filter((l) => l.ms > 0);
  if (laps.length < 2) return `<svg viewBox="0 0 100 40" preserveAspectRatio="none"></svg>`;
  const valids = laps.filter((l) => l.valid).map((l) => l.ms).sort((a, b) => a - b);
  const med = valids.length ? valids[Math.floor(valids.length / 2)] : laps[0].ms;
  const cap = med * 1.08;
  const vals = laps.map((l) => Math.min(l.ms, cap));
  const min = Math.min(...vals), max = Math.max(...vals), span = Math.max(max - min, 1);
  const W = 100, H = 40, pad = 3;
  const x = (i) => pad + (i / (laps.length - 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const area = `${pad},${H - pad} ${pts.join(" ")} ${(W - pad)},${H - pad}`;
  const bestY = (bestMs != null && bestMs >= min && bestMs <= max) ? y(bestMs).toFixed(2) : null;
  const pitDots = laps.map((l, i) => (!l.valid || l.ms >= cap) ? `<circle class="pit" cx="${x(i).toFixed(2)}" cy="${y(Math.min(l.ms, cap)).toFixed(2)}" r="1.4"/>` : "").join("");
  // her tura görünmez hover noktası: tooltip ile tur no + süre
  const hover = laps.map((l, i) => {
    const d = bestMs != null ? fmtDelta(l.ms - bestMs) : null;
    return `<circle cx="${x(i).toFixed(2)}" cy="${y(vals[i]).toFixed(2)}" r="2.6" fill="transparent"><title>Tur ${l.lap} · ${fmtLap(l.ms)}${d ? ` (en iyiye ${d}sn)` : ""}${l.valid ? "" : " · geçersiz/pit"}</title></circle>`;
  }).join("");
  const last = laps.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polygon class="area" points="${area}"/>
    ${bestY ? `<line class="best" x1="${pad}" y1="${bestY}" x2="${W - pad}" y2="${bestY}"/>` : ""}
    <polyline class="line" points="${pts.join(" ")}"/>${pitDots}
    <circle class="dot" cx="${x(last).toFixed(2)}" cy="${y(vals[last]).toFixed(2)}" r="1.8"/>${hover}
  </svg>`;
}

/* ---------- son turlar (süre çipleri) ---------- */
function lapChipsHtml(history, bestMs) {
  const laps = (history || []).filter((l) => l.ms > 0);
  if (!laps.length) return "";
  const validMs = laps.filter((l) => l.valid).map((l) => l.ms).sort((a, b) => a - b);
  const best = bestMs ?? (validMs[0] ?? laps[0].ms);
  const med = validMs.length ? validMs[Math.floor(validMs.length / 2)] : best; // stint temposu
  const chips = laps.slice(-22).map((l) => {
    let cls = "gray";
    if (!l.valid) cls = "pit";
    else if (l.ms <= best) cls = "purple";              // en iyi tur
    else { const d = l.ms - med; cls = d <= -300 ? "green" : d <= 600 ? "gray" : d <= 2000 ? "amber" : "red"; } // stint temposuna göre
    return `<div class="lap ${cls}" title="Tur ${l.lap} · ${fmtLap(l.ms)}"><div class="ln">L${l.lap}</div><div class="lt">${fmtLapShort(l.ms)}</div></div>`;
  }).join("");
  return `<div class="laps">${chips}</div>`;
}

/* ---------- hava ---------- */
function renderWeather(w) {
  if (!w) { weatherEl.innerHTML = `<span class="wx">Hava verisi bekleniyor…</span>`; return; }
  const rain = /rain|shower|storm|wet/i.test(w.sky || "");
  weatherEl.innerHTML = `
    <span class="wx ${rain ? "rain" : ""}"><span class="sky">${w.sky ?? "—"}</span></span>
    <span class="wx">Hava <b>${w.airTemp ?? "—"}°</b></span>
    <span class="wx">Pist <b>${w.trackTemp ?? "—"}°</b></span>
    <span class="wx">Nem <b>${w.humidity ?? "—"}%</b></span>
    <span class="wx">Rüzgar <b>${w.windKph ?? "—"}</b> kph ${w.windDir ?? ""}</span>`;
}

/* ---------- araç kartı (panel içeriği) ---------- */
function carCardHtml(car) {
  const pid = car.participantId;
  const aArrow = arrowFor(lastSeen[pid]?.gapAheadMs, car.gapAheadMs);
  const bArrow = arrowFor(lastSeen[pid]?.gapBehindMs, car.gapBehindMs);
  lastSeen[pid] = { gapAheadMs: car.gapAheadMs, gapBehindMs: car.gapBehindMs };
  const bestDelta = (car.lastLapMs != null && car.bestLapMs != null) ? car.lastLapMs - car.bestLapMs : null;
  const bd = fmtDelta(bestDelta);
  const deltaHtml = bd ? `<span class="delta ${bestDelta > 0 ? "up" : "down"}">${bd}</span>` : "";
  return `<div class="car">
    <button class="rm" data-pid="${pid}" title="Takipten çıkar">✕</button>
    <div class="car-head">
      <div class="num">${car.carNumber ?? pid}</div>
      <div class="id">
        <div class="driver">${car.currentDriver ?? "—"}</div>
        <div class="meta"><span class="cls">${car.classId ?? "—"}</span> · tur ${car.lapNumber ?? "—"} · ${car.pitCount ?? 0} pit ${car.inPit ? "· PİTTE" : ""}${tireHtml(car.tire)}</div>
      </div>
      <div class="posbox"><div class="plabel">Sınıf</div><div class="pval">P${car.classPosition ?? "—"}</div><div class="overall">genel ${car.position ?? "—"}.</div></div>
    </div>
    <div class="strip">
      <div class="cell"><div class="k">Son Tur</div><div class="v">${fmtLap(car.lastLapMs)}${deltaHtml}</div></div>
      <div class="cell"><div class="k">En İyi</div><div class="v ${car.bestLapIsPurple ? "purple" : ""}">${fmtLap(car.bestLapMs)}</div></div>
      <div class="cell"><div class="k">Top Hız</div><div class="v">${car.topSpeedKph ? car.topSpeedKph + "<span class='delta' style='color:var(--dim)'>kph</span>" : "—"}</div></div>
      <div class="cell"><div class="k">Pit</div><div class="v">${car.pitCount ?? 0}</div></div>
    </div>
    ${sectorsHtml(car.sectors)}
    <div class="battle">
      <div class="bl"><span>◄ ÖNDEKİ #${car.aheadCarNumber ?? "—"}</span><span>ARKADAKİ #${car.behindCarNumber ?? "—"} ►</span></div>
      <div class="gauge"><div class="center"></div>${rivalHtml(car.aheadCarNumber, car.gapAheadMs, "ahead", aArrow)}<div class="me">#${car.carNumber ?? pid}</div>${rivalHtml(car.behindCarNumber, car.gapBehindMs, "behind", bArrow)}</div>
    </div>
    <div class="chart">
      <div class="cl"><span>TUR ZAMANI · son ${(car.lapHistory || []).length} tur</span><span>en iyi ${fmtLap(car.bestLapMs)}</span></div>
      ${lapChartSvg(car.lapHistory, car.bestLapMs)}
      ${lapChipsHtml(car.lapHistory, car.bestLapMs)}
    </div>`;
}

/* ---------- panel yönetimi (araç başına kart + feed) ---------- */
const panels = {}; // pid -> { panel, cardSlot, feedEl }
const carNumbers = {}; // pid -> araç no (bildirim başlığı için)
function ensurePanel(pid, carNumber) {
  if (panels[pid]) return panels[pid];
  const panel = document.createElement("div");
  panel.className = "carpanel";
  const cardSlot = document.createElement("div");
  const feedTitle = document.createElement("div");
  feedTitle.className = "feed-title";
  feedTitle.textContent = `#${carNumber ?? pid} · CANLI AKIŞ`;
  const feedEl = document.createElement("ul");
  feedEl.className = "feed";
  feedEl.innerHTML = `<li class="empty">Henüz olay yok</li>`;
  panel.append(cardSlot, feedTitle, feedEl);
  boardEl.appendChild(panel);
  panels[pid] = { panel, cardSlot, feedEl, feedTitle };
  return panels[pid];
}
function removePanel(pid) {
  if (!panels[pid]) return;
  panels[pid].panel.remove();
  delete panels[pid];
}

function renderBoard(state) {
  const empty = boardEl.querySelector(".board-empty");
  const pids = Object.keys(state).map(Number);
  if (!pids.length) {
    Object.keys(panels).forEach((p) => removePanel(Number(p)));
    if (!boardEl.querySelector(".board-empty")) boardEl.innerHTML = `<div class="board-empty">Araç bekleniyor… Sağ üstten araç no ekle.</div>`;
    return;
  }
  if (empty) empty.remove();
  for (const pid of pids) {
    const car = state[pid];
    carNumbers[pid] = car.carNumber;
    const p = ensurePanel(pid, car.carNumber);
    p.feedTitle.textContent = `#${car.carNumber ?? pid} · CANLI AKIŞ`;
    p.cardSlot.innerHTML = carCardHtml(car);
    const laps = p.cardSlot.querySelector(".laps");
    if (laps) laps.scrollLeft = laps.scrollWidth; // en yeni turu göster
  }
  // artık izlenmeyen panelleri kaldır
  for (const p of Object.keys(panels)) if (!pids.includes(Number(p))) removePanel(Number(p));
  const first = state[pids[0]];
  if (first) { renderWeather(first.weather); applyFlag(first.flag); applyClock(first.raceClock); }
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
    return { ico: "⏱", accent: (p.deltaPrevMs ?? 0) > 0 ? "var(--dim)" : "var(--signal)", txt: `Tur ${p.lap} · <b>${fmtLap(p.lapMs)}</b>${tail ? ` (${tail})` : ""}` };
  },
  battle_ahead:  (p) => ({ ico: "⚔", accent: "var(--red)", txt: `Öndeki <b>#${p.carNumber ?? "?"}</b> ile mücadele · ${fmtGap(p.gapMs)}` }),
  battle_behind: (p) => ({ ico: "⚔", accent: "var(--red)", txt: `Arkadaki <b>#${p.carNumber ?? "?"}</b> yaklaşıyor · ${fmtGap(p.gapMs)}` }),
  driver_change: (p) => ({ ico: "⇄", accent: "var(--txt)", txt: `Sürücü değişti · <b>${p.from} → ${p.to}</b>` }),
  gap_threshold: (p) => ({ ico: "≈", accent: "var(--amber)", txt: `Öndeki araca fark <b>${p.thresholdSeconds}sn</b> altına indi` }),
  flag:          (p) => ({ ico: "⚑", accent: "var(--flag)", txt: `Bayrak · <b>${p.to}</b>` }),
  weather_change:(p) => ({ ico: "☁", accent: "var(--amber)", txt: `Hava değişti · <b>${p.from} → ${p.to}</b>${p.trackTemp != null ? ` · pist ${p.trackTemp}°` : ""}` }),
  rc_message:    (p) => ({ ico: "📣", accent: "var(--amber)", txt: `Yarış kontrol · <b>${p.text || "mesaj"}</b>` }),
  retired:       (p) => ({ ico: "⏹", accent: "var(--red)", txt: `<b>ÇEKİLDİ</b> · tur ${p.lap ?? "—"}` }),
  time_loss:     (p) => ({ ico: "⚠", accent: "var(--amber)", txt: `Zaman kaybı · tur ${p.lap}${p.diffMs != null ? ` · tempodan +${(p.diffMs / 1000).toFixed(1)}sn` : ""}` }),
  stint_summary: (p) => ({ ico: "Σ", accent: "var(--purple)", txt: `<b>Stint özeti</b> · sınıf P${p.classPosition} · ${p.pitCount} pit · en iyi ${fmtLap(p.bestLapMs)} · ${p.currentDriver ?? "—"}` }),
};
const NOTIFY = new Set(["position_change", "pit_in", "pit_out", "best_lap", "fastest_lap", "battle_ahead", "battle_behind", "driver_change", "gap_threshold", "flag", "weather_change", "rc_message", "retired", "time_loss"]);

function addEvent(ev, silent = false) {
  if (ev.type === "connection") {
    statusEl.textContent = ev.payload.status === "connected" ? "canlı" : ev.payload.status;
    statusEl.className = ev.payload.status === "connected" ? "ok" : "bad";
    return;
  }
  const p = panels[ev.participantId];
  if (!p) return; // bu araç için panel yok (izlenmiyor)
  const meta = (META[ev.type] || (() => ({ ico: "•", accent: "var(--dim)", txt: ev.type })))(ev.payload ?? {});
  const emptyLi = p.feedEl.querySelector(".empty");
  if (emptyLi) emptyLi.remove();
  const li = document.createElement("li");
  li.className = "ev" + (ev.type.startsWith("battle") || ev.type === "fastest_lap" ? " flash" : "");
  if (silent) li.style.animation = "none";
  li.style.setProperty("--accent", meta.accent);
  li.innerHTML = `<div class="ico">${meta.ico}</div><div class="body"><div class="txt">${meta.txt}</div></div><div class="time">${fmtTime(ev.at)}</div>`;
  p.feedEl.prepend(li);
  while (p.feedEl.children.length > 120) p.feedEl.lastChild.remove();
  if (!silent && NOTIFY.has(ev.type) && "Notification" in window && Notification.permission === "granted") {
    new Notification(`#${carNumbers[ev.participantId] ?? ev.participantId} · WEC`, { body: meta.txt.replace(/<[^>]+>/g, "") });
  }
}

/* ---------- araç ekle/çıkar ---------- */
function loadCars() {
  return fetch("/api/cars").then((r) => r.json()).then((cars) => {
    carList.innerHTML = (cars || []).map((c) => `<option value="${c.carNumber}">${c.classId ?? ""}${c.team ? " · " + c.team : ""}</option>`).join("");
  }).catch(() => {});
}
document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = carInput.value.trim();
  if (!val) return;
  fetch("/api/tracked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add: val }) })
    .then((r) => r.json())
    .then((res) => {
      if (res.ok) { carInput.value = ""; refreshState(); }
      else { carInput.style.borderColor = "var(--red)"; setTimeout(() => (carInput.style.borderColor = ""), 1200); }
    }).catch(() => {});
});
boardEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".rm");
  if (!btn) return;
  const pid = Number(btn.dataset.pid);
  fetch("/api/tracked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remove: pid }) })
    .then(() => { removePanel(pid); delete lastSeen[pid]; });
});

/* ---------- init + SSE ---------- */
function refreshState() { return fetch("/api/state").then((r) => r.json()).then(renderBoard).catch(() => {}); }

loadCars();

if (location.search.includes("static")) {
  refreshState().then(() => {
    const t = Date.now();
    const pid = Number(Object.keys(panels)[0]) || 400061;
    [
      { type: "rc_message", participantId: pid, at: t + 1000, payload: { text: "SLOW CAR PIT ENTRY ROAD", lap: 100 } },
      { type: "time_loss", participantId: pid, at: t - 30000, payload: { lap: 98, diffMs: 3012 } },
      { type: "battle_behind", participantId: pid, at: t, payload: { carNumber: "23", gapMs: 461 } },
      { type: "lap_completed", participantId: pid, at: t - 9000, payload: { lap: 69, lapMs: 239136, deltaPrevMs: 1340, deltaBestMs: 4165 } },
      { type: "weather_change", participantId: pid, at: t - 90000, payload: { from: "Cloudy", to: "Light Rain", trackTemp: 29 } },
      { type: "fastest_lap", participantId: pid, at: t - 60000, payload: { bestLapMs: 234971 } },
      { type: "position_change", participantId: pid, at: t - 120000, payload: { from: 3, to: 2, gained: true } },
      { type: "pit_out", participantId: pid, at: t - 300000, payload: {} },
    ].reverse().forEach((ev) => addEvent(ev));
  });
} else {
  refreshState()
    .then(() => fetch("/api/events").then((r) => r.json()).then((evs) => evs.forEach((ev) => addEvent(ev, true))).catch(() => {}))
    .finally(() => {
      const es = new EventSource("/events");
      es.onopen = () => { statusEl.textContent = "canlı"; statusEl.className = "ok"; };
      es.onerror = () => { statusEl.textContent = "bağlantı koptu"; statusEl.className = "bad"; };
      es.onmessage = (e) => {
        const ev = JSON.parse(e.data);
        if (ev.type === "tick") { renderBoard(ev.state); return; }
        if (ev.type === "flag") applyFlag(ev.payload.to);
        addEvent(ev);
      };
    });
}
