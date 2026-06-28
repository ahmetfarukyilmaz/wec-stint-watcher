// src/index.js
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { createTrackingStore } from "./trackingStore.js";
import { createGriiipProvider } from "./providers/griiip.js";
import { createSwissProvider } from "./providers/swiss.js";
import { createPollClient } from "./pollClient.js";
import { detectEvents, detectGlobalEvents, raceLogEvents } from "./eventDetector.js";
import { computeDriverStints } from "./driverStints.js";
import { makeCarState } from "./model.js";
import { buildStintSummary } from "./summary.js";
import { createScheduler } from "./scheduler.js";
import { createWebServer } from "./webServer.js";

const cfg = loadConfig();
const store = createStore(cfg.dataDir);
const tracking = createTrackingStore(cfg.dataDir, cfg.trackedParticipants);

// Restart sonrası son durumu yükle
const stateMap = new Map(Object.entries(store.loadState()).map(([k, v]) => [Number(k), v]));
const baselined = new Set(stateMap.keys()); // ilk snapshot'ta olay üretmeden baseline al
const seenRaceLog = new Set();
let raceLogSeeded = false;
let globalPrev = { flag: null, sky: null, trackTemp: null };
let globalSeeded = false;

const provider = cfg.provider === "swiss" ? createSwissProvider(cfg) : createGriiipProvider(cfg);
// Efektif takip = pinli ∪ otomatik sınıf ilk-N (her poll'da güncel araçlardan hesaplanır)
const poll = createPollClient(cfg, provider, (cars) => tracking.effective(cars));

// Sürücü süreleri: pid -> { externalDriverID: saniye } (periyodik hesaplanır, aşağıda)
const driverTimes = {};

// Durumu pinli + sürücü süreleriyle dışa ver
function stateOut() {
  const out = {};
  for (const [pid, c] of stateMap) {
    const dt = driverTimes[pid] || {};
    const drivers = (c.drivers || []).map((d) => ({ ...d, seconds: d.id != null ? (dt[d.id] ?? null) : null }));
    out[pid] = { ...c, drivers, pinned: tracking.isPinned(pid) };
  }
  return out;
}

// Tam yarış log'undan sürücü sürelerini hesapla (seyrek; ~2 dk)
async function refreshDriverTimes() {
  if (cfg.provider === "swiss") return; // v1: Swiss'te per-sürücü süre yok (CurrentDriverId anlık gösterilir)
  const clock = poll.getClock();
  if (!clock?.startTime) return;
  const startMs = Date.parse(clock.startTime);
  const nowMs = clock.tsNow ? Date.parse(clock.tsNow) : Date.now();
  let items;
  try { items = await provider.fetchRaceLogFull(); } catch { return; }
  for (const pid of poll.getTracked()) {
    const swaps = items.filter((x) => Number(x.pid) === pid && x.type === "DriverSwap");
    driverTimes[pid] = computeDriverStints(swaps, startMs, nowMs).byDriver;
  }
}

function addCar(carNumber) {
  const car = (poll.getCars() || []).find((c) => String(c.carNumber) === String(carNumber).trim());
  if (!car) return { ok: false, error: `#${carNumber} bulunamadı` };
  tracking.pin(car.pid);
  return { ok: true, pid: car.pid, carNumber: car.carNumber };
}
function removeCar(pid) { tracking.unpin(Number(pid)); return { ok: true }; }

const web = createWebServer({
  port: cfg.webPort,
  getState: stateOut,
  getEvents: () => store.readEvents().slice(-400),
  getCars: () => poll.getCars(),
  getTracked: () => poll.getTracked(),
  getTracking: () => ({ pinned: tracking.pinnedList(), effective: poll.getTracked(), ...tracking.getSmart() }),
  setSmart: (smartClass, topN) => { tracking.setSmart(smartClass, topN); return { ok: true, ...tracking.getSmart() }; },
  addCar,
  removeCar,
});

poll.onSnapshot((snapshot) => {
  const effective = poll.getTracked();
  for (const pid of effective) {
    const next = snapshot.get(pid);
    if (!next) continue;
    if (!baselined.has(pid)) {
      stateMap.set(pid, next); // ilk görülen araç: baseline, olay yok
      baselined.add(pid);
      continue;
    }
    const prev = stateMap.get(pid) ?? makeCarState({ participantId: pid });
    const events = detectEvents(prev, next, cfg, Date.now());
    stateMap.set(pid, next);
    for (const ev of events) { store.appendEvent(ev); web.broadcast(ev); }
  }

  // Artık efektif listede olmayan araçları durumdan düşür (otomatik rotasyon)
  const eff = new Set(effective);
  for (const pid of [...stateMap.keys()]) if (!eff.has(pid)) { stateMap.delete(pid); baselined.delete(pid); }

  // Global olaylar (bayrak/hava): herhangi bir aracın durumundan tek sefer üret
  const anyCar = snapshot.values().next().value;
  if (anyCar) {
    const nextGlobal = { flag: anyCar.flag ?? null, sky: anyCar.weather?.sky ?? null, trackTemp: anyCar.weather?.trackTemp ?? null };
    if (!globalSeeded) { globalPrev = nextGlobal; globalSeeded = true; }
    else {
      for (const ev of detectGlobalEvents(globalPrev, nextGlobal, cfg, Date.now())) { store.appendEvent(ev); web.broadcast(ev); }
      globalPrev = nextGlobal;
    }
  }

  // Resmi race log: yeni item'lardan olay üret (RCMessage/Retired/TimeLoss)
  const logItems = poll.getRaceLog();
  if (cfg.events?.racelog !== false) {
    if (!raceLogSeeded) {
      for (const it of logItems) seenRaceLog.add(it.raceLogItemId);
      raceLogSeeded = true;
    } else {
      for (const ev of raceLogEvents(logItems, seenRaceLog, effective, Date.now())) { store.appendEvent(ev); web.broadcast(ev); }
    }
    for (const it of logItems) seenRaceLog.add(it.raceLogItemId);
  }

  store.saveState(Object.fromEntries(stateMap));
  web.broadcast({ type: "tick", at: Date.now(), state: stateOut() });
});

// Periyodik stint özeti
const summaryScheduler = createScheduler(cfg.stintSummaryIntervalMinutes * 60 * 1000, () => {
  const recent = store.readEvents();
  for (const [pid, st] of stateMap) {
    const summary = buildStintSummary(st, recent.filter((e) => e.participantId === pid), Date.now());
    store.appendEvent(summary);
    web.broadcast(summary);
  }
});

// Sürücü süreleri: ~2 dk'da bir tam log'dan hesapla (driver swap'ler seyrek)
const driverTimesScheduler = createScheduler(120000, refreshDriverTimes);

const { port } = await web.listen();
console.log(`[web] http://127.0.0.1:${port}`);
await poll.start();
summaryScheduler.start();
driverTimesScheduler.start();
refreshDriverTimes(); // başlangıçta bir kez
console.log(`[poll] SID-${cfg.sessionId} izleniyor (her ${cfg.pollIntervalSeconds}sn); pinli: ${tracking.pinnedList().join(", ") || "—"}`);

process.on("SIGINT", async () => { poll.stop(); summaryScheduler.stop(); driverTimesScheduler.stop(); await web.close(); process.exit(0); });
