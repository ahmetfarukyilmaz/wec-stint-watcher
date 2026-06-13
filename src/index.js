// src/index.js
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { createTrackedStore } from "./trackedStore.js";
import { createApiClient } from "./apiClient.js";
import { createPollClient } from "./pollClient.js";
import { detectEvents } from "./eventDetector.js";
import { makeCarState } from "./model.js";
import { buildStintSummary } from "./summary.js";
import { createScheduler } from "./scheduler.js";
import { createWebServer } from "./webServer.js";

const cfg = loadConfig();
const store = createStore(cfg.dataDir);
const trackedStore = createTrackedStore(cfg.dataDir, cfg.trackedParticipants);

// Restart sonrası son durumu yükle
const stateMap = new Map(Object.entries(store.loadState()).map(([k, v]) => [Number(k), v]));
// Önceki durumu olan pid'ler "baseline'lı" sayılır; soğuk başlangıçta (veya çalışırken
// eklenen bir araçta) ilk snapshot olay ÜRETMEDEN baseline olarak alınır.
const baselined = new Set(stateMap.keys());

const api = createApiClient(cfg);
const poll = createPollClient(cfg, api, () => trackedStore.list());

function addCar(carNumber) {
  const car = (poll.getCars() || []).find((c) => String(c.carNumber) === String(carNumber).trim());
  if (!car) return { ok: false, error: `#${carNumber} bulunamadı` };
  trackedStore.add(car.pid);
  return { ok: true, pid: car.pid, carNumber: car.carNumber };
}
function removeCar(pid) {
  pid = Number(pid);
  const ok = trackedStore.remove(pid);
  baselined.delete(pid);
  stateMap.delete(pid);
  return { ok };
}

const web = createWebServer({
  port: cfg.webPort,
  getState: () => Object.fromEntries(stateMap),
  getEvents: () => store.readEvents().slice(-400), // sayfa açılışında geçmiş akış (çoklu araç)
  getCars: () => poll.getCars(),
  getTracked: () => trackedStore.list(),
  addCar,
  removeCar,
});

poll.onSnapshot((snapshot) => {
  for (const pid of trackedStore.list()) {
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
  store.saveState(Object.fromEntries(stateMap));
  web.broadcast({ type: "tick", at: Date.now(), state: Object.fromEntries(stateMap) });
});

// Periyodik stint özeti
const summaryScheduler = createScheduler(cfg.stintSummaryIntervalMinutes * 60 * 1000, () => {
  const recent = store.readEvents();
  for (const pid of trackedStore.list()) {
    const st = stateMap.get(pid);
    if (!st) continue;
    const summary = buildStintSummary(st, recent.filter((e) => e.participantId === pid), Date.now());
    store.appendEvent(summary);
    web.broadcast(summary);
  }
});

const { port } = await web.listen();
console.log(`[web] http://127.0.0.1:${port}`);
await poll.start();
summaryScheduler.start();
console.log(`[poll] SID-${cfg.sessionId} izleniyor (her ${cfg.pollIntervalSeconds}sn); takip: ${trackedStore.list().join(", ")}`);

process.on("SIGINT", async () => { poll.stop(); summaryScheduler.stop(); await web.close(); process.exit(0); });
