// public/app.js
const statusEl = document.getElementById("status");
const eventsEl = document.getElementById("events");
const tbody = document.querySelector("#stateTable tbody");

document.getElementById("enableNotif").addEventListener("click", () => {
  if ("Notification" in window) Notification.requestPermission();
});

function fmtLap(ms) { if (ms == null) return "-"; const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(3).padStart(6, "0")}`; }
function fmtGap(ms) { return ms == null ? "-" : `${(ms / 1000).toFixed(1)}s`; }

function renderState(state) {
  tbody.innerHTML = "";
  for (const car of Object.values(state)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>#${car.carNumber ?? car.participantId}</td><td>P${car.position ?? "-"} (sınıf ${car.classPosition ?? "-"})</td><td>son ${fmtLap(car.lastLapMs)}</td><td>en iyi ${fmtLap(car.bestLapMs)}</td><td>önü ${fmtGap(car.gapAheadMs)}</td><td>${car.pitCount ?? 0} pit</td><td>${car.currentDriver ?? "-"}</td>`;
    tbody.appendChild(tr);
  }
}

const LABELS = {
  position_change: (p) => `Pozisyon: P${p.from} → P${p.to}${p.gained ? " ⬆" : " ⬇"}`,
  pit_in: (p) => `Pite girdi (${p.pitCount}. pit)`,
  pit_out: () => "Pitten çıktı",
  best_lap: (p) => `Yeni kişisel en iyi: ${fmtLap(p.to)}`,
  fastest_lap: (p) => `GENEL EN HIZLI TUR! ${fmtLap(p.bestLapMs)}`,
  driver_change: (p) => `Sürücü değişti: ${p.from} → ${p.to}`,
  gap_threshold: (p) => `Öndeki araca fark ${p.thresholdSeconds}sn altına indi`,
  flag: (p) => `Bayrak: ${p.to}`,
  stint_summary: (p) => `Stint özeti — P${p.position} (sınıf ${p.classPosition}), ${p.pitCount} pit, en iyi ${fmtLap(p.bestLapMs)}, sürücü ${p.currentDriver ?? "-"}`,
  connection: (p) => `Bağlantı: ${p.status}`,
};

function addEvent(ev) {
  const li = document.createElement("li");
  const label = (LABELS[ev.type] ?? (() => ev.type))(ev.payload ?? {});
  li.textContent = `#${ev.participantId ?? "-"} — ${label}`;
  eventsEl.prepend(li);
  if (ev.type === "connection") {
    statusEl.textContent = ev.payload.status;
    statusEl.className = ev.payload.status === "connected" ? "ok" : "bad";
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("WEC Watcher", { body: `#${ev.participantId ?? ""} ${label}` });
  }
}

function refreshState() { fetch("/api/state").then((r) => r.json()).then(renderState).catch(() => {}); }
refreshState();

const es = new EventSource("/events");
es.onopen = () => { statusEl.textContent = "bağlı"; statusEl.className = "ok"; };
es.onerror = () => { statusEl.textContent = "bağlantı koptu"; statusEl.className = "bad"; };
es.onmessage = (e) => { addEvent(JSON.parse(e.data)); refreshState(); };
