// src/index.js
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { createApiClient } from "./apiClient.js";
import { createPollClient } from "./pollClient.js";
import { detectEvents } from "./eventDetector.js";
import { makeCarState } from "./model.js";
import { buildStintSummary } from "./summary.js";
import { createScheduler } from "./scheduler.js";
import { createWebServer } from "./webServer.js";

const cfg = loadConfig();
const store = createStore(cfg.dataDir);
const tracked = cfg.trackedParticipants;

// Restart sonrası son durumu yükle
const stateMap = new Map(Object.entries(store.loadState()).map(([k, v]) => [Number(k), v]));

const web = createWebServer({ port: cfg.webPort, getState: () => Object.fromEntries(stateMap) });

const api = createApiClient(cfg);
const poll = createPollClient(cfg, api);

poll.onSnapshot((snapshot) => {
  for (const pid of tracked) {
    const next = snapshot.get(pid);
    if (!next) continue;
    const prev = stateMap.get(pid) ?? makeCarState({ participantId: pid });
    const events = detectEvents(prev, next, cfg, Date.now());
    stateMap.set(pid, next);
    for (const ev of events) { store.appendEvent(ev); web.broadcast(ev); }
  }
  store.saveState(Object.fromEntries(stateMap));
});

// Periyodik stint özeti
const summaryScheduler = createScheduler(cfg.stintSummaryIntervalMinutes * 60 * 1000, () => {
  const recent = store.readEvents();
  for (const pid of tracked) {
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
console.log(`[poll] SID-${cfg.sessionId} izleniyor (her ${cfg.pollIntervalSeconds}sn); takip: ${tracked.join(", ")}`);

process.on("SIGINT", async () => { poll.stop(); summaryScheduler.stop(); await web.close(); process.exit(0); });
