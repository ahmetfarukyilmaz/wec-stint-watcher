// public/app.js
const statusEl = document.getElementById("status");
const flagTextEl = document.getElementById("flagText");
const weatherEl = document.getElementById("weather");
const boardEl = document.getElementById("board");
const globalfeedEl = document.getElementById("globalfeed");
const globalEventsEl = document.getElementById("globalEvents");
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
function fmtAgo(at) { if (at == null) return "—"; const s = Math.floor((Date.now() - at) / 1000); if (s < 60) return "az önce"; const m = Math.floor(s / 60); if (m < 60) return `${m} dk önce`; const h = Math.floor(m / 60); return `${h}s ${m % 60}dk önce`; }
function fmtSecs(ms) { return ms == null ? "—" : `${(ms / 1000).toFixed(1)}sn`; }

/* ---------- yarış saati ---------- */
const clockEl = document.getElementById("clock");
const clockValEl = document.getElementById("clockVal");
function applyClock(rc) {
  if (!rc || rc.remainingMs == null) { clockEl.style.display = "none"; return; }
  clockEl.style.display = "";
  clockValEl.textContent = fmtDur(rc.remainingMs);
}

/* ---------- FIA sürücü kategorisi ---------- */
const CAT = { P: { label: "PLATINUM", cls: "p" }, G: { label: "GOLD", cls: "g" }, S: { label: "SILVER", cls: "s" }, B: { label: "BRONZE", cls: "b" } };
function catBadge(cat, full) { const c = CAT[cat]; return c ? `<span class="cat ${c.cls}">${full ? c.label : cat}</span>` : ""; }
function fmtHM(sec) { if (sec == null) return ""; const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}:${String(m).padStart(2, "0")}` : `${m}dk`; }
function lineupInner(drivers) {
  if (!drivers || !drivers.length) return "";
  return drivers.map((d) => {
    const t = d.seconds != null ? ` <span class="dt">${fmtHM(d.seconds)}</span>` : "";
    return `<span class="d ${d.current ? "current" : ""}">${d.name}${catBadge(d.cat, false)}${t}</span>`;
  }).join("");
}

/* ---------- lastik rozeti (compound; API'nin yaş verisi güvenilmez, stint zaten gösteriliyor) ---------- */
const TIRE_CLS = { SOFT: "soft", MEDIUM: "medium", HARD: "hard", INTERMEDIATE: "inter", WET: "wet" };
function tireHtml(tire) {
  if (!tire || !tire.compound) return "";
  const cls = TIRE_CLS[String(tire.compound).toUpperCase()] || "medium";
  return `<span class="tire ${cls}">🛞 ${tire.compound}</span>`;
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

/* ---------- yerinde güncelleme yardımcıları (titreme yok) ---------- */
function setText(el, v) { const s = v == null ? "" : String(v); if (el && el.textContent !== s) el.textContent = s; }
function setHTML(card, f, html) { if (card.sig[f] !== html) { card.fields[f].innerHTML = html; card.sig[f] = html; } }
function setClass(el, cls) { if (el && el.className !== cls) el.className = cls; }

function metaInner(car) {
  return `<span class="cls">${car.classId ?? "—"}</span> · tur ${car.lapNumber ?? "—"} · ${car.pitCount ?? 0} pit ${car.inPit ? "· PİTTE" : ""}${tireHtml(car.tire)}`;
}
function pitlineInner(car) {
  const pit = car.lastPit
    ? `<span>Son pit <b>tur ${car.lastPit.lap ?? "—"}</b> · <b>${fmtAgo(car.lastPit.at)}</b> · duruş <b>${fmtSecs(car.lastPit.durationMs)}</b></span>`
    : `<span>Henüz pit yok</span>`;
  return `${pit}<span>Stint <b class="hl">${car.stintLaps ?? "—"} tur</b></span>`;
}

/* ---------- hava (yalnızca değişince güncelle) ---------- */
let weatherSig = null;
function renderWeather(w) {
  const html = !w
    ? `<span class="wx">Hava verisi bekleniyor…</span>`
    : `<span class="wx ${/rain|shower|storm|wet/i.test(w.sky || "") ? "rain" : ""}"><span class="sky">${w.sky ?? "—"}</span></span>
       <span class="wx">Hava <b>${w.airTemp ?? "—"}°</b></span>
       <span class="wx">Pist <b>${w.trackTemp ?? "—"}°</b></span>
       <span class="wx">Nem <b>${w.humidity ?? "—"}%</b></span>
       <span class="wx">Rüzgar <b>${w.windKph ?? "—"}</b> kph ${w.windDir ?? ""}</span>`;
  if (html !== weatherSig) { weatherEl.innerHTML = html; weatherSig = html; }
}

/* ---------- kart: bir kez kur, sonra yerinde güncelle ---------- */
function buildCard(pid) {
  const el = document.createElement("div");
  el.className = "car";
  el.innerHTML = `
    <button class="pin" data-f="pin" data-pid="${pid}">📌 Sabitle</button>
    <div class="car-head">
      <div class="num" data-f="num"></div>
      <div class="id">
        <div class="driver"><span data-f="driver"></span><span data-f="driverCat"></span></div>
        <div class="teamname" data-f="team"></div>
        <div class="meta" data-f="meta"></div>
        <div class="lineup" data-f="lineup"></div>
      </div>
      <div class="posbox"><div class="plabel">Sınıf</div><div class="pval" data-f="classPos"></div><div class="overall" data-f="overall"></div></div>
    </div>
    <div class="strip">
      <div class="cell"><div class="k">Son Tur</div><div class="v"><span data-f="lastLap"></span><span data-f="lastDelta"></span></div></div>
      <div class="cell"><div class="k">En İyi</div><div class="v" data-f="bestLap"></div></div>
      <div class="cell"><div class="k" data-f="c3k"></div><div class="v" data-f="c3v"></div></div>
      <div class="cell"><div class="k">Pit</div><div class="v" data-f="pit"></div></div>
    </div>
    <div class="pitline" data-f="pitline"></div>
    <div class="sectors">
      <div class="sec" data-f="sec1"><div class="sk">S1</div><div class="sv"></div></div>
      <div class="sec" data-f="sec2"><div class="sk">S2</div><div class="sv"></div></div>
      <div class="sec" data-f="sec3"><div class="sk">S3</div><div class="sv"></div></div>
    </div>
    <div class="battle">
      <div class="bl"><span data-f="blAhead"></span><span data-f="blBehind"></span></div>
      <div class="gauge"><div class="center"></div><div data-f="rAhead"></div><div class="me" data-f="me"></div><div data-f="rBehind"></div></div>
    </div>
    <div class="chart">
      <div class="cl"><span data-f="chartLabel"></span><span data-f="chartBest"></span></div>
      <div data-f="chartBody"></div>
    </div>`;
  const fields = {};
  el.querySelectorAll("[data-f]").forEach((n) => { fields[n.dataset.f] = n; });
  return { el, fields, sig: {} };
}

function updateCard(card, car) {
  const pid = car.participantId, F = card.fields;
  const aArrow = arrowFor(lastSeen[pid]?.gapAheadMs, car.gapAheadMs);
  const bArrow = arrowFor(lastSeen[pid]?.gapBehindMs, car.gapBehindMs);
  lastSeen[pid] = { gapAheadMs: car.gapAheadMs, gapBehindMs: car.gapBehindMs };

  setText(F.num, car.carNumber ?? pid);
  F.pin.dataset.car = car.carNumber ?? "";
  F.pin.classList.toggle("on", !!car.pinned);
  setText(F.pin, car.pinned ? "📌 Sabit" : "📌 Sabitle");
  F.pin.title = car.pinned ? "Sabitlemeyi kaldır" : "Sabitle — pozisyonu ne olursa olsun kalsın";
  setText(F.driver, car.currentDriver ?? "—");
  setHTML(card, "driverCat", car.currentDriverCat ? " " + catBadge(car.currentDriverCat, true) : "");
  setText(F.team, car.team ?? "");
  setHTML(card, "meta", metaInner(car));
  setHTML(card, "lineup", lineupInner(car.drivers));
  setText(F.classPos, "P" + (car.classPosition ?? "—"));
  setText(F.overall, "genel " + (car.position ?? "—") + ".");

  setText(F.lastLap, fmtLap(car.lastLapMs));
  const bd = (car.lastLapMs != null && car.bestLapMs != null) ? car.lastLapMs - car.bestLapMs : null;
  setHTML(card, "lastDelta", bd != null ? `<span class="delta ${bd > 0 ? "up" : "down"}">${fmtDelta(bd)}</span>` : "");
  setText(F.bestLap, fmtLap(car.bestLapMs));
  setClass(F.bestLap, "v" + (car.bestLapIsPurple ? " purple" : ""));
  if (car.topSpeedKph) { setText(F.c3k, "Top Hız"); setHTML(card, "c3v", `${car.topSpeedKph}<span class='delta' style='color:var(--dim)'>kph</span>`); }
  else { setText(F.c3k, "Lidere"); setHTML(card, "c3v", fmtGap(car.gapToFirstMs)); }
  setText(F.pit, car.pitCount ?? 0);

  setHTML(card, "pitline", pitlineInner(car));

  for (const [f, n] of [["sec1", 1], ["sec2", 2], ["sec3", 3]]) {
    const s = (car.sectors || []).find((x) => x.num === n);
    setClass(F[f], `sec ${s ? (SEC_CLASS[s.color] || "gray") : "gray"}`);
    setText(F[f].querySelector(".sv"), s ? fmtSec(s.ms) : "—");
  }

  setText(F.blAhead, `◄ ÖNDEKİ #${car.aheadCarNumber ?? "—"}`);
  setText(F.blBehind, `ARKADAKİ #${car.behindCarNumber ?? "—"} ►`);
  setText(F.me, `#${car.carNumber ?? pid}`);
  setHTML(card, "rAhead", rivalHtml(car.aheadCarNumber, car.gapAheadMs, "ahead", aArrow));
  setHTML(card, "rBehind", rivalHtml(car.behindCarNumber, car.gapBehindMs, "behind", bArrow));

  // grafik + çipler: yalnızca yeni tur/best gelince yeniden çiz (her tick değil)
  const chartSig = `${(car.lapHistory || []).length}:${car.lapNumber}:${car.bestLapMs}`;
  if (card.sig.__chart !== chartSig) {
    card.sig.__chart = chartSig;
    setText(F.chartLabel, `TUR ZAMANI · son ${(car.lapHistory || []).length} tur`);
    setText(F.chartBest, `en iyi ${fmtLap(car.bestLapMs)}`);
    F.chartBody.innerHTML = lapChartSvg(car.lapHistory, car.bestLapMs) + lapChipsHtml(car.lapHistory, car.bestLapMs);
    const laps = F.chartBody.querySelector(".laps");
    if (laps) laps.scrollLeft = laps.scrollWidth;
  }
}

/* ---------- panel yönetimi (araç başına kart + feed) ---------- */
const panels = {}; // pid -> { panel, card, feedEl, feedTitle }
const carNumbers = {}; // pid -> araç no (bildirim başlığı için)
let lastOrderSig = ""; // panel sırası imzası — yalnızca değişince yeniden diz
function ensurePanel(pid, carNumber) {
  if (panels[pid]) return panels[pid];
  const panel = document.createElement("div");
  panel.className = "carpanel";
  const card = buildCard(pid);
  const feedTitle = document.createElement("div");
  feedTitle.className = "feed-title";
  feedTitle.textContent = `#${carNumber ?? pid} · CANLI AKIŞ`;
  const feedEl = document.createElement("ul");
  feedEl.className = "feed";
  feedEl.innerHTML = `<li class="empty">Henüz olay yok</li>`;
  panel.append(card.el, feedTitle, feedEl);
  boardEl.appendChild(panel);
  panels[pid] = { panel, card, feedEl, feedTitle };
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
    setText(p.feedTitle, `#${car.carNumber ?? pid} · CANLI AKIŞ`);
    updateCard(p.card, car); // yerinde güncelleme — DOM yeniden kurulmaz
  }
  for (const p of Object.keys(panels)) if (!pids.includes(Number(p))) removePanel(Number(p));
  // pozisyona göre sırala (sınıf grubu + sınıf içi pozisyon) — yalnızca SIRA DEĞİŞTİYSE yeniden diz
  const order = pids.slice().sort((a, b) => {
    const ca = state[a], cb = state[b];
    const cl = (CLASS_ORDER[ca.classId] ?? 9) - (CLASS_ORDER[cb.classId] ?? 9);
    return cl || (ca.classPosition ?? 999) - (cb.classPosition ?? 999);
  });
  const orderSig = order.join(",");
  if (orderSig !== lastOrderSig) {
    lastOrderSig = orderSig;
    for (const pid of order) boardEl.appendChild(panels[pid].panel); // sadece sıra değişince taşı
  }
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

const GLOBAL_TYPES = new Set(["flag", "weather_change", "rc_message"]);
function addEvent(ev, silent = false) {
  if (ev.type === "connection") {
    statusEl.textContent = ev.payload.status === "connected" ? "canlı" : ev.payload.status;
    statusEl.className = ev.payload.status === "connected" ? "ok" : "bad";
    return;
  }
  const isGlobal = GLOBAL_TYPES.has(ev.type);
  const feedEl = isGlobal ? globalEventsEl : panels[ev.participantId]?.feedEl;
  if (!feedEl) return; // bu araç için panel yok (izlenmiyor)
  const meta = (META[ev.type] || (() => ({ ico: "•", accent: "var(--dim)", txt: ev.type })))(ev.payload ?? {});
  const emptyLi = feedEl.querySelector(".empty");
  if (emptyLi) emptyLi.remove();
  const li = document.createElement("li");
  li.className = "ev" + (ev.type.startsWith("battle") || ev.type === "fastest_lap" ? " flash" : "");
  if (silent) li.style.animation = "none";
  li.style.setProperty("--accent", meta.accent);
  li.innerHTML = `<div class="ico">${meta.ico}</div><div class="body"><div class="txt">${meta.txt}</div></div><div class="time">${fmtTime(ev.at)}</div>`;
  feedEl.prepend(li);
  while (feedEl.children.length > 120) feedEl.lastChild.remove();
  if (isGlobal) updateGfCount();
  if (!silent && NOTIFY.has(ev.type) && "Notification" in window && Notification.permission === "granted") {
    const title = isGlobal ? "WEC · Yarış Kontrol" : `#${carNumbers[ev.participantId] ?? ev.participantId} · WEC`;
    new Notification(title, { body: meta.txt.replace(/<[^>]+>/g, "") });
  }
}

/* ---------- araç ekle/çıkar + akıllı takip ---------- */
const smartClassEl = document.getElementById("smartClass");
const smartNEl = document.getElementById("smartN");

function loadCars() {
  return fetch("/api/cars").then((r) => r.json()).then((cars) => {
    carList.innerHTML = (cars || []).map((c) => `<option value="${c.carNumber}">${c.classId ?? ""}${c.team ? " · " + c.team : ""}</option>`).join("");
    // akıllı sınıf seçenekleri (mevcut sınıflar + Genel)
    const classes = [...new Set((cars || []).map((c) => c.classId).filter(Boolean))];
    const cur = smartClassEl.value;
    smartClassEl.innerHTML = `<option value="">Kapalı</option><option value="__overall">Genel</option>` +
      classes.map((cl) => `<option value="${cl}">${cl}</option>`).join("");
    smartClassEl.value = cur;
  }).catch(() => {});
}

function loadSmart() {
  return fetch("/api/tracking").then((r) => r.json()).then((t) => {
    if (t.smartClass != null) smartClassEl.value = t.smartClass;
    smartNEl.value = t.topN ?? 0;
  }).catch(() => {});
}
function pushSmart() {
  const classId = smartClassEl.value || null;
  const topN = Number(smartNEl.value) || 0;
  fetch("/api/smart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, topN }) })
    .then(() => refreshState());
}
smartClassEl.addEventListener("change", pushSmart);
smartNEl.addEventListener("change", pushSmart);
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
  const btn = e.target.closest(".pin");
  if (!btn) return;
  const pid = Number(btn.dataset.pid);
  const pinned = btn.classList.contains("on");
  const body = pinned ? { remove: pid } : { add: btn.dataset.car };
  fetch("/api/tracked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(() => { if (pinned) { delete lastSeen[pid]; } refreshState(); });
});

/* ---------- genel feed: katla/aç + sayaç ---------- */
const gfTitle = document.getElementById("gfTitle");
const gfCount = document.getElementById("gfCount");
if (localStorage.getItem("sw-gf-collapsed") === "1") globalfeedEl.classList.add("collapsed");
gfTitle.addEventListener("click", () => {
  const c = globalfeedEl.classList.toggle("collapsed");
  localStorage.setItem("sw-gf-collapsed", c ? "1" : "0");
});
function updateGfCount() {
  const n = [...globalEventsEl.children].filter((li) => !li.classList.contains("empty")).length;
  gfCount.textContent = n ? `(${n})` : "";
}

/* ---------- sekmeler + sıralama ---------- */
const standingsEl = document.getElementById("standings");
let currentView = "board";
const CLASS_ORDER = { HYPERCAR: 0, LMP2: 1, LMGT3: 2, GTE: 3 };

document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
function switchView(v) {
  currentView = v;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  boardEl.hidden = v !== "board";
  globalfeedEl.hidden = v !== "board";
  standingsEl.hidden = v !== "standings";
  if (v === "standings") renderStandings();
}

function renderStandings() {
  Promise.all([
    fetch("/api/cars").then((r) => r.json()).catch(() => []),
    fetch("/api/tracking").then((r) => r.json()).catch(() => ({ pinned: [], effective: [] })),
  ]).then(([cars, tracking]) => {
    const pinnedSet = new Set((tracking.pinned || []).map(Number));
    const effSet = new Set((tracking.effective || []).map(Number));
    const byClass = {};
    for (const c of cars || []) (byClass[c.classId || "—"] ??= []).push(c);
    const classes = Object.keys(byClass).sort((a, b) => (CLASS_ORDER[a] ?? 9) - (CLASS_ORDER[b] ?? 9));
    standingsEl.innerHTML = classes.map((cls) => {
      const rows = byClass[cls].sort((a, b) => (a.classPos ?? 999) - (b.classPos ?? 999)).map((c) => {
        const pinned = pinnedSet.has(c.pid);
        const auto = !pinned && effSet.has(c.pid);
        const gap = c.classPos === 1 ? "Lider" : (c.gapToFirstMs > 0 ? fmtGap(c.gapToFirstMs) : "—");
        return `<tr class="${pinned || auto ? "tracked" : ""}">
          <td class="pos">${c.classPos ?? "—"}</td>
          <td class="no">#${c.carNumber}</td>
          <td>${c.team ?? "—"}${auto ? ` <span class="autotag">oto</span>` : ""}</td>
          <td class="gap">${gap}</td>
          <td><button class="add ${pinned ? "on" : ""}" data-pid="${c.pid}" data-car="${c.carNumber}" title="${pinned ? "Sabitlemeyi kaldır" : "Sabitle"}">${pinned ? "📌" : "+"}</button></td>
        </tr>`;
      }).join("");
      return `<div class="stClass">${cls} · ${byClass[cls].length} araç</div>
        <table class="standings"><thead><tr><th>Sınıf P</th><th>No</th><th>Takım</th><th>Lidere</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    }).join("") || `<div class="board-empty">Veri bekleniyor…</div>`;
  });
}

standingsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".add");
  if (!btn) return;
  const pinned = btn.classList.contains("on");
  const body = pinned ? { remove: Number(btn.dataset.pid) } : { add: btn.dataset.car };
  fetch("/api/tracked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .then(() => { if (pinned) delete lastSeen[Number(btn.dataset.pid)]; renderStandings(); refreshState(); });
});

/* ---------- init + SSE ---------- */
function refreshState() { return fetch("/api/state").then((r) => r.json()).then(renderBoard).catch(() => {}); }

loadCars();
loadSmart();
if (new URLSearchParams(location.search).get("view") === "standings") switchView("standings");

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
        if (ev.type === "tick") { renderBoard(ev.state); if (currentView === "standings") renderStandings(); return; }
        if (ev.type === "flag") applyFlag(ev.payload.to);
        addEvent(ev);
      };
    });
}
