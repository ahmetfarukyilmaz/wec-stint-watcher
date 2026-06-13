# WEC Stint Watcher Implementation Plan (REST polling)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FIA WEC 24 saat yarışında tek bir aracı (pid=400061, #91 Manthey LMGT3) 7/24 izleyip önemli olaylarda tarayıcı bildirimi veren ve periyodik stint özeti üreten bağımsız bir Node.js servisi inşa etmek.

**Architecture:** Tek Node.js süreci, REST polling tabanlı. `pollClient` her N saniyede Griiip açık REST API'sinden bir endpoint setini çeker → `adapter` bunları `Map<pid, CarState>` anlık görüntüsüne birleştirir → `eventDetector` (saf fonksiyon) önceki state ile diff alıp olay üretir → `store` (dosya bazlı) kalıcılık + `scheduler` periyodik özet → `webServer` (Express + SSE) → tarayıcı dashboard (`Notification API`). SignalR kullanılmaz.

**Tech Stack:** Node.js (ESM), native `fetch` (Node 18+), Express, `node:test` + `node:assert`, vanilla HTML/JS frontend (build adımı yok).

**Veri kaynağı:** `https://insights.griiip.com` (auth'suz). Şema: `docs/specs/feed-schema.md`. Test fixture'ları: `fixtures/live_*.json` (spike'ta yakalandı, repo'da mevcut).

---

## File Structure

```
wec-stint-watcher/
├── package.json
├── config.json
├── .gitignore
├── data/                        # runtime (git ignore): events.jsonl, state.json
├── fixtures/                    # spike çıktısı: live_ranks.json, live_gaps.json, ... (mevcut)
├── src/
│   ├── index.js                 # entrypoint: modülleri bağlar
│   ├── config.js                # config.json yükle + doğrula
│   ├── model.js                 # CarState + Event factory'leri
│   ├── apiClient.js             # REST endpoint'lerini fetch eder (enjekte edilebilir)
│   ├── adapter.js               # ham endpoint yanıtları -> Map<pid, CarState>
│   ├── eventDetector.js         # saf: (prevState, nextState, cfg, at) -> Event[]
│   ├── store.js                 # events.jsonl append + state.json snapshot
│   ├── pollClient.js            # interval'de apiClient+adapter çalıştırır, snapshot yayar
│   ├── summary.js               # state -> stint özeti (saf)
│   ├── scheduler.js             # periyodik tetikleyici
│   └── webServer.js             # Express + SSE + static
├── public/
│   ├── index.html
│   └── app.js
└── test/
    ├── model.test.js
    ├── apiClient.test.js
    ├── adapter.test.js
    ├── eventDetector.test.js
    ├── store.test.js
    ├── summary.test.js
    ├── scheduler.test.js
    ├── pollClient.test.js
    ├── config.test.js
    └── webServer.test.js
```

**Decomposition:** `eventDetector`, `summary`, `store`, `scheduler`, `webServer` tamamen normalize `CarState`/`Event` modeline karşı çalışır (saf, kolay test). Dış dünya (REST) yalnızca `apiClient` + `adapter` + `pollClient`'te. `adapter` ve `eventDetector` testleri repo'daki gerçek `fixtures/live_*.json` ile yazılır.

---

## Task 0: Proje iskeleti

**Files:**
- Create: `package.json`, `.gitignore`, `config.json`

- [ ] **Step 1: package.json oluştur**

```json
{
  "name": "wec-stint-watcher",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
```

- [ ] **Step 2: .gitignore oluştur**

```
node_modules/
data/
*.log
```

- [ ] **Step 3: config.json oluştur**

```json
{
  "apiBase": "https://insights.griiip.com",
  "sessionId": 18130,
  "trackedParticipants": [400061],
  "pollIntervalSeconds": 8,
  "events": {
    "position_change": true,
    "pit": true,
    "lap": true,
    "driver_change": true,
    "gap_threshold": true,
    "flag": true
  },
  "gapThresholdSeconds": 10,
  "stintSummaryIntervalMinutes": 60,
  "webPort": 3000,
  "dataDir": "data"
}
```

- [ ] **Step 4: Bağımlılıkları kur**

Run: `npm install`
Expected: `node_modules/` oluşur, hata yok.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore config.json
git commit -m "chore: proje iskeleti (REST mimarisi, express bağımlılığı)"
```

---

## Task 1: Normalize model + factory'ler

**Files:**
- Create: `src/model.js`
- Test: `test/model.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/model.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCarState, makeEvent } from "../src/model.js";

test("makeCarState varsayılan alanları doldurur", () => {
  const s = makeCarState({ participantId: 400061, position: 5 });
  assert.equal(s.participantId, 400061);
  assert.equal(s.position, 5);
  assert.equal(s.inPit, false);
  assert.equal(s.pitCount, 0);
  assert.equal(s.classPosition, null);
});

test("makeEvent zaman damgası ve tip içerir", () => {
  const e = makeEvent("pit_in", 400061, { lap: 12 }, 1000);
  assert.equal(e.type, "pit_in");
  assert.equal(e.participantId, 400061);
  assert.equal(e.at, 1000);
  assert.deepEqual(e.payload, { lap: 12 });
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/model.test.js`
Expected: FAIL — `Cannot find module ../src/model.js`.

- [ ] **Step 3: model.js yaz**

```js
// src/model.js
/**
 * @typedef {Object} CarState
 * @property {number} participantId
 * @property {string|null} carNumber
 * @property {string|null} classId
 * @property {number|null} position        genel sıra (overallPosition)
 * @property {number|null} classPosition   sınıf içi sıra (position)
 * @property {number|null} lastLapMs
 * @property {number|null} bestLapMs
 * @property {boolean} bestLapIsPurple      genel en hızlı turu elinde tutuyor mu
 * @property {number|null} gapAheadMs       öndeki araca fark (ms)
 * @property {number|null} gapToFirstMs
 * @property {boolean} inPit
 * @property {number} pitCount
 * @property {string|null} currentDriver
 * @property {string|null} flag
 */

/** @param {Partial<CarState>} partial @returns {CarState} */
export function makeCarState(partial = {}) {
  return {
    participantId: partial.participantId ?? null,
    carNumber: partial.carNumber ?? null,
    classId: partial.classId ?? null,
    position: partial.position ?? null,
    classPosition: partial.classPosition ?? null,
    lastLapMs: partial.lastLapMs ?? null,
    bestLapMs: partial.bestLapMs ?? null,
    bestLapIsPurple: partial.bestLapIsPurple ?? false,
    gapAheadMs: partial.gapAheadMs ?? null,
    gapToFirstMs: partial.gapToFirstMs ?? null,
    inPit: partial.inPit ?? false,
    pitCount: partial.pitCount ?? 0,
    currentDriver: partial.currentDriver ?? null,
    flag: partial.flag ?? null,
  };
}

/**
 * @param {string} type @param {number} participantId
 * @param {object} payload @param {number} at epoch ms
 */
export function makeEvent(type, participantId, payload, at) {
  return { type, participantId, payload, at };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/model.test.js`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat: normalize CarState ve Event modeli"
```

---

## Task 2: apiClient — REST endpoint'lerini çek

**Files:**
- Create: `src/apiClient.js`
- Test: `test/apiClient.test.js`

> `apiClient` `fetch`'i enjekte edilebilir alır (testte sahte fetch). Her endpoint için JSON döndürür.

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/apiClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/apiClient.js";

function fakeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error("beklenmeyen url: " + url);
    return { ok: true, status: 200, json: async () => routes[key] };
  };
}

test("fetchAll tüm endpoint'leri doğru sid ile çeker", async () => {
  const client = createApiClient({ apiBase: "https://x.test", sessionId: 18130 }, fakeFetch({
    "/live/ranks/18130": [{ pid: 1 }],
    "/live/gaps/18130": [{ pid: 1 }],
    "/live/laps/18130": [{ pid: 1 }],
    "/live/best-laps/18130": [{ pid: 1 }],
    "/live/pit-in/18130": [{ pid: 1 }],
    "/live/pit-out/18130": [{ pid: 1 }],
    "/live/participants/18130": [{ pid: 1 }],
    "/live/race-flags/18130": [{ flag: "GF" }],
  }));
  const snap = await client.fetchAll();
  assert.ok(Array.isArray(snap.ranks));
  assert.ok(Array.isArray(snap.gaps));
  assert.ok(Array.isArray(snap.laps));
  assert.ok(Array.isArray(snap.bestLaps));
  assert.ok(Array.isArray(snap.pitIn));
  assert.ok(Array.isArray(snap.pitOut));
  assert.ok(Array.isArray(snap.participants));
  assert.ok(Array.isArray(snap.flags));
});

test("bir endpoint hata verirse o alan [] döner, diğerleri etkilenmez", async () => {
  const ff = async (url) => {
    if (url.includes("gaps")) throw new Error("network");
    return { ok: true, status: 200, json: async () => [{ pid: 1 }] };
  };
  const client = createApiClient({ apiBase: "https://x.test", sessionId: 18130 }, ff);
  const snap = await client.fetchAll();
  assert.deepEqual(snap.gaps, []);
  assert.equal(snap.ranks.length, 1);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/apiClient.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: apiClient.js yaz**

```js
// src/apiClient.js
const ENDPOINTS = {
  ranks: "/live/ranks/",
  gaps: "/live/gaps/",
  laps: "/live/laps/",
  bestLaps: "/live/best-laps/",
  pitIn: "/live/pit-in/",
  pitOut: "/live/pit-out/",
  participants: "/live/participants/",
  flags: "/live/race-flags/",
};

/**
 * @param {{apiBase:string, sessionId:number}} cfg
 * @param {typeof fetch} [fetchImpl]
 */
export function createApiClient(cfg, fetchImpl = fetch) {
  async function getOne(path) {
    try {
      const res = await fetchImpl(`${cfg.apiBase}${path}${cfg.sessionId}`, {
        headers: { Accept: "application/json", "User-Agent": "wec-stint-watcher" },
      });
      if (!res.ok) { console.warn(`[api] ${path} HTTP ${res.status}`); return []; }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn(`[api] ${path} hata: ${e.message}`);
      return [];
    }
  }

  return {
    async fetchAll() {
      const keys = Object.keys(ENDPOINTS);
      const results = await Promise.all(keys.map((k) => getOne(ENDPOINTS[k])));
      const snap = {};
      keys.forEach((k, i) => { snap[k] = results[i]; });
      return snap;
    },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/apiClient.test.js`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/apiClient.js test/apiClient.test.js
git commit -m "feat: REST apiClient (paralel fetch, hataya dayanıklı)"
```

---

## Task 3: adapter — endpoint yanıtlarını CarState'e birleştir

**Files:**
- Create: `src/adapter.js`
- Test: `test/adapter.test.js`

> Eşleme `docs/specs/feed-schema.md`'den. Test, repo'daki gerçek `fixtures/live_*.json` ile yazılır.

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/adapter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptSnapshot } from "../src/adapter.js";

function loadFixtureSnapshot() {
  const j = (f) => JSON.parse(readFileSync(`fixtures/${f}`, "utf8"));
  return {
    ranks: j("live_ranks.json"),
    gaps: j("live_gaps.json"),
    laps: j("live_laps.json"),
    bestLaps: j("live_best-laps.json"),
    pitIn: j("live_pit-in.json"),
    pitOut: j("live_pit-out.json"),
    participants: j("live_participants.json"),
    flags: j("live_race-flags.json"),
  };
}

test("adaptSnapshot takip edilen aracı (400061) CarState'e çevirir", () => {
  const map = adaptSnapshot(loadFixtureSnapshot(), [400061]);
  const car = map.get(400061);
  assert.ok(car, "400061 bulunmalı");
  assert.equal(car.participantId, 400061);
  assert.equal(car.carNumber, "91");
  assert.equal(car.classId, "LMGT3");
  assert.ok(typeof car.position === "number" || car.position === null);
  assert.ok(car.pitCount >= 1, "fixture'da en az 1 pit-in var");
  assert.ok(car.bestLapMs === null || car.bestLapMs > 0);
});

test("inPit: son pit-in ts'i son pit-out ts'inden büyükse true", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 3, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], participants: [], flags: [],
    pitIn: [{ pid: 9, ts: "2026-06-13T10:00:00+00:00" }],
    pitOut: [{ pid: 9, ts: "2026-06-13T09:00:00+00:00" }],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.inPit, true);
  assert.equal(car.pitCount, 1);
});

test("lastLapMs pid'in en yüksek lapNumber kaydından gelir", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    laps: [
      { pid: 9, lapNumber: 5, lapTimeMillis: 208000 },
      { pid: 9, lapNumber: 7, lapTimeMillis: 207000 },
      { pid: 9, lapNumber: 6, lapTimeMillis: 209000 },
    ],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.lastLapMs, 207000);
});

test("currentDriver currentDriverId -> drivers[].externalDriverID ile çözülür", () => {
  const snap = {
    ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
    gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], flags: [],
    participants: [{ pid: 9, currentDriverId: "2", drivers: [
      { externalDriverID: "1", displayName: "A" },
      { externalDriverID: "2", displayName: "B" },
    ] }],
  };
  const car = adaptSnapshot(snap, [9]).get(9);
  assert.equal(car.currentDriver, "B");
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/adapter.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: adapter.js yaz**

```js
// src/adapter.js
import { makeCarState } from "./model.js";

const tsMs = (s) => (s ? Date.parse(s) : 0);
const byPid = (arr, pid) => arr.filter((x) => Number(x.pid) === pid);

/**
 * Bir poll snapshot'ındaki tüm endpoint yanıtlarını takip edilen pid'ler için
 * Map<pid, CarState>'e birleştirir.
 * @param {{ranks:any[],gaps:any[],laps:any[],bestLaps:any[],pitIn:any[],pitOut:any[],participants:any[],flags:any[]}} snap
 * @param {number[]} trackedPids
 * @returns {Map<number, import("./model.js").CarState>}
 */
export function adaptSnapshot(snap, trackedPids) {
  const map = new Map();
  const currentFlag = snap.flags?.length ? (snap.flags[snap.flags.length - 1].flag ?? snap.flags[snap.flags.length - 1].flagType ?? null) : null;

  for (const pid of trackedPids) {
    const rank = byPid(snap.ranks ?? [], pid)[0];
    const gap = byPid(snap.gaps ?? [], pid)[0];
    const best = byPid(snap.bestLaps ?? [], pid)[0];
    const part = byPid(snap.participants ?? [], pid)[0];

    // son tur: en yüksek lapNumber
    const laps = byPid(snap.laps ?? [], pid);
    const lastLap = laps.reduce((m, l) => (m == null || l.lapNumber > m.lapNumber ? l : m), null);

    // pit: pid'in pit-in sayısı + son in/out karşılaştırması
    const pitIns = byPid(snap.pitIn ?? [], pid);
    const pitOuts = byPid(snap.pitOut ?? [], pid);
    const lastInTs = pitIns.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);
    const lastOutTs = pitOuts.reduce((m, x) => Math.max(m, tsMs(x.ts)), 0);

    // sürücü: currentDriverId -> drivers[].externalDriverID
    let driver = null;
    if (part?.drivers && part.currentDriverId != null) {
      const d = part.drivers.find((x) => String(x.externalDriverID) === String(part.currentDriverId));
      driver = d?.displayName ?? null;
    }

    map.set(pid, makeCarState({
      participantId: pid,
      carNumber: rank?.carNumber ?? part?.carNumber ?? null,
      classId: rank?.classId ?? null,
      position: rank?.overallPosition ?? null,
      classPosition: rank?.position ?? null,
      lastLapMs: lastLap?.lapTimeMillis ?? null,
      bestLapMs: best?.lapTimeMillis ?? null,
      bestLapIsPurple: best?.color === "Purple",
      gapAheadMs: gap?.gapToAheadMillis ?? null,
      gapToFirstMs: gap?.gapToFirstMillis ?? null,
      inPit: lastInTs > lastOutTs,
      pitCount: pitIns.length,
      currentDriver: driver,
      flag: currentFlag,
    }));
  }
  return map;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/adapter.test.js`
Expected: PASS (4 test).

> Not: Eğer fixture testindeki bir alan (örn. flag) gerçek fixture'da farklı adlandırılmışsa, `fixtures/live_race-flags.json`'a bakıp `currentFlag` türetmesini düzelt ve testi gerçeğe göre güncelle. pitCount beklentisi fixture'daki gerçek pit-in sayısıyla uyumlu olmalı.

- [ ] **Step 5: Commit**

```bash
git add src/adapter.js test/adapter.test.js
git commit -m "feat: snapshot adapter (endpoint yanıtları -> CarState)"
```

---

## Task 4: eventDetector — saf olay üretici

**Files:**
- Create: `src/eventDetector.js`
- Test: `test/eventDetector.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/eventDetector.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEvents } from "../src/eventDetector.js";
import { makeCarState } from "../src/model.js";

const cfg = { events: { position_change: true, pit: true, lap: true, driver_change: true, gap_threshold: true, flag: true }, gapThresholdSeconds: 10 };
const NOW = 1000;

test("sınıf pozisyonu iyileşince position_change üretir (gained=true)", () => {
  const prev = makeCarState({ participantId: 1, classPosition: 5 });
  const next = makeCarState({ participantId: 1, classPosition: 3 });
  const e = detectEvents(prev, next, cfg, NOW).find((x) => x.type === "position_change");
  assert.ok(e);
  assert.deepEqual(e.payload, { from: 5, to: 3, gained: true });
});

test("inPit false->true pit_in üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, inPit: false }), makeCarState({ participantId: 1, inPit: true, pitCount: 3 }), cfg, NOW);
  const e = evs.find((x) => x.type === "pit_in");
  assert.ok(e);
  assert.equal(e.payload.pitCount, 3);
});

test("inPit true->false pit_out üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, inPit: true }), makeCarState({ participantId: 1, inPit: false }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "pit_out"));
});

test("bestLap düşünce best_lap üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, bestLapMs: 206000 }), makeCarState({ participantId: 1, bestLapMs: 205000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "best_lap"));
});

test("bestLapIsPurple false->true fastest_lap üretir", () => {
  const evs = detectEvents(makeCarState({ participantId: 1, bestLapIsPurple: false }), makeCarState({ participantId: 1, bestLapIsPurple: true, bestLapMs: 205000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "fastest_lap"));
});

test("sürücü değişince driver_change üretir", () => {
  const e = detectEvents(makeCarState({ participantId: 1, currentDriver: "A" }), makeCarState({ participantId: 1, currentDriver: "B" }), cfg, NOW).find((x) => x.type === "driver_change");
  assert.deepEqual(e.payload, { from: "A", to: "B" });
});

test("gap eşiği yalnızca geçişte tetiklenir (histerezis)", () => {
  let evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 12000 }), makeCarState({ participantId: 1, gapAheadMs: 9000 }), cfg, NOW);
  assert.ok(evs.find((x) => x.type === "gap_threshold"));
  evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 9000 }), makeCarState({ participantId: 1, gapAheadMs: 8000 }), cfg, NOW);
  assert.equal(evs.find((x) => x.type === "gap_threshold"), undefined);
});

test("flag değişince flag üretir", () => {
  const e = detectEvents(makeCarState({ participantId: 1, flag: "GF" }), makeCarState({ participantId: 1, flag: "FCY" }), cfg, NOW).find((x) => x.type === "flag");
  assert.deepEqual(e.payload, { from: "GF", to: "FCY" });
});

test("değişiklik yoksa boş dizi döner", () => {
  const s = makeCarState({ participantId: 1, classPosition: 3 });
  assert.deepEqual(detectEvents(s, makeCarState({ participantId: 1, classPosition: 3 }), cfg, NOW), []);
});

test("kapatılan olay türü üretilmez", () => {
  const c = { ...cfg, events: { ...cfg.events, position_change: false } };
  const evs = detectEvents(makeCarState({ participantId: 1, classPosition: 5 }), makeCarState({ participantId: 1, classPosition: 3 }), c, NOW);
  assert.equal(evs.find((x) => x.type === "position_change"), undefined);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/eventDetector.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: eventDetector.js yaz**

```js
// src/eventDetector.js
import { makeEvent } from "./model.js";

/**
 * Saf fonksiyon: önceki ve yeni durumu karşılaştırıp olay listesi üretir.
 * @param {import("./model.js").CarState} prev
 * @param {import("./model.js").CarState} next
 * @param {{events:Record<string,boolean>, gapThresholdSeconds:number}} cfg
 * @param {number} at epoch ms
 */
export function detectEvents(prev, next, cfg, at) {
  const events = [];
  const on = (k) => cfg.events?.[k];
  const pid = next.participantId;

  if (on("position_change") && prev.classPosition != null && next.classPosition != null && next.classPosition !== prev.classPosition) {
    events.push(makeEvent("position_change", pid, { from: prev.classPosition, to: next.classPosition, gained: next.classPosition < prev.classPosition }, at));
  }

  if (on("pit")) {
    if (!prev.inPit && next.inPit) events.push(makeEvent("pit_in", pid, { pitCount: next.pitCount }, at));
    if (prev.inPit && !next.inPit) events.push(makeEvent("pit_out", pid, { pitCount: next.pitCount }, at));
  }

  if (on("lap")) {
    if (prev.bestLapMs != null && next.bestLapMs != null && next.bestLapMs < prev.bestLapMs) {
      events.push(makeEvent("best_lap", pid, { from: prev.bestLapMs, to: next.bestLapMs }, at));
    }
    if (!prev.bestLapIsPurple && next.bestLapIsPurple) {
      events.push(makeEvent("fastest_lap", pid, { bestLapMs: next.bestLapMs }, at));
    }
  }

  if (on("driver_change") && next.currentDriver && prev.currentDriver && next.currentDriver !== prev.currentDriver) {
    events.push(makeEvent("driver_change", pid, { from: prev.currentDriver, to: next.currentDriver }, at));
  }

  if (on("gap_threshold") && prev.gapAheadMs != null && next.gapAheadMs != null) {
    const thr = cfg.gapThresholdSeconds * 1000;
    if (prev.gapAheadMs >= thr && next.gapAheadMs < thr) {
      events.push(makeEvent("gap_threshold", pid, { gapAheadMs: next.gapAheadMs, thresholdSeconds: cfg.gapThresholdSeconds }, at));
    }
  }

  if (on("flag") && next.flag && prev.flag !== next.flag) {
    events.push(makeEvent("flag", pid, { from: prev.flag, to: next.flag }, at));
  }

  return events;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/eventDetector.test.js`
Expected: PASS (10 test).

- [ ] **Step 5: Commit**

```bash
git add src/eventDetector.js test/eventDetector.test.js
git commit -m "feat: saf olay dedektörü (position/pit/lap/fastest/driver/gap/flag)"
```

---

## Task 5: store — dosya bazlı kalıcılık

**Files:**
- Create: `src/store.js`
- Test: `test/store.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/store.test.js
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { createStore } from "../src/store.js";

const DIR = "data-test";
beforeEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true }); });

test("olay append edilir ve geri okunur", () => {
  const s = createStore(DIR);
  s.appendEvent({ type: "pit_in", participantId: 1, payload: {}, at: 10 });
  s.appendEvent({ type: "pit_out", participantId: 1, payload: {}, at: 20 });
  assert.equal(s.readEvents().length, 2);
});

test("state yazılır ve restart sonrası okunur", () => {
  const s1 = createStore(DIR);
  s1.saveState({ 1: { participantId: 1, classPosition: 3 } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadState()[1].classPosition, 3);
});

test("boş dizinde loadState boş obje döner", () => {
  assert.deepEqual(createStore(DIR).loadState(), {});
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/store.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: store.js yaz**

```js
// src/store.js
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const eventsPath = join(dir, "events.jsonl");
  const statePath = join(dir, "state.json");

  return {
    appendEvent(event) { appendFileSync(eventsPath, JSON.stringify(event) + "\n"); },
    readEvents() {
      if (!existsSync(eventsPath)) return [];
      return readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
    saveState(stateMap) { writeFileSync(statePath, JSON.stringify(stateMap)); },
    loadState() {
      if (!existsSync(statePath)) return {};
      return JSON.parse(readFileSync(statePath, "utf8"));
    },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/store.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: data-test'i temizle ve commit**

```bash
rm -rf data-test
git add src/store.js test/store.test.js
git commit -m "feat: dosya bazlı store (events.jsonl + state.json)"
```

---

## Task 6: summary — stint özeti üretici (saf)

**Files:**
- Create: `src/summary.js`
- Test: `test/summary.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/summary.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStintSummary } from "../src/summary.js";
import { makeCarState } from "../src/model.js";

test("stint özeti pozisyon, pit sayısı ve best lap içerir", () => {
  const state = makeCarState({ participantId: 1, position: 12, classPosition: 3, bestLapMs: 205000, pitCount: 4, gapAheadMs: 8000, currentDriver: "GÜVEN" });
  const events = [{ type: "best_lap", participantId: 1, at: 100, payload: {} }, { type: "pit_in", participantId: 1, at: 200, payload: {} }];
  const sum = buildStintSummary(state, events, 1000);
  assert.equal(sum.type, "stint_summary");
  assert.equal(sum.participantId, 1);
  assert.equal(sum.classPosition, 3);
  assert.equal(sum.pitCount, 4);
  assert.equal(sum.bestLapMs, 205000);
  assert.equal(sum.currentDriver, "GÜVEN");
  assert.equal(sum.eventCount, 2);
  assert.equal(sum.at, 1000);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/summary.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: summary.js yaz**

```js
// src/summary.js
/**
 * Belirli bir andaki durum + son olaylardan stint özeti üretir (saf fonksiyon).
 * @param {import("./model.js").CarState} state
 * @param {Array<{type:string,at:number}>} recentEvents
 * @param {number} at epoch ms
 */
export function buildStintSummary(state, recentEvents, at) {
  return {
    type: "stint_summary",
    participantId: state.participantId,
    carNumber: state.carNumber,
    position: state.position,
    classPosition: state.classPosition,
    bestLapMs: state.bestLapMs,
    lastLapMs: state.lastLapMs,
    gapAheadMs: state.gapAheadMs,
    gapToFirstMs: state.gapToFirstMs,
    pitCount: state.pitCount,
    currentDriver: state.currentDriver,
    eventCount: recentEvents.length,
    at,
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/summary.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/summary.js test/summary.test.js
git commit -m "feat: stint özeti üretici"
```

---

## Task 7: scheduler — periyodik tetikleyici

**Files:**
- Create: `src/scheduler.js`
- Test: `test/scheduler.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/scheduler.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../src/scheduler.js";

test("verilen aralıkta callback'i tetikler", async () => {
  let calls = 0;
  const sched = createScheduler(10, () => { calls++; });
  sched.start();
  await new Promise((r) => setTimeout(r, 35));
  sched.stop();
  assert.ok(calls >= 2, `en az 2 tetik bekleniyordu, ${calls} oldu`);
});

test("stop sonrası tetiklenmez", async () => {
  let calls = 0;
  const sched = createScheduler(10, () => { calls++; });
  sched.start();
  sched.stop();
  const after = calls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, after);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/scheduler.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: scheduler.js yaz**

```js
// src/scheduler.js
/** @param {number} intervalMs @param {() => (void|Promise<void>)} onTick */
export function createScheduler(intervalMs, onTick) {
  let handle = null;
  return {
    start() {
      if (handle) return;
      handle = setInterval(async () => { try { await onTick(); } catch (e) { console.error("[scheduler]", e); } }, intervalMs);
    },
    stop() { if (handle) { clearInterval(handle); handle = null; } },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/scheduler.test.js`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/scheduler.js test/scheduler.test.js
git commit -m "feat: periyodik scheduler (async tick destekli)"
```

---

## Task 8: pollClient — poll döngüsü + snapshot yayını

**Files:**
- Create: `src/pollClient.js`
- Test: `test/pollClient.test.js`

> `pollClient`, `apiClient` ve `scheduler`'ı birleştirir: her tick'te `fetchAll` → `adaptSnapshot` → snapshot yayar. apiClient enjekte edilir (testte sahte).

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/pollClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPollClient } from "../src/pollClient.js";

const fakeApi = {
  async fetchAll() {
    return {
      ranks: [{ pid: 9, overallPosition: 1, position: 1, carNumber: "9", classId: "X" }],
      gaps: [], laps: [], bestLaps: [], pitIn: [], pitOut: [], participants: [], flags: [],
    };
  },
};

test("pollOnce snapshot'ı adaptör'den geçirip yayar", async () => {
  const got = [];
  const pc = createPollClient({ trackedParticipants: [9], pollIntervalSeconds: 1 }, fakeApi);
  pc.onSnapshot((map) => got.push(map));
  await pc.pollOnce();
  assert.equal(got.length, 1);
  assert.equal(got[0].get(9).classPosition, 1);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/pollClient.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: pollClient.js yaz**

```js
// src/pollClient.js
import { adaptSnapshot } from "./adapter.js";
import { createScheduler } from "./scheduler.js";

/**
 * @param {{trackedParticipants:number[], pollIntervalSeconds:number}} cfg
 * @param {{fetchAll: () => Promise<object>}} apiClient
 */
export function createPollClient(cfg, apiClient) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };

  async function pollOnce() {
    const snap = await apiClient.fetchAll();
    const map = adaptSnapshot(snap, cfg.trackedParticipants);
    emit(map);
    return map;
  }

  const scheduler = createScheduler(cfg.pollIntervalSeconds * 1000, () => pollOnce().catch((e) => console.error("[poll]", e)));

  return {
    onSnapshot(cb) { handlers.add(cb); },
    pollOnce,
    start() { scheduler.start(); return pollOnce(); }, // ilk poll'u hemen yap
    stop() { scheduler.stop(); },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/pollClient.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pollClient.js test/pollClient.test.js
git commit -m "feat: pollClient (periyodik REST poll + snapshot yayını)"
```

---

## Task 9: config yükleyici

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/config.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { loadConfig } from "../src/config.js";

const base = { apiBase: "https://insights.griiip.com", sessionId: 18130, trackedParticipants: [400061], pollIntervalSeconds: 8, events: {}, gapThresholdSeconds: 10, stintSummaryIntervalMinutes: 60, webPort: 3000, dataDir: "data" };

test("geçerli config yüklenir", () => {
  const p = "config.test.json";
  writeFileSync(p, JSON.stringify(base));
  const cfg = loadConfig(p);
  assert.equal(cfg.sessionId, 18130);
  assert.equal(cfg.trackedParticipants[0], 400061);
  rmSync(p);
});

test("apiBase boşsa hata fırlatır", () => {
  const p = "config.bad.json";
  writeFileSync(p, JSON.stringify({ ...base, apiBase: "" }));
  assert.throws(() => loadConfig(p), /apiBase/);
  rmSync(p);
});

test("trackedParticipants boşsa hata fırlatır", () => {
  const p = "config.bad2.json";
  writeFileSync(p, JSON.stringify({ ...base, trackedParticipants: [] }));
  assert.throws(() => loadConfig(p), /trackedParticipants/);
  rmSync(p);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/config.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: config.js yaz**

```js
// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(path = "config.json") {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (!cfg.apiBase) throw new Error("config: apiBase zorunlu");
  if (!cfg.sessionId) throw new Error("config: sessionId zorunlu");
  if (!Array.isArray(cfg.trackedParticipants) || cfg.trackedParticipants.length === 0) throw new Error("config: trackedParticipants boş olamaz");
  if (!cfg.pollIntervalSeconds || cfg.pollIntervalSeconds < 1) throw new Error("config: pollIntervalSeconds >= 1 olmalı");
  return cfg;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/config.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: config yükleyici ve doğrulama"
```

---

## Task 10: webServer — Express + SSE

**Files:**
- Create: `src/webServer.js`
- Test: `test/webServer.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/webServer.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/webServer.js";

test("server başlar, /api/state döner ve SSE'ye yayım yapar", async () => {
  const getState = () => ({ 400061: { participantId: 400061, classPosition: 3 } });
  const server = createWebServer({ port: 0, getState, publicDir: "public" });
  const { port } = await server.listen();

  const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  assert.equal(state[400061].classPosition, 3);

  const ctrl = new AbortController();
  const sse = await fetch(`http://127.0.0.1:${port}/events`, { headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
  const reader = sse.body.getReader();
  server.broadcast({ type: "pit_in", participantId: 400061, payload: {}, at: 1 });
  const { value } = await reader.read();
  assert.match(new TextDecoder().decode(value), /pit_in/);

  ctrl.abort();
  await server.close();
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/webServer.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: webServer.js yaz**

```js
// src/webServer.js
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export function createWebServer({ port, getState, publicDir }) {
  const app = express();
  const clients = new Set();
  const root = publicDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "public");
  app.use(express.static(resolve(root)));

  app.get("/api/state", (_req, res) => res.json(getState()));
  app.get("/events", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  let httpServer = null;
  return {
    listen() {
      return new Promise((res) => { httpServer = app.listen(port, "127.0.0.1", () => res({ port: httpServer.address().port })); });
    },
    broadcast(payload) {
      const line = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) res.write(line);
    },
    close() {
      return new Promise((res) => {
        for (const r of clients) r.end();
        clients.clear();
        if (httpServer) httpServer.close(() => res()); else res();
      });
    },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/webServer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/webServer.js test/webServer.test.js
git commit -m "feat: Express web server + SSE yayını"
```

---

## Task 11: index.js — modülleri bağla (entrypoint)

**Files:**
- Create: `src/index.js`

> Birim test yok; manuel doğrulama Task 13'te. Mantık alt modül testleriyle güvence altında.

- [ ] **Step 1: index.js yaz**

```js
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
```

- [ ] **Step 2: Başlatma kontrolü (gerçek API'ye bağlanır, canlıysa veri gelir)**

Run: `timeout 20 node src/index.js` (veya elle başlatıp ~15 sn sonra Ctrl+C)
Expected: `[web] http://127.0.0.1:3000`, `[poll] SID-18130 izleniyor`. Hata fırlatmadan çalışmalı; `data/state.json` oluşmalı.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: entrypoint - poll/detector/store/web bağlantısı"
```

---

## Task 12: Frontend dashboard

**Files:**
- Create: `public/index.html`, `public/app.js`

- [ ] **Step 1: index.html yaz**

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WEC Stint Watcher</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #111; color: #eee; }
    header { padding: 12px 16px; background: #1c1c1c; display: flex; justify-content: space-between; align-items: center; }
    #status { font-size: 13px; padding: 2px 8px; border-radius: 10px; background: #444; }
    #status.ok { background: #1a7f37; } #status.bad { background: #b62324; }
    main { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
    table { width: 100%; border-collapse: collapse; } td, th { padding: 4px 8px; text-align: left; border-bottom: 1px solid #333; }
    #events li { padding: 6px 8px; border-bottom: 1px solid #222; font-size: 14px; }
    button { background: #2563eb; color: #fff; border: 0; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <header>
    <strong>WEC Stint Watcher</strong>
    <span><span id="status">bağlanıyor…</span> <button id="enableNotif">Bildirimleri aç</button></span>
  </header>
  <main>
    <section><h3>Durum</h3><table id="stateTable"><tbody></tbody></table></section>
    <section><h3>Olaylar</h3><ul id="events" style="list-style:none;padding:0;margin:0;"></ul></section>
  </main>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: app.js yaz**

```js
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
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: dashboard (canlı tablo + olay akışı + Notification)"
```

---

## Task 13: Uçtan uca doğrulama + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Tüm testleri çalıştır**

Run: `npm test`
Expected: tüm test dosyaları PASS.

- [ ] **Step 2: Gerçek çalıştırma (yarış canlıyken)**

Run: `npm start`
Expected: `[web] http://127.0.0.1:3000`, `[poll] SID-18130 izleniyor`. Tarayıcıda `http://127.0.0.1:3000` aç, "Bildirimleri aç"a bas. Durum tablosu #91 aracını gösterir; poll aralığında güncellenir; olay (pit/pozisyon/tur) geldikçe listede görünür + masaüstü bildirimi gelir. `data/events.jsonl` dolmalı.

- [ ] **Step 3: README yaz**

```markdown
# WEC Stint Watcher

FIA WEC 24h yarışında bir aracı (varsayılan: #91 Manthey, pid 400061) izleyip önemli
olaylarda tarayıcı bildirimi veren ve periyodik stint özeti üreten 7/24 Node.js servisi.
Veri kaynağı: Griiip açık REST API (insights.griiip.com), polling ile.

## Kurulum
npm install

## Çalıştır
npm start
# http://127.0.0.1:3000 — "Bildirimleri aç"a bas

## Yapılandırma — config.json
- apiBase: API kökü (https://insights.griiip.com)
- sessionId: izlenecek oturum (örn. 18130)
- trackedParticipants: takip edilecek araç pid'leri (ilk sürüm tek araç)
- pollIntervalSeconds: poll aralığı (sn)
- events: olay türü başına aç/kapa
- gapThresholdSeconds: gap eşiği
- stintSummaryIntervalMinutes: özet aralığı

## Test
npm test

## Mimari
pollClient (REST poll) -> adapter (CarState) -> eventDetector (diff) -> store + webServer (SSE) -> tarayıcı
Şema/endpoint detayları: docs/specs/feed-schema.md
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README ve çalıştırma talimatları"
```

---

## Notlar / Riskler

- **Poll yükü:** Her tick'te 8 endpoint çekiliyor. `pollIntervalSeconds: 8` makul (saatte ~3600 istek). API public ve hızlı; gerekirse aralık artırılır. Nazik davranmak için User-Agent set ediliyor.
- **inPit türetmesi** pit-in/pit-out ts karşılaştırmasına dayanıyor. Pratikte pit-out kaydı pit-in'den hemen sonra gelir; kısa süreli "inPit=true" penceresi pit_in/pit_out olaylarını üretmeye yeter. Eğer fixture incelemesinde `participants-running-status` daha net bir pit göstergesi veriyorsa adapter onu kullanacak şekilde güncellenebilir (opsiyonel iyileştirme).
- **fastest_lap** artık destekleniyor: `best-laps[].color === "Purple"` genel en hızlı turu tutan aracı işaret ediyor; false->true geçişi `fastest_lap` üretir.
- **Tek araç** ile başlanıyor; kod `trackedParticipants` listesini döngüyle işliyor → çoklu araca geçiş yalnızca config değişikliği.
- `Date.now()` yalnızca `index.js`'te kullanılıyor; saf modüller zaman damgasını parametre alıyor → deterministik test.
- **Bağlantı durumu rozeti:** SSE açık/kapalı durumuna göre dashboard'da gösteriliyor (poll hatası ayrıca console'a düşer).
