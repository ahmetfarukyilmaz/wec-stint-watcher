# WEC Stint Watcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FIA WEC 24 saat yarışında tek bir aracı 7/24 izleyip önemli olaylarda tarayıcı bildirimi veren ve periyodik stint özeti üreten bağımsız bir Node.js servisi inşa etmek.

**Architecture:** Tek Node.js süreci, 6 odaklı modül: `feedClient` (SignalR'dan ham batch alır) → `adapter` (ham item'ı normalize `CarState`'e çevirir, bilinmeyen şemayı izole eder) → `eventDetector` (saf fonksiyon: önceki state + yeni state → olaylar) → `store` (dosya bazlı kalıcılık) ve `scheduler` (periyodik özet) → `webServer` (Express + SSE) → tarayıcı dashboard (`Notification API`). Bilinmeyen feed şeması tek bir adapter'da izole; geri kalan her şey bizim kontrol ettiğimiz normalize modele karşı yazılır ve test edilir.

**Tech Stack:** Node.js (ESM), `@microsoft/signalr`, Express, native `fetch`, Node `test` runner (`node:test` + `node:assert`), vanilla HTML/JS frontend (build adımı yok).

---

## File Structure

```
wec-stint-watcher/
├── package.json                 # ESM, scripts, deps
├── config.json                  # çalışma yapılandırması (git'te örnek değer)
├── .gitignore
├── data/                        # runtime çıktısı (git ignore)
│   ├── events.jsonl
│   └── state.json
├── fixtures/
│   └── raw-batches.jsonl        # spike çıktısı: gerçek ReceiveBatch item'ları
├── scripts/
│   └── spike.js                 # atılabilir keşif script'i
├── src/
│   ├── index.js                 # entrypoint: tüm modülleri bağlar
│   ├── config.js                # config.json yükler + doğrular
│   ├── model.js                 # normalize tipler (CarState) + olay tipleri (JSDoc + factory)
│   ├── adapter.js               # ham ReceiveBatch item -> CarState (spike şemasından)
│   ├── eventDetector.js         # saf fonksiyon: (prevState, newState) -> Event[]
│   ├── store.js                 # events.jsonl append + state.json snapshot
│   ├── feedClient.js            # SignalR bağlantısı + reconnect, ham batch yayar
│   ├── scheduler.js             # periyodik stint özeti üretir
│   ├── summary.js               # state + events -> stint özeti objesi (saf fonksiyon)
│   └── webServer.js             # Express + SSE; static frontend sunar
├── public/
│   ├── index.html               # dashboard iskeleti
│   └── app.js                   # SSE dinler, tabloyu çizer, Notification tetikler
└── test/
    ├── adapter.test.js
    ├── eventDetector.test.js
    ├── store.test.js
    ├── summary.test.js
    ├── scheduler.test.js
    └── webServer.test.js
```

**Decomposition:** Bilinmeyen feed şeması yalnızca `spike.js` + `adapter.js`'te. `eventDetector`, `summary`, `store`, `scheduler`, `webServer` tamamen normalize `CarState`/`Event` modeline karşı çalışır → spike beklemeden somut yazılır ve test edilir. Adapter, spike şema dokümanı + `fixtures/raw-batches.jsonl` ile tamamlanır.

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
  "scripts": {
    "start": "node src/index.js",
    "spike": "node scripts/spike.js",
    "test": "node --test"
  },
  "dependencies": {
    "@microsoft/signalr": "^8.0.7",
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
  "sessionId": 18130,
  "trackedParticipants": [400061],
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
  "dataDir": "data",
  "hub": { "url": "", "negotiateUrl": "", "auth": null }
}
```

- [ ] **Step 4: Bağımlılıkları kur**

Run: `npm install`
Expected: `node_modules/` oluşur, hata yok.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore config.json
git commit -m "chore: proje iskeleti ve bağımlılıklar"
```

---

## Task 1: Keşif spike'ı — hub şemasını çıkar

**Amaç:** Hub URL'i, auth gereksinimi ve `ReceiveBatch` item şemasını canlı veriyle keşfetmek. Çıktı sonraki task'ları besler. Bu task TDD değildir — keşif amaçlıdır.

**Files:**
- Create: `scripts/spike.js`
- Create (çıktı): `fixtures/raw-batches.jsonl`, `docs/specs/feed-schema.md`

- [ ] **Step 1: spike.js yaz**

```js
// scripts/spike.js — atılabilir keşif script'i.
// livetiming.fiawec.com bundle'ından çıkan bilgiler:
//   - SignalR hub, JoinGroup("SID-<sessionId>"), on("ReceiveBatch", {items:[...]})
// Hub URL'i bilinmiyorsa önce aşağıdaki adaylar denenir; çalışan loglanır.
import * as signalR from "@microsoft/signalr";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";

const SESSION_ID = process.argv[2] ?? "18130";
const CANDIDATE_HUBS = [
  "https://livetiming.fiawec.com/stream",
  "https://insights.griiip.com/stream",
  "https://insights.griiip.com/streamHub",
];

mkdirSync("fixtures", { recursive: true });
const OUT = "fixtures/raw-batches.jsonl";
writeFileSync(OUT, "");

async function tryHub(url) {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(url)
    .withAutomaticReconnect()
    .build();
  let count = 0;
  conn.on("ReceiveBatch", (batch) => {
    if (!batch?.items?.length) return;
    for (const item of batch.items) {
      appendFileSync(OUT, JSON.stringify(item) + "\n");
      count++;
    }
    if (count % 20 === 0) console.log(`[spike] ${count} item yazıldı`);
  });
  await conn.start();
  console.log(`[spike] BAĞLANDI: ${url}`);
  await conn.invoke("JoinGroup", `SID-${SESSION_ID}`);
  console.log(`[spike] JoinGroup SID-${SESSION_ID} başarılı; veri bekleniyor...`);
  return conn;
}

let active = null;
for (const url of CANDIDATE_HUBS) {
  try { active = await tryHub(url); console.log(`Çalışan hub: ${url}`); break; }
  catch (e) { console.warn(`[spike] başarısız: ${url} -> ${e.message}`); }
}
if (!active) { console.error("Hiçbir aday hub çalışmadı. DevTools Network/WS sekmesinden gerçek URL'i alıp CANDIDATE_HUBS'a ekleyin."); process.exit(1); }
process.on("SIGINT", async () => { await active.stop(); console.log("\n[spike] durdu, çıktı: " + OUT); process.exit(0); });
```

- [ ] **Step 2: Yarış canlıyken çalıştır**

Run: `npm run spike 18130`
Expected: "BAĞLANDI" + "JoinGroup ... başarılı" + birikem item logları. Birkaç dakika çalıştırıp `Ctrl+C`.
Eğer hiçbir aday hub çalışmazsa: tarayıcıda live timing sayfasını aç, DevTools → Network → WS sekmesinden gerçek hub/negotiate URL'ini al, `CANDIDATE_HUBS`'a ekle, tekrar dene. Yarış canlı değilse şema çıkarılamaz; canlı seansı bekle.

- [ ] **Step 3: Şemayı dokümante et**

`fixtures/raw-batches.jsonl`'daki birkaç item'ı incele, `docs/specs/feed-schema.md` oluştur. Şu eşlemeleri yaz (gerçek alan adlarıyla):

```markdown
# Feed Schema (spike çıktısı)
- Çalışan hub URL: <buraya>
- Auth gerekli mi: <evet/hayır + nasıl>
- Item -> CarState eşlemesi:
  - participantId  <- item.<alan>
  - position       <- item.<alan>   (genel sıra)
  - classPosition  <- item.<alan>
  - lastLapMs      <- item.<alan>
  - bestLapMs      <- item.<alan>
  - gapAheadMs     <- item.<alan>
  - inPit          <- item.<alan>   (bool veya durum kodu)
  - currentDriver  <- item.<alan>
  - flag           <- item.<alan>   (varsa)
- Pit durumu nasıl kodlanmış: <açıkla>
- Tur süresi birimi: <ms / "1:23.456" string>
```

- [ ] **Step 4: Hub bilgisini config'e yaz**

`config.json` içindeki `hub.url` (ve gerekiyorsa `negotiateUrl`/`auth`) alanlarını spike'te çalışan değerle doldur.

- [ ] **Step 5: Commit**

```bash
git add scripts/spike.js fixtures/raw-batches.jsonl docs/specs/feed-schema.md config.json
git commit -m "feat: keşif spike'ı + feed şema dokümanı + hub config"
```

---

## Task 2: Normalize model + factory'ler

**Files:**
- Create: `src/model.js`
- Test: `test/model.test.js` (basit factory testi)

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
 * @property {number|null} position       genel sıra
 * @property {number|null} classPosition  kategori sırası
 * @property {number|null} lastLapMs
 * @property {number|null} bestLapMs
 * @property {number|null} gapAheadMs      öndeki araca fark (ms)
 * @property {boolean} inPit
 * @property {number} pitCount
 * @property {string|null} currentDriver
 * @property {string|null} flag
 */

/** @returns {CarState} */
export function makeCarState(partial = {}) {
  return {
    participantId: partial.participantId ?? null,
    position: partial.position ?? null,
    classPosition: partial.classPosition ?? null,
    lastLapMs: partial.lastLapMs ?? null,
    bestLapMs: partial.bestLapMs ?? null,
    gapAheadMs: partial.gapAheadMs ?? null,
    inPit: partial.inPit ?? false,
    pitCount: partial.pitCount ?? 0,
    currentDriver: partial.currentDriver ?? null,
    flag: partial.flag ?? null,
  };
}

/**
 * @param {string} type
 * @param {number} participantId
 * @param {object} payload
 * @param {number} at  epoch ms
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

## Task 3: Adapter — ham item → CarState

**Files:**
- Create: `src/adapter.js`
- Test: `test/adapter.test.js`

> Alan eşlemesi `docs/specs/feed-schema.md`'den gelir. Test, spike fixture'ından alınmış GERÇEK bir item ile yazılır (aşağıdaki örnek değerleri kendi fixture'ınla değiştir).

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/adapter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptItem } from "../src/adapter.js";

// NOT: bu raw obje fixtures/raw-batches.jsonl'dan alınan gerçek bir item ile değiştirilecek.
// Aşağıdaki alan adları (rt, pos, lastLap...) feed-schema.md'deki gerçeklerle güncellenir.
const RAW = { id: 400061, pos: 5, cls: 2, lastLap: 208456, bestLap: 205123, gap: 12340, pit: 0, drv: "ESTRE", flag: "GF" };

test("adaptItem ham item'ı CarState'e çevirir", () => {
  const s = adaptItem(RAW);
  assert.equal(s.participantId, 400061);
  assert.equal(s.position, 5);
  assert.equal(s.classPosition, 2);
  assert.equal(s.lastLapMs, 208456);
  assert.equal(s.bestLapMs, 205123);
  assert.equal(s.gapAheadMs, 12340);
  assert.equal(s.inPit, false);
  assert.equal(s.currentDriver, "ESTRE");
  assert.equal(s.flag, "GF");
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/adapter.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: adapter.js yaz**

```js
// src/adapter.js — feed-schema.md'deki eşlemeyi uygular.
// Alan adlarını (it.pos, it.lastLap...) GERÇEK şema ile değiştir.
import { makeCarState } from "./model.js";

/** @param {object} it ham ReceiveBatch item @returns {import("./model.js").CarState} */
export function adaptItem(it) {
  return makeCarState({
    participantId: Number(it.id),
    position: it.pos ?? null,
    classPosition: it.cls ?? null,
    lastLapMs: it.lastLap ?? null,
    bestLapMs: it.bestLap ?? null,
    gapAheadMs: it.gap ?? null,
    inPit: Boolean(it.pit),       // pit kodlaması farklıysa burada normalize et
    currentDriver: it.drv ?? null,
    flag: it.flag ?? null,
  });
}

/** Bir batch'teki tüm item'ları participantId -> CarState haritasına çevirir. */
export function adaptBatch(items) {
  const map = new Map();
  for (const it of items) {
    const s = adaptItem(it);
    if (s.participantId != null) map.set(s.participantId, s);
  }
  return map;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/adapter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapter.js test/adapter.test.js
git commit -m "feat: ham feed item'ını normalize CarState'e çeviren adapter"
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

test("pozisyon iyileşince position_change üretir", () => {
  const prev = makeCarState({ participantId: 1, position: 5 });
  const next = makeCarState({ participantId: 1, position: 3 });
  const evs = detectEvents(prev, next, cfg, NOW);
  const e = evs.find(x => x.type === "position_change");
  assert.ok(e);
  assert.deepEqual(e.payload, { from: 5, to: 3, gained: true });
});

test("inPit false->true pit_in üretir, pitCount artar", () => {
  const prev = makeCarState({ participantId: 1, inPit: false, pitCount: 0 });
  const next = makeCarState({ participantId: 1, inPit: true, pitCount: 0 });
  const evs = detectEvents(prev, next, cfg, NOW);
  assert.ok(evs.find(x => x.type === "pit_in"));
});

test("inPit true->false pit_out üretir", () => {
  const prev = makeCarState({ participantId: 1, inPit: true });
  const next = makeCarState({ participantId: 1, inPit: false });
  const evs = detectEvents(prev, next, cfg, NOW);
  assert.ok(evs.find(x => x.type === "pit_out"));
});

test("bestLap düşünce best_lap üretir", () => {
  const prev = makeCarState({ participantId: 1, bestLapMs: 206000 });
  const next = makeCarState({ participantId: 1, bestLapMs: 205000 });
  const evs = detectEvents(prev, next, cfg, NOW);
  assert.ok(evs.find(x => x.type === "best_lap"));
});

test("sürücü değişince driver_change üretir", () => {
  const prev = makeCarState({ participantId: 1, currentDriver: "A" });
  const next = makeCarState({ participantId: 1, currentDriver: "B" });
  const evs = detectEvents(prev, next, cfg, NOW);
  const e = evs.find(x => x.type === "driver_change");
  assert.deepEqual(e.payload, { from: "A", to: "B" });
});

test("gap eşiği yalnızca geçişte tetiklenir (histerezis)", () => {
  // 12s -> 9s: eşik altına indi -> tetikle
  let evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 12000 }), makeCarState({ participantId: 1, gapAheadMs: 9000 }), cfg, NOW);
  assert.ok(evs.find(x => x.type === "gap_threshold"));
  // 9s -> 8s: zaten eşik altındaydı -> tekrar tetikleme
  evs = detectEvents(makeCarState({ participantId: 1, gapAheadMs: 9000 }), makeCarState({ participantId: 1, gapAheadMs: 8000 }), cfg, NOW);
  assert.equal(evs.find(x => x.type === "gap_threshold"), undefined);
});

test("değişiklik yoksa boş dizi döner", () => {
  const s = makeCarState({ participantId: 1, position: 3 });
  assert.deepEqual(detectEvents(s, { ...s }, cfg, NOW), []);
});

test("kapatılan olay türü üretilmez", () => {
  const c = { ...cfg, events: { ...cfg.events, position_change: false } };
  const evs = detectEvents(makeCarState({ participantId: 1, position: 5 }), makeCarState({ participantId: 1, position: 3 }), c, NOW);
  assert.equal(evs.find(x => x.type === "position_change"), undefined);
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
 * @returns {Array<ReturnType<typeof makeEvent>>}
 */
export function detectEvents(prev, next, cfg, at) {
  const events = [];
  const on = (k) => cfg.events?.[k];
  const pid = next.participantId;

  if (on("position_change") && prev.position != null && next.position != null && next.position !== prev.position) {
    events.push(makeEvent("position_change", pid, { from: prev.position, to: next.position, gained: next.position < prev.position }, at));
  }

  if (on("pit")) {
    if (!prev.inPit && next.inPit) events.push(makeEvent("pit_in", pid, { pitCount: next.pitCount }, at));
    if (prev.inPit && !next.inPit) events.push(makeEvent("pit_out", pid, { pitCount: next.pitCount }, at));
  }

  if (on("lap") && prev.bestLapMs != null && next.bestLapMs != null && next.bestLapMs < prev.bestLapMs) {
    events.push(makeEvent("best_lap", pid, { from: prev.bestLapMs, to: next.bestLapMs }, at));
  }

  if (on("driver_change") && next.currentDriver && prev.currentDriver && next.currentDriver !== prev.currentDriver) {
    events.push(makeEvent("driver_change", pid, { from: prev.currentDriver, to: next.currentDriver }, at));
  }

  if (on("gap_threshold") && prev.gapAheadMs != null && next.gapAheadMs != null) {
    const thr = cfg.gapThresholdSeconds * 1000;
    const wasAbove = prev.gapAheadMs >= thr;
    const nowBelow = next.gapAheadMs < thr;
    if (wasAbove && nowBelow) {
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
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add src/eventDetector.js test/eventDetector.test.js
git commit -m "feat: saf olay dedektörü (position/pit/lap/driver/gap/flag)"
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
  s1.saveState({ 1: { participantId: 1, position: 3 } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadState()[1].position, 3);
});

test("boş dizinde loadState boş obje döner", () => {
  const s = createStore(DIR);
  assert.deepEqual(s.loadState(), {});
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
    appendEvent(event) {
      appendFileSync(eventsPath, JSON.stringify(event) + "\n");
    },
    readEvents() {
      if (!existsSync(eventsPath)) return [];
      return readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
    saveState(stateMap) {
      writeFileSync(statePath, JSON.stringify(stateMap));
    },
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
  const state = makeCarState({ participantId: 1, position: 3, classPosition: 1, bestLapMs: 205000, pitCount: 4, gapAheadMs: 8000 });
  const events = [
    { type: "best_lap", participantId: 1, at: 100, payload: {} },
    { type: "pit_in", participantId: 1, at: 200, payload: {} },
  ];
  const sum = buildStintSummary(state, events, 1000);
  assert.equal(sum.participantId, 1);
  assert.equal(sum.position, 3);
  assert.equal(sum.classPosition, 1);
  assert.equal(sum.pitCount, 4);
  assert.equal(sum.bestLapMs, 205000);
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
    position: state.position,
    classPosition: state.classPosition,
    bestLapMs: state.bestLapMs,
    lastLapMs: state.lastLapMs,
    gapAheadMs: state.gapAheadMs,
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
  const sched = createScheduler(10, () => { calls++; }); // 10 ms
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
/** @param {number} intervalMs @param {() => void} onTick */
export function createScheduler(intervalMs, onTick) {
  let handle = null;
  return {
    start() {
      if (handle) return;
      handle = setInterval(() => { try { onTick(); } catch (e) { console.error("[scheduler]", e); } }, intervalMs);
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
git commit -m "feat: periyodik scheduler"
```

---

## Task 8: webServer — Express + SSE

**Files:**
- Create: `src/webServer.js`
- Test: `test/webServer.test.js`

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/webServer.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/webServer.js";

test("server başlar, /api/state mevcut durumu döner ve SSE'ye yayım yapılır", async () => {
  const getState = () => ({ 1: { participantId: 1, position: 3 } });
  const server = createWebServer({ port: 0, getState, publicDir: "public" });
  const { port } = await server.listen();

  const stateRes = await fetch(`http://127.0.0.1:${port}/api/state`);
  const state = await stateRes.json();
  assert.equal(state[1].position, 3);

  // SSE bağlan, broadcast edilen olayı al
  const ctrl = new AbortController();
  const sseRes = await fetch(`http://127.0.0.1:${port}/events`, { headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
  const reader = sseRes.body.getReader();
  server.broadcast({ type: "pit_in", participantId: 1, payload: {}, at: 1 });
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /pit_in/);

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
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  let httpServer = null;
  return {
    listen() {
      return new Promise((resolveListen) => {
        httpServer = app.listen(port, "127.0.0.1", () => resolveListen({ port: httpServer.address().port }));
      });
    },
    broadcast(payload) {
      const line = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of clients) res.write(line);
    },
    close() {
      return new Promise((resolveClose) => {
        for (const res of clients) res.end();
        clients.clear();
        if (httpServer) httpServer.close(() => resolveClose());
        else resolveClose();
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

test("config yükler ve zorunlu alanları doğrular", () => {
  const p = "config.test.json";
  writeFileSync(p, JSON.stringify({ sessionId: 18130, trackedParticipants: [400061], events: {}, gapThresholdSeconds: 10, stintSummaryIntervalMinutes: 60, webPort: 3000, dataDir: "data", hub: { url: "x" } }));
  const cfg = loadConfig(p);
  assert.equal(cfg.sessionId, 18130);
  assert.equal(cfg.trackedParticipants[0], 400061);
  rmSync(p);
});

test("hub.url boşsa hata fırlatır", () => {
  const p = "config.bad.json";
  writeFileSync(p, JSON.stringify({ sessionId: 1, trackedParticipants: [1], events: {}, gapThresholdSeconds: 10, stintSummaryIntervalMinutes: 60, webPort: 3000, dataDir: "data", hub: { url: "" } }));
  assert.throws(() => loadConfig(p), /hub\.url/);
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
  if (!cfg.sessionId) throw new Error("config: sessionId zorunlu");
  if (!Array.isArray(cfg.trackedParticipants) || cfg.trackedParticipants.length === 0) throw new Error("config: trackedParticipants boş olamaz");
  if (!cfg.hub?.url) throw new Error("config: hub.url boş (önce spike'ı çalıştırın)");
  return cfg;
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/config.test.js`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: config yükleyici ve doğrulama"
```

---

## Task 10: feedClient — SignalR bağlantısı + reconnect

**Files:**
- Create: `src/feedClient.js`
- Test: `test/feedClient.test.js`

> `feedClient` `@microsoft/signalr` `HubConnection`'ı enjekte edilebilir bir factory ile alır; böylece testte sahte bağlantı kullanılır (gerçek ağ olmadan).

- [ ] **Step 1: Başarısız testi yaz**

```js
// test/feedClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFeedClient } from "../src/feedClient.js";

function makeFakeConnection() {
  const handlers = {};
  return {
    on(name, cb) { handlers[name] = cb; },
    async start() { this.started = true; },
    async invoke(method, arg) { this.invoked = { method, arg }; },
    async stop() { this.stopped = true; },
    onreconnected() {},
    onclose() {},
    _emit(name, payload) { handlers[name]?.(payload); },
  };
}

test("start hub'a bağlanır ve JoinGroup çağırır", async () => {
  const fake = makeFakeConnection();
  const fc = createFeedClient({ sessionId: 18130, hub: { url: "x" } }, () => fake);
  await fc.start();
  assert.equal(fake.started, true);
  assert.deepEqual(fake.invoked, { method: "JoinGroup", arg: "SID-18130" });
});

test("ReceiveBatch item'ları onBatch ile yayılır", async () => {
  const fake = makeFakeConnection();
  const received = [];
  const fc = createFeedClient({ sessionId: 18130, hub: { url: "x" } }, () => fake);
  fc.onBatch((items) => received.push(...items));
  await fc.start();
  fake._emit("ReceiveBatch", { items: [{ id: 1 }, { id: 2 }] });
  assert.equal(received.length, 2);
});

test("boş batch yayılmaz", async () => {
  const fake = makeFakeConnection();
  let calls = 0;
  const fc = createFeedClient({ sessionId: 1, hub: { url: "x" } }, () => fake);
  fc.onBatch(() => calls++);
  await fc.start();
  fake._emit("ReceiveBatch", { items: [] });
  fake._emit("ReceiveBatch", null);
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `node --test test/feedClient.test.js`
Expected: FAIL — modül yok.

- [ ] **Step 3: feedClient.js yaz**

```js
// src/feedClient.js
import * as signalR from "@microsoft/signalr";

/**
 * @param {{sessionId:number, hub:{url:string}}} cfg
 * @param {(url:string)=>any} [connectionFactory] test için enjekte edilebilir
 */
export function createFeedClient(cfg, connectionFactory) {
  const factory = connectionFactory ?? ((url) =>
    new signalR.HubConnectionBuilder().withUrl(url).withAutomaticReconnect().build());

  const conn = factory(cfg.hub.url);
  const batchHandlers = new Set();
  const statusHandlers = new Set();
  const emitStatus = (s) => { for (const h of statusHandlers) h(s); };

  conn.on("ReceiveBatch", (batch) => {
    if (!batch?.items?.length) return;
    for (const h of batchHandlers) h(batch.items);
  });
  if (conn.onreconnected) conn.onreconnected(() => { emitStatus("reconnected"); conn.invoke("JoinGroup", `SID-${cfg.sessionId}`).catch(() => {}); });
  if (conn.onclose) conn.onclose(() => emitStatus("closed"));

  return {
    onBatch(cb) { batchHandlers.add(cb); },
    onStatus(cb) { statusHandlers.add(cb); },
    async start() {
      await conn.start();
      emitStatus("connected");
      await conn.invoke("JoinGroup", `SID-${cfg.sessionId}`);
    },
    async stop() { await conn.invoke?.("LeaveGroup", `SID-${cfg.sessionId}`).catch(() => {}); await conn.stop(); },
  };
}
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `node --test test/feedClient.test.js`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/feedClient.js test/feedClient.test.js
git commit -m "feat: SignalR feed client (reconnect + JoinGroup)"
```

---

## Task 11: index.js — modülleri bağla (entrypoint)

**Files:**
- Create: `src/index.js`

> Bu task tüm modülleri birleştirir. Birim test yok; manuel doğrulama Task 13'te. Mantığın doğruluğu alt modüllerin testleriyle güvence altında.

- [ ] **Step 1: index.js yaz**

```js
// src/index.js
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { createFeedClient } from "./feedClient.js";
import { adaptBatch } from "./adapter.js";
import { detectEvents } from "./eventDetector.js";
import { makeCarState } from "./model.js";
import { buildStintSummary } from "./summary.js";
import { createScheduler } from "./scheduler.js";
import { createWebServer } from "./webServer.js";

const cfg = loadConfig();
const store = createStore(cfg.dataDir);
const tracked = new Set(cfg.trackedParticipants);

// Restart sonrası son durumu yükle
const stateMap = new Map(Object.entries(store.loadState()).map(([k, v]) => [Number(k), v]));

const web = createWebServer({ port: cfg.webPort, getState: () => Object.fromEntries(stateMap) });

const feed = createFeedClient(cfg, undefined);
feed.onStatus((s) => web.broadcast({ type: "connection", payload: { status: s }, at: nowMs() }));

feed.onBatch((items) => {
  const batchMap = adaptBatch(items);
  for (const pid of tracked) {
    const next = batchMap.get(pid);
    if (!next) continue;
    const prev = stateMap.get(pid) ?? makeCarState({ participantId: pid });
    const events = detectEvents(prev, next, cfg, nowMs());
    // pitCount'u koru/arttır: pit_in olduysa say
    if (events.some((e) => e.type === "pit_in")) next.pitCount = (prev.pitCount ?? 0) + 1;
    else next.pitCount = prev.pitCount ?? 0;
    stateMap.set(pid, next);
    for (const ev of events) { store.appendEvent(ev); web.broadcast(ev); }
  }
  store.saveState(Object.fromEntries(stateMap));
});

// Periyodik stint özeti
const scheduler = createScheduler(cfg.stintSummaryIntervalMinutes * 60 * 1000, () => {
  const recent = store.readEvents();
  for (const pid of tracked) {
    const st = stateMap.get(pid);
    if (!st) continue;
    const summary = buildStintSummary(st, recent.filter((e) => e.participantId === pid), nowMs());
    store.appendEvent(summary);
    web.broadcast(summary);
  }
});

function nowMs() { return Date.now(); }

const { port } = await web.listen();
console.log(`[web] http://127.0.0.1:${port}`);
await feed.start();
scheduler.start();
console.log(`[feed] SID-${cfg.sessionId} izleniyor; takip: ${[...tracked].join(", ")}`);

process.on("SIGINT", async () => { scheduler.stop(); await feed.stop(); await web.close(); process.exit(0); });
```

- [ ] **Step 2: Söz dizimi/başlatma kontrolü (hub.url boş olduğu için config hatası beklenir)**

Run: `node src/index.js`
Expected: `config: hub.url boş` hatası (spike yapılmadıysa). Hata mesajı bekleniyorsa import zincirinin çalıştığı doğrulanmış olur.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: entrypoint - tüm modülleri bağla"
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

function renderState(state) {
  tbody.innerHTML = "";
  for (const car of Object.values(state)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>#${car.participantId}</td><td>P${car.position ?? "-"}</td><td>cls ${car.classPosition ?? "-"}</td><td>${fmtLap(car.lastLapMs)}</td><td>pit ${car.pitCount ?? 0}</td>`;
    tbody.appendChild(tr);
  }
}

const LABELS = {
  position_change: (p) => `Pozisyon: P${p.from} → P${p.to}${p.gained ? " ⬆" : " ⬇"}`,
  pit_in: () => "Pite girdi",
  pit_out: () => "Pitten çıktı",
  best_lap: (p) => `Yeni en iyi tur: ${fmtLap(p.to)}`,
  driver_change: (p) => `Sürücü değişti: ${p.from} → ${p.to}`,
  gap_threshold: (p) => `Öndeki araca fark ${p.thresholdSeconds}sn altına indi`,
  flag: (p) => `Bayrak: ${p.to}`,
  stint_summary: (p) => `Stint özeti — P${p.position}, ${p.pitCount} pit, en iyi ${fmtLap(p.bestLapMs)}`,
  connection: (p) => `Bağlantı: ${p.status}`,
};

function addEvent(ev) {
  const li = document.createElement("li");
  const label = (LABELS[ev.type] ?? ((p) => ev.type))(ev.payload ?? {});
  li.textContent = `#${ev.participantId ?? "-"} — ${label}`;
  eventsEl.prepend(li);
  if (ev.type === "connection") {
    statusEl.textContent = ev.payload.status;
    statusEl.className = ev.payload.status === "connected" || ev.payload.status === "reconnected" ? "ok" : "bad";
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("WEC Watcher", { body: `#${ev.participantId ?? ""} ${label}` });
  }
}

fetch("/api/state").then((r) => r.json()).then(renderState).catch(() => {});

const es = new EventSource("/events");
es.onopen = () => { statusEl.textContent = "bağlı"; statusEl.className = "ok"; };
es.onerror = () => { statusEl.textContent = "bağlantı koptu"; statusEl.className = "bad"; };
es.onmessage = (e) => { const ev = JSON.parse(e.data); addEvent(ev); fetch("/api/state").then((r) => r.json()).then(renderState).catch(() => {}); };
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: dashboard (canlı tablo + olay akışı + Notification)"
```

---

## Task 13: Uçtan uca manuel doğrulama + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Tüm testleri çalıştır**

Run: `npm test`
Expected: tüm test dosyaları PASS.

- [ ] **Step 2: Fixture ile sahte besleme doğrulaması (opsiyonel, hub olmadan)**

`fixtures/raw-batches.jsonl` doluysa, `adaptBatch` + `detectEvents`'i fixture üzerinde elle çalıştırıp olay üretildiğini gözle (geçici bir script ya da node REPL ile). Hub canlıysa doğrudan `npm start` yeterli.

- [ ] **Step 3: Gerçek çalıştırma (hub canlıyken)**

Run: `npm start`
Expected: `[web] http://127.0.0.1:3000`, `[feed] SID-18130 izleniyor`. Tarayıcıda `http://127.0.0.1:3000` aç, "Bildirimleri aç"a bas, olay geldikçe tabloda ve listede gör + masaüstü bildirimi al.

- [ ] **Step 4: README yaz**

```markdown
# WEC Stint Watcher

FIA WEC 24h yarışında bir aracı izleyip önemli olaylarda tarayıcı bildirimi veren
ve periyodik stint özeti üreten 7/24 Node.js servisi.

## Kurulum
npm install

## 1) Keşif (ilk kez, yarış canlıyken)
npm run spike 18130
# fixtures/raw-batches.jsonl ve docs/specs/feed-schema.md üretir.
# Şemaya göre src/adapter.js eşlemesini ve config.json hub.url'ini güncelle.

## 2) Çalıştır
npm start
# http://127.0.0.1:3000

## Yapılandırma — config.json
- sessionId: izlenecek oturum (örn. 18130)
- trackedParticipants: takip edilecek araç id'leri (ilk sürüm tek araç)
- events: olay türü başına aç/kapa
- gapThresholdSeconds: gap eşiği
- stintSummaryIntervalMinutes: özet aralığı

## Test
npm test
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README ve çalıştırma talimatları"
```

---

## Notlar / Riskler

- **En büyük risk:** hub URL'i ve `items` şeması. Task 1 (spike) bunu çözmeden Task 3 (adapter) ve uçtan uca çalışma netleşmez. Spike canlı seans gerektirir.
- **pitCount mantığı** `index.js`'te tutuluyor (feed pit sayısını vermiyorsa). Feed zaten pitCount veriyorsa adapter'da doğrudan eşle ve index.js'teki artırmayı kaldır.
- **Tek araç** ile başlanıyor; `trackedParticipants` çoklu id alabilir, kod zaten döngüyle işliyor — çoklu araca geçiş yapılandırma değişikliği kadar basit.
- **`fastest_lap` (genel seans rekoru) bilinçli ertelendi.** İlk sürüm `best_lap` (aracın kişisel en iyi turu) üretir. Genel seans rekoru tüm araçların turlarını izlemeyi gerektirir; tek araç takibinde mevcut değil. Çoklu araç desteğiyle birlikte eklenecek (tüm batch'teki min bestLapMs takip edilerek).
- `Date.now()` yalnızca runtime'da (`index.js`/testlerde) kullanılıyor; saf modüller zaman damgasını parametre alıyor → deterministik test.
