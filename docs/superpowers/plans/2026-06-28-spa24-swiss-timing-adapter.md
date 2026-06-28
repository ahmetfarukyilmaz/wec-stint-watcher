# Spa24 (Swiss Timing) Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `wec-stint-watcher`'ı Crowdstrike 24 Hours of Spa'ya (Swiss Timing veri kaynağı) uyarlamak; mevcut WEC (Griiip) desteğini bozmadan, config ile seçilebilir bir provider soyutlaması ile.

**Architecture:** pollClient'ı provider'a özgü tüm işleri (fetch, buildCars, raceLog, clock, adapt) delege eden bir **provider bundle** arayüzü üzerinden genelleştir. Mevcut Griiip mantığı `src/providers/griiip.js`'e sarılır; Swiss için `src/providers/swiss.js` + `src/swissApiClient.js` + `src/swissParse.js` eklenir. `config.json.provider` ile seçilir. eventDetector/store/webServer/scheduler/trackingStore/frontend değişmez.

**Tech Stack:** Node 18+ (ESM, built-in `fetch`, `node:test`), express. Bağımlılık eklenmez.

## Global Constraints

- Yeni runtime bağımlılığı YOK (sadece Node built-in + mevcut express).
- ESM (`import`/`export`), Node >=18.
- Mevcut 62 test bozulmamalı (Griiip geriye uyumlu).
- Saf fonksiyonlar test edilir; I/O (`fetch`) enjekte edilebilir olmalı.
- Türkçe yorum/commit dili (mevcut kod stiliyle uyumlu).
- Kullanım: yalnızca kişisel/lokal (`127.0.0.1`); veri yayma yok.
- Swiss base URL: `https://ps-cache.web.swisstiming.com/node/db/RAC_PROD/`
- Dosya adlarındaki GUID'ler BÜYÜK harf.

---

### Task 1: Swiss fixtures + feed şeması dokümanı

Canlı yarıştan çekilmiş fixture'ları kalıcılaştır ve şemayı belgele. Fixture'lar zaten `fixtures/swiss_*.json` olarak kaydedildi (Task 0'da, yarış canlıyken).

**Files:**
- Create: `docs/specs/feed-schema-swiss.md`
- Use (zaten var): `fixtures/swiss_seasons.json`, `swiss_season.json`, `swiss_schedule.json`, `swiss_timing.json`, `swiss_comp_detail.json`

**Interfaces:**
- Produces: test fixture'ları (sonraki tüm task'lar tüketir).

- [ ] **Step 1: Fixture'ların varlığını doğrula**

Run: `ls -la fixtures/swiss_*.json && node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('fixtures/swiss_timing.json')).content.full.Results).length+' competitor')"`
Expected: 5 dosya listelenir; "69 competitor" benzeri çıktı.

- [ ] **Step 2: Feed şeması dokümanını yaz**

`docs/specs/feed-schema-swiss.md` içeriği (Griiip `feed-schema.md` ile aynı üslupta): base URL, keşif zinciri tablosu, TIMING şeması (UntInfo + Results), COMP_DETAIL şeması (Competitors: Bib, ClassId, TeamName, CarTypeName, ManufacturerName, Drivers, CurrentDriverId, InPitLane, PitStopCount; Classes; Messages), join anahtarı CompetitorId, Status gözlemi (2=koşuyor, 4=durmuş), hava yok. (İçerik design spec'inden kopyalanır: `docs/superpowers/specs/2026-06-28-spa24-swiss-timing-adapter-design.md`.)

- [ ] **Step 3: Commit**

```bash
git add fixtures/swiss_*.json docs/specs/feed-schema-swiss.md
git commit -m "test(fixtures): Spa24 Swiss Timing canlı fixture'ları + feed şeması"
```

---

### Task 2: Zaman parse yardımcıları (`swissParse.js`)

Swiss Timing zaman string'lerini ms'ye çeviren saf fonksiyonlar. İki format: tur süresi `"2:17.484"` / `"39.697"` (m:ss.mmm veya ss.mmm) ve saat `"20:05:04.277"` / `"3:17:46"` (h:mm:ss[.mmm]).

**Files:**
- Create: `src/swissParse.js`
- Test: `test/swissParse.test.js`

**Interfaces:**
- Produces:
  - `parseLapMs(s: string|null) -> number|null` — "m:ss.mmm" veya "ss.mmm" → ms
  - `parseClockMs(s: string|null) -> number|null` — "h:mm:ss.mmm" veya "h:mm:ss" → ms

- [ ] **Step 1: Write the failing test**

```js
// test/swissParse.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLapMs, parseClockMs } from "../src/swissParse.js";

test("parseLapMs: m:ss.mmm", () => {
  assert.equal(parseLapMs("2:17.484"), 137484);
});
test("parseLapMs: ss.mmm (dakikasız)", () => {
  assert.equal(parseLapMs("39.697"), 39697);
});
test("parseLapMs: boş/null → null", () => {
  assert.equal(parseLapMs(null), null);
  assert.equal(parseLapMs(""), null);
});
test("parseClockMs: h:mm:ss.mmm", () => {
  assert.equal(parseClockMs("20:05:04.277"), 72304277);
});
test("parseClockMs: h:mm:ss (ms'siz)", () => {
  assert.equal(parseClockMs("3:17:46"), 11866000);
});
test("parseClockMs: boş → null", () => {
  assert.equal(parseClockMs(""), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/swissParse.test.js`
Expected: FAIL — `Cannot find module '../src/swissParse.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/swissParse.js
// Swiss Timing zaman string'lerini ms'ye çeviren saf yardımcılar.

/** "2:17.484" | "39.697" → ms (tur süresi). */
export function parseLapMs(s) {
  if (!s || typeof s !== "string") return null;
  const [main, frac = "0"] = s.split(".");
  const parts = main.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p; // [ss] veya [mm, ss]
  const ms = Number((frac + "000").slice(0, 3));
  return sec * 1000 + ms;
}

/** "20:05:04.277" | "3:17:46" → ms (saat/kalan süre). */
export function parseClockMs(s) {
  if (!s || typeof s !== "string") return null;
  const [main, frac = "0"] = s.split(".");
  const parts = main.split(":").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p; // [hh, mm, ss]
  const ms = Number((frac + "000").slice(0, 3));
  return sec * 1000 + ms;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/swissParse.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/swissParse.js test/swissParse.test.js
git commit -m "feat(swiss): zaman parse yardımcıları (lap/clock → ms)"
```

---

### Task 3: Swiss adapter — TIMING+COMP_DETAIL → CarState (`swissAdapter.js`)

Saf fonksiyon: birleşik snapshot'tan takip edilen pid'ler için `Map<pid, CarState>`. İç pid = `Bib` (araç no, sayıya parse; boş/0 ise CompetitorId fallback).

**Files:**
- Create: `src/swissAdapter.js`
- Test: `test/swissAdapter.test.js`

**Interfaces:**
- Consumes: `parseLapMs`, `parseClockMs` (Task 2); `makeCarState` (`src/model.js`).
- Produces:
  - `swissBuildCars(snap) -> Array<{pid, carNumber, classId, team, overall, classPos, gapToFirstMs, competitorId}>`
  - `swissAdaptSnapshot(snap, trackedPids) -> Map<number, CarState>`
  - `pidOf(competitor) -> number` (Bib→Number, fallback hash)
  - snap şekli: `{ timing: <TIMING.content.full>, detail: <COMP_DETAIL.content.full> }`

- [ ] **Step 1: Write the failing test**

```js
// test/swissAdapter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swissBuildCars, swissAdaptSnapshot } from "../src/swissAdapter.js";

const timing = JSON.parse(readFileSync("fixtures/swiss_timing.json")).content.full;
const detail = JSON.parse(readFileSync("fixtures/swiss_comp_detail.json")).content.full;
const snap = { timing, detail };

test("swissBuildCars: tüm araçları araç no + sınıf ile listeler", () => {
  const cars = swissBuildCars(snap);
  assert.ok(cars.length >= 60);
  for (const c of cars.slice(0, 5)) {
    assert.equal(typeof c.carNumber, "string");
    assert.ok(c.classId);
    assert.equal(typeof c.overall, "number");
  }
});

test("swissAdaptSnapshot: lider doğru eşlenir", () => {
  const leader = swissBuildCars(snap).find((c) => c.overall === 1);
  const map = swissAdaptSnapshot(snap, [leader.pid]);
  const cs = map.get(leader.pid);
  assert.equal(cs.position, 1);
  assert.equal(cs.classPosition, leader.classPos);
  assert.ok(cs.lapNumber > 0);
  assert.ok(cs.bestLapMs > 0);
  assert.equal(cs.carNumber, leader.carNumber);
  assert.ok(Array.isArray(cs.drivers) && cs.drivers.length > 0);
  // aktif sürücü işaretli
  assert.ok(cs.drivers.some((d) => d.current));
});

test("swissAdaptSnapshot: pit alanları COMP_DETAIL'den", () => {
  const cars = swissBuildCars(snap);
  const map = swissAdaptSnapshot(snap, cars.map((c) => c.pid));
  // en az bir araçta pitCount > 0 olmalı (24h yarış)
  assert.ok([...map.values()].some((cs) => cs.pitCount > 0));
  assert.ok([...map.values()].every((cs) => typeof cs.inPit === "boolean"));
});

test("swissAdaptSnapshot: takip edilmeyen pid map'te yok", () => {
  const map = swissAdaptSnapshot(snap, [999999]);
  assert.equal(map.size, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/swissAdapter.test.js`
Expected: FAIL — `Cannot find module '../src/swissAdapter.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/swissAdapter.js
// Swiss Timing (Spa24/SRO) snapshot → CarState. Saf fonksiyonlar.
import { makeCarState } from "./model.js";
import { parseLapMs, parseClockMs } from "./swissParse.js";

// İç pid: Bib (araç no) sayıya parse; boş/0/NaN ise CompetitorId'den deterministik hash.
export function pidOf(comp) {
  const n = Number(comp.Bib);
  if (Number.isInteger(n) && n > 0) return n;
  let h = 0;
  const s = String(comp.Id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 900000 + (Math.abs(h) % 90000); // çakışmayan yüksek aralık
}

// pid -> { competitor, competitorId }
function indexByPid(detail) {
  const out = new Map();
  for (const comp of Object.values(detail.Competitors ?? {})) {
    out.set(pidOf(comp), { comp, id: comp.Id });
  }
  return out;
}

export function swissBuildCars(snap) {
  const { timing, detail } = snap;
  const results = timing?.Results ?? {};
  const byPid = indexByPid(detail);
  const cars = [];
  for (const [pid, { comp, id }] of byPid) {
    const r = results[id]?.MainResult;
    cars.push({
      pid,
      competitorId: id,
      carNumber: comp.Bib ?? null,
      classId: comp.ClassId ?? null,
      team: comp.TeamName ?? null,
      overall: r?.Rank ?? null,
      classPos: r?.ClassRank ?? null,
      gapToFirstMs: null, // gap hesabı adapt içinde (lider referansı gerekir)
    });
  }
  return cars.filter((c) => c.carNumber != null);
}

export function swissAdaptSnapshot(snap, trackedPids) {
  const { timing, detail } = snap;
  const results = timing?.Results ?? {};
  const untInfo = timing?.UntInfo ?? {};
  const classes = detail?.Classes ?? {};
  const byPid = indexByPid(detail);
  const tracked = new Set(trackedPids.map(Number));

  // Gap referansı: lider (Rank 1) TotalTime + sınıf liderleri
  const allResults = Object.values(results).map((x) => x.MainResult);
  const overallLeader = allResults.find((r) => r.Rank === 1);
  const leaderTotalMs = parseClockMs(overallLeader?.TotalTime);
  const leaderLaps = overallLeader?.TotalLapCount ?? null;

  // Bayrak: TrackFlag (1=yeşil) → string; ChequeredFlag öncelikli
  const flag = untInfo.ChequeredFlag ? "Chequered" : flagName(untInfo.TrackFlag);

  // Kalan süre → raceClock
  const remainingMs = parseClockMs(untInfo.RemainingTime);
  const raceClock = remainingMs != null ? { elapsedMs: null, totalMs: null, remainingMs } : null;

  const map = new Map();
  for (const pid of tracked) {
    const entry = byPid.get(pid);
    if (!entry) continue;
    const { comp, id } = entry;
    const res = results[id]?.MainResult;
    if (!res) continue;

    // Sürücüler + aktif + FIA kategori
    const curId = comp.CurrentDriverId;
    const drivers = Object.values(comp.Drivers ?? {}).map((d) => ({
      id: d.Id != null ? String(d.Id) : null,
      name: d.ShortName || `${d.FirstName ?? ""} ${d.LastName ?? ""}`.trim() || "?",
      cat: d.LicenseTypeName ?? null,
      current: curId != null && String(d.Id) === String(curId),
    }));
    const cur = drivers.find((d) => d.current) ?? null;

    // Son tur sektörleri + top hız
    const last = res.LastLap ?? {};
    const inter = last.Intermediates ?? [];
    const sectors = inter.map((s, i) => ({ num: i + 1, ms: parseLapMs(s.Time), color: stateColor(s.TimeState) }));
    const topSpeedKph = inter.reduce((m, s) => Math.max(m, s.Speed ?? 0), 0) || null;

    // Gap (yaklaşık): aynı turdaysa TotalTime farkı; değilse lider turu - benim tur
    const myTotalMs = parseClockMs(res.TotalTime);
    let gapToFirstMs = null, gapToFirstLaps = null;
    if (leaderLaps != null && res.TotalLapCount != null && res.TotalLapCount < leaderLaps) {
      gapToFirstLaps = leaderLaps - res.TotalLapCount;
    } else if (leaderTotalMs != null && myTotalMs != null) {
      gapToFirstMs = Math.max(0, myTotalMs - leaderTotalMs);
    }

    const best = res.BestTime ?? {};

    map.set(pid, makeCarState({
      participantId: pid,
      carNumber: comp.Bib ?? null,
      classId: classes[comp.ClassId]?.ShortName ?? comp.ClassId ?? null,
      position: res.Rank ?? null,
      classPosition: res.ClassRank ?? null,
      lapNumber: res.TotalLapCount ?? null,
      lastLapMs: parseLapMs(last.Time),
      bestLapMs: parseLapMs(best.Time),
      bestLapIsPurple: best.TimeState === 2,
      gapAheadMs: null, // ahead hesabı v2 (komşu Rank); v1'de lidere fark gösterilir
      gapBehindMs: null,
      gapToFirstMs,
      inPit: comp.InPitLane === true,
      pitCount: comp.PitStopCount ?? 0,
      team: comp.TeamName ?? null,
      currentDriver: cur?.name ?? null,
      currentDriverCat: cur?.cat ?? null,
      drivers,
      flag,
      topSpeedKph,
      sectors,
      lapHistory: [], // Swiss tur serisi v2 (ayrı dosya gerekebilir)
      weather: null,
      tire: null,
      raceClock,
      lastPit: null,
      stintLaps: null,
      trackPositionPct: res.SectBasedPcntPos ?? null,
      manufacturer: comp.ManufacturerName ?? null,
      carType: comp.CarTypeName ?? null,
      gapToFirstLaps,
    }));
  }
  return map;
}

function flagName(tf) {
  switch (tf) {
    case 1: return "Green";
    case 2: return "Yellow";
    case 3: return "Red";
    case 4: return "SafetyCar";
    default: return tf != null ? String(tf) : null;
  }
}
function stateColor(ts) {
  switch (ts) {
    case 1: return "Green";   // kişisel en iyi
    case 2: return "Purple";  // oturum en iyisi
    default: return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/swissAdapter.test.js`
Expected: PASS (4 tests). Bayrak/renk kodu eşlemeleri (flagName/stateColor) gerçek değerlerle teyit edilir; gerekirse `flagName` kod→isim eşlemesi fixture'a göre düzeltilir (TrackFlag=1 → Green doğrulandı).

- [ ] **Step 5: Commit**

```bash
git add src/swissAdapter.js test/swissAdapter.test.js
git commit -m "feat(swiss): TIMING+COMP_DETAIL → CarState adapter (saf fonksiyon)"
```

---

### Task 4: Swiss API client — keşif zinciri + fetch (`swissApiClient.js`)

Enjekte edilebilir `fetch` ile: açılışta seasons→season→schedule→PresentationRoundId çöz, sonra TIMING+COMP_DETAIL çek. `fetchAll()` birleşik `{ timing, detail }` döndürür (adapter'ın beklediği şekil).

**Files:**
- Create: `src/swissApiClient.js`
- Test: `test/swissApiClient.test.js`

**Interfaces:**
- Consumes: enjekte `fetchImpl` (default global `fetch`).
- Produces: `createSwissApiClient(cfg, fetchImpl?) -> { resolve(), fetchAll() }`
  - `cfg`: `{ swissBase?, tournament?: "SRO", season?: "2026", meetingId?, unitId? }` (opsiyonel override; yoksa Presentation*Id'den çözülür)
  - `fetchAll()` → `{ timing: <content.full>, detail: <content.full> }`

- [ ] **Step 1: Write the failing test**

```js
// test/swissApiClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSwissApiClient } from "../src/swissApiClient.js";

const F = {
  seasons: JSON.parse(readFileSync("fixtures/swiss_seasons.json", "utf8")),
  season: JSON.parse(readFileSync("fixtures/swiss_season.json", "utf8")),
  schedule: JSON.parse(readFileSync("fixtures/swiss_schedule.json", "utf8")),
  timing: JSON.parse(readFileSync("fixtures/swiss_timing.json", "utf8")),
  detail: JSON.parse(readFileSync("fixtures/swiss_comp_detail.json", "utf8")),
};
function fakeFetch(url) {
  const pick = url.includes("SEASONS") ? F.seasons
    : url.includes("SEASON") ? F.season
    : url.includes("SCHEDULE") ? F.schedule
    : url.includes("TIMING") ? F.timing
    : url.includes("COMP_DETAIL") ? F.detail
    : null;
  return Promise.resolve({ ok: pick != null, status: pick ? 200 : 404, json: () => Promise.resolve(pick) });
}

test("resolve: PresentationRoundId'den canlı unit'i bulur", async () => {
  const api = createSwissApiClient({}, fakeFetch);
  await api.resolve();
  const snap = await api.fetchAll();
  assert.ok(snap.timing?.Results);
  assert.ok(snap.detail?.Competitors);
});

test("fetchAll: adapter'ın beklediği şekli döndürür", async () => {
  const api = createSwissApiClient({}, fakeFetch);
  await api.resolve();
  const snap = await api.fetchAll();
  assert.ok(Object.keys(snap.timing.Results).length > 0);
  assert.ok(Object.keys(snap.detail.Competitors).length > 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/swissApiClient.test.js`
Expected: FAIL — `Cannot find module '../src/swissApiClient.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/swissApiClient.js
// Swiss Timing açık JSON cache: keşif zinciri + canlı dosya fetch.
const DEFAULT_BASE = "https://ps-cache.web.swisstiming.com/node/db/RAC_PROD/";

export function createSwissApiClient(cfg = {}, fetchImpl = fetch) {
  const base = cfg.swissBase ?? DEFAULT_BASE;
  const tour = cfg.tournament ?? "SRO";
  let season = cfg.season ?? null;
  let meetingId = cfg.meetingId ?? null; // BÜYÜK harf GUID
  let unitId = cfg.unitId ?? null;       // BÜYÜK harf GUID

  async function getFull(key) {
    const res = await fetchImpl(base + key + ".json", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`[swiss] ${key} HTTP ${res.status}`);
    const j = await res.json();
    return j?.content?.full ?? j?.content ?? j;
  }

  async function resolve() {
    if (!season) {
      const s = await getFull(`${tour}_SEASONS_JSON`);
      season = String(s.CurrentSeason);
    }
    if (!meetingId) {
      const se = await getFull(`${tour}_${season}_SEASON_JSON`);
      meetingId = String(se.PresentationMeetingId).toUpperCase();
    }
    const sch = await getFull(`${tour}_${season}_SCHEDULE_${meetingId}_JSON`);
    if (!unitId) unitId = String(sch.PresentationRoundId).toUpperCase();
    return { season, meetingId, unitId };
  }

  async function fetchAll() {
    if (!unitId) await resolve();
    const [timing, detail] = await Promise.all([
      getFull(`${tour}_${season}_TIMING_${unitId}_JSON`),
      getFull(`${tour}_${season}_COMP_DETAIL_${unitId}_JSON`),
    ]);
    return { timing, detail };
  }

  return { resolve, fetchAll, getState: () => ({ season, meetingId, unitId }) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/swissApiClient.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/swissApiClient.js test/swissApiClient.test.js
git commit -m "feat(swiss): keşif zinciri + canlı TIMING/COMP_DETAIL fetch client"
```

---

### Task 5: Provider bundle + pollClient genelleştirme

pollClient'ı provider'a özgü işleri delege eden bir `provider` arayüzüne çevir. Mevcut Griiip mantığını `src/providers/griiip.js`'e sar; Swiss için `src/providers/swiss.js` ekle.

**Files:**
- Create: `src/providers/griiip.js`, `src/providers/swiss.js`
- Modify: `src/pollClient.js`
- Test: `test/pollClient.test.js` (mevcut testleri provider arayüzüne uyarla), Create: `test/providers.test.js`

**Interfaces:**
- Provider arayüzü:
  - `fetchAll() -> snap`
  - `buildCars(snap) -> Array<{pid, carNumber, classId, team, overall, classPos, gapToFirstMs}>`
  - `adapt(snap, trackedPids) -> Map<number, CarState>`
  - `raceLog(snap) -> Array` (race control item'ları; Swiss: `detail.Messages ?? []`)
  - `clock(snap) -> object` (Griiip: `snap.clock`; Swiss: `{ remainingMs }`)
- `createPollClient(cfg, provider, resolveTracked)` — `apiClient` yerine `provider` alır.

- [ ] **Step 1: Write the failing test (provider bundle + pollClient)**

```js
// test/providers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSwissProvider } from "../src/providers/swiss.js";

const timing = JSON.parse(readFileSync("fixtures/swiss_timing.json")).content.full;
const detail = JSON.parse(readFileSync("fixtures/swiss_comp_detail.json")).content.full;

test("swissProvider: arayüzü sağlar", () => {
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail }));
  const snap = { timing, detail };
  assert.equal(typeof p.fetchAll, "function");
  assert.ok(p.buildCars(snap).length > 0);
  const cars = p.buildCars(snap);
  assert.ok(p.adapt(snap, [cars[0].pid]).size === 1);
  assert.ok(Array.isArray(p.raceLog(snap)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/providers.test.js`
Expected: FAIL — `Cannot find module '../src/providers/swiss.js'`

- [ ] **Step 3: Write provider modules**

```js
// src/providers/swiss.js
import { createSwissApiClient } from "../swissApiClient.js";
import { swissBuildCars, swissAdaptSnapshot } from "../swissAdapter.js";
import { parseClockMs } from "../swissParse.js";

export function createSwissProvider(cfg, fetchOverride) {
  const api = fetchOverride
    ? { fetchAll: fetchOverride, resolve: async () => {} }
    : createSwissApiClient(cfg);
  return {
    fetchAll: () => api.fetchAll(),
    buildCars: (snap) => swissBuildCars(snap),
    adapt: (snap, pids) => swissAdaptSnapshot(snap, pids),
    // Swiss Messages şekli Griiip raceLog'dan farklı (raceLogItemId/type yok) → v1'de boş.
    // Race-control Messages eşlemesi v2 kapsamında.
    raceLog: () => [],
    clock: (snap) => ({ remainingMs: parseClockMs(snap.timing?.UntInfo?.RemainingTime) }),
  };
}
```

```js
// src/providers/griiip.js
import { createApiClient } from "../apiClient.js";
import { adaptSnapshot } from "../adapter.js";

export function createGriiipProvider(cfg, apiOverride) {
  const api = apiOverride ?? createApiClient(cfg);
  return {
    fetchAll: () => api.fetchAll(),
    buildCars: (snap) => {
      const drivers = new Map();
      for (const p of snap.participants ?? []) drivers.set(Number(p.pid), p.displayName ?? p.teamName ?? null);
      const gap = new Map();
      for (const g of snap.gaps ?? []) gap.set(Number(g.pid), g.gapToFirstMillis ?? null);
      return (snap.ranks ?? []).map((r) => ({
        pid: Number(r.pid),
        carNumber: r.carNumber ?? null,
        classId: r.classId ?? null,
        team: drivers.get(Number(r.pid)) ?? null,
        overall: r.overallPosition ?? null,
        classPos: r.position ?? null,
        gapToFirstMs: gap.get(Number(r.pid)) ?? null,
      })).filter((c) => c.carNumber != null);
    },
    adapt: (snap, pids) => adaptSnapshot(snap, pids),
    raceLog: (snap) => snap.raceLog?.items ?? [],
    clock: (snap) => snap.clock ?? {},
    fetchRaceLogFull: () => api.fetchRaceLogFull(), // Griiip'e özel (driver times)
  };
}
```

- [ ] **Step 4: Refactor pollClient to use provider**

`src/pollClient.js`'i şu şekilde değiştir (buildCars'ı sil, provider'a delege et):

```js
// src/pollClient.js
import { createScheduler } from "./scheduler.js";

/**
 * @param {{pollIntervalSeconds:number, trackedParticipants:number[]}} cfg
 * @param {{fetchAll, buildCars, adapt, raceLog, clock}} provider
 * @param {(cars:object[]) => number[]} [resolveTracked]
 */
export function createPollClient(cfg, provider, resolveTracked) {
  const handlers = new Set();
  const emit = (map) => { for (const h of handlers) h(map); };
  const resolve = resolveTracked ?? (() => cfg.trackedParticipants);
  let cars = [], tracked = [], raceLog = [], clock = {};

  async function pollOnce() {
    const snap = await provider.fetchAll();
    cars = provider.buildCars(snap);
    raceLog = provider.raceLog(snap);
    clock = provider.clock(snap);
    tracked = resolve(cars);
    const map = provider.adapt(snap, tracked);
    emit(map);
    return map;
  }

  const scheduler = createScheduler(cfg.pollIntervalSeconds * 1000, () => pollOnce().catch((e) => console.error("[poll]", e)));

  return {
    onSnapshot(cb) { handlers.add(cb); },
    getCars() { return cars; },
    getTracked() { return tracked; },
    getRaceLog() { return raceLog; },
    getClock() { return clock; },
    pollOnce,
    start() { scheduler.start(); return pollOnce(); },
    stop() { scheduler.stop(); },
  };
}
```

- [ ] **Step 5: Update existing pollClient test to use a fake provider**

`test/pollClient.test.js`'i, `apiClient` yerine bir sahte `provider` (fetchAll/buildCars/adapt/raceLog/clock) verecek şekilde güncelle. Mevcut Griiip senaryosu için `createGriiipProvider(cfg, fakeApi)` kullanılabilir.

- [ ] **Step 6: Run all tests**

Run: `node --test`
Expected: PASS (yeni providers testi + güncellenmiş pollClient + diğer tüm testler). Hiç FAIL olmamalı.

- [ ] **Step 7: Commit**

```bash
git add src/pollClient.js src/providers/ test/providers.test.js test/pollClient.test.js
git commit -m "refactor: pollClient'ı provider arayüzüne genelleştir + griiip/swiss provider'ları"
```

---

### Task 6: model.js opsiyonel yeni alanlar

CarState'e Swiss'in sağladığı ekstra alanları (geriye uyumlu, default null) ekle.

**Files:**
- Modify: `src/model.js`
- Test: `test/model.test.js` (yeni alan default'ları)

**Interfaces:**
- Produces: CarState'e `trackPositionPct`, `manufacturer`, `carType`, `gapToFirstLaps` alanları (hepsi default null).

- [ ] **Step 1: Write the failing test**

```js
// test/model.test.js'e ekle
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCarState } from "../src/model.js";

test("makeCarState: yeni opsiyonel alanlar default null", () => {
  const cs = makeCarState({});
  assert.equal(cs.trackPositionPct, null);
  assert.equal(cs.manufacturer, null);
  assert.equal(cs.carType, null);
  assert.equal(cs.gapToFirstLaps, null);
});
test("makeCarState: yeni alanlar set edilebilir", () => {
  const cs = makeCarState({ trackPositionPct: 0.8, manufacturer: "Porsche", carType: "911 GT3 R", gapToFirstLaps: 2 });
  assert.equal(cs.trackPositionPct, 0.8);
  assert.equal(cs.manufacturer, "Porsche");
  assert.equal(cs.gapToFirstLaps, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/model.test.js`
Expected: FAIL — yeni alanlar `undefined` döner.

- [ ] **Step 3: Add fields to makeCarState**

`src/model.js` içinde `makeCarState` dönüş objesine ekle (mevcut alanların sonuna, `stintLaps` satırından sonra):

```js
    stintLaps: partial.stintLaps ?? null,
    trackPositionPct: partial.trackPositionPct ?? null,
    manufacturer: partial.manufacturer ?? null,
    carType: partial.carType ?? null,
    gapToFirstLaps: partial.gapToFirstLaps ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/model.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/model.js test/model.test.js
git commit -m "feat(model): CarState'e Swiss opsiyonel alanları (trackPositionPct, manufacturer, carType, gapToFirstLaps)"
```

---

### Task 7: index.js provider seçimi + config

`config.json.provider` ile doğru provider seçilir. Griiip'e özel driver-times (DriverSwap) yalnızca Griiip'te çalışır; Swiss'te atlanır (v1).

**Files:**
- Modify: `src/index.js`, `config.json`
- Create: `config.swiss.example.json`
- Test: `test/config.test.js` (provider default)

**Interfaces:**
- Consumes: `createGriiipProvider`, `createSwissProvider` (Task 5).
- `config.provider`: `"griiip"` (default) | `"swiss"`.

- [ ] **Step 1: Write the failing test**

```js
// test/config.test.js'e ekle
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { writeFileSync, rmSync } from "node:fs";

test("loadConfig: provider yoksa default griiip", () => {
  const p = "test/.tmp-config.json";
  writeFileSync(p, JSON.stringify({ apiBase: "x", sessionId: 1, trackedParticipants: [1], pollIntervalSeconds: 8 }));
  const cfg = loadConfig(p);
  assert.equal(cfg.provider ?? "griiip", "griiip");
  rmSync(p);
});
```

- [ ] **Step 2: Run test to verify it fails (or passes trivially)**

Run: `node --test test/config.test.js`
Expected: Bu test geçer (default mantığı `?? "griiip"`). config.js'in `provider` alanını korumasını doğrular. Eğer `loadConfig` provider'ı düşürüyorsa FAIL — düşürmüyor (tüm cfg döner), PASS beklenir.

- [ ] **Step 3: Wire provider selection in index.js**

`src/index.js` başındaki import'ları ve provider kurulumunu değiştir:

```js
// import { createApiClient } from "./apiClient.js";  // SİL
// import { createPollClient } ...  (kalır)
import { createGriiipProvider } from "./providers/griiip.js";
import { createSwissProvider } from "./providers/swiss.js";
```

`const api = createApiClient(cfg);` satırını şununla değiştir:

```js
const provider = cfg.provider === "swiss" ? createSwissProvider(cfg) : createGriiipProvider(cfg);
```

`createPollClient(cfg, api, ...)` → `createPollClient(cfg, provider, ...)`.

`refreshDriverTimes` içinde Griiip'e özel `api.fetchRaceLogFull()` çağrısını koru ama sadece Griiip'te çalıştır:

```js
async function refreshDriverTimes() {
  if (cfg.provider === "swiss") return; // v1: Swiss'te per-sürücü süre yok (CurrentDriverId anlık gösterilir)
  const clock = poll.getClock();
  if (!clock?.startTime) return;
  // ... mevcut Griiip mantığı, api yerine provider.fetchRaceLogFull() ...
  let items;
  try { items = await provider.fetchRaceLogFull(); } catch { return; }
  // ... kalanı aynı ...
}
```

- [ ] **Step 4: Add config files**

`config.json`'a `"provider": "griiip"` satırı ekle (mevcut WEC davranışı korunur).

`config.swiss.example.json` oluştur:

```json
{
  "provider": "swiss",
  "tournament": "SRO",
  "trackedParticipants": [],
  "pollIntervalSeconds": 8,
  "events": {
    "position_change": true, "pit": true, "lap": true, "lap_completed": true,
    "battle": true, "driver_change": true, "gap_threshold": true, "flag": true,
    "weather": false, "racelog": true
  },
  "gapThresholdSeconds": 10,
  "battleThresholdSeconds": 2,
  "stintSummaryIntervalMinutes": 60,
  "webPort": 3000,
  "dataDir": "data-spa"
}
```

> Not: `loadConfig` `apiBase`/`sessionId`'yi zorunlu kılıyor. Step 5'te bunu provider'a göre koşullu yap.

- [ ] **Step 5: Make config validation provider-aware**

`src/config.js`'te `apiBase`/`sessionId` zorunluluğunu yalnızca Griiip için uygula:

```js
export function loadConfig(path = "config.json") {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  const provider = cfg.provider ?? "griiip";
  if (provider === "griiip") {
    if (!cfg.apiBase) throw new Error("config: apiBase zorunlu (griiip)");
    if (!cfg.sessionId) throw new Error("config: sessionId zorunlu (griiip)");
  }
  if (!Array.isArray(cfg.trackedParticipants)) throw new Error("config: trackedParticipants dizi olmalı");
  if (!cfg.pollIntervalSeconds || cfg.pollIntervalSeconds < 1) throw new Error("config: pollIntervalSeconds >= 1 olmalı");
  return cfg;
}
```

> `trackedParticipants` artık boş olabilir (Swiss'te akıllı takip/pin ile doldurulur). Mevcut Griiip testini bu değişikliğe göre güncelle (boş dizi artık hata değil — Griiip config'i zaten dolu).

- [ ] **Step 6: Run all tests**

Run: `node --test`
Expected: PASS (tümü). Gerekirse `test/config.test.js`'teki "boş trackedParticipants hata verir" testini güncelle.

- [ ] **Step 7: Commit**

```bash
git add src/index.js src/config.js config.json config.swiss.example.json test/config.test.js
git commit -m "feat: config.provider ile griiip/swiss seçimi + index.js wiring"
```

---

### Task 8: Canlı smoke test (manuel doğrulama)

Gerçek Swiss feed'e karşı uçtan uca çalıştığını doğrula. (Yarış canlıysa gerçek veri; değilse son oturum/`unitId` override ile.)

**Files:**
- Create: `config.json` (geçici Swiss kopyası) veya `config.swiss.example.json`'ı `config.json`'a kopyala.

- [ ] **Step 1: Swiss config ile başlat**

Run: `cp config.swiss.example.json config.json && npm start`
Expected: `[web] http://127.0.0.1:3000` ve `[poll]` logları; hata yok. (Bittikten sonra `git checkout config.json` ile geri al.)

- [ ] **Step 2: Tarayıcıda doğrula**

`http://127.0.0.1:3000` aç → Sıralama sekmesinde GT3 araçları (Bib no, sınıf: Pro/Gold/Silver/Bronze/Pro-AM Cup), pozisyon, son/en iyi tur görünmeli. Bir araç pinle → panelde pit sayısı, aktif sürücü (FIA kategori), kalan süre görünmeli.

- [ ] **Step 3: Olay akışını doğrula**

Birkaç dakika izle → pit_in/pit_out, position_change, lap_completed olayları feed'e düşmeli (InPitLane/Rank/TotalLapCount değişimlerinden eventDetector üretir).

- [ ] **Step 4: Bulguları not et**

Status→retired, gap doğruluğu (lap-down), bayrak kodları gibi kenar durumları gözlemle; sapma varsa v2 için issue/not bırak. Config'i geri al: `git checkout config.json`.

- [ ] **Step 5: Commit (varsa düzeltmeler)**

```bash
git add -A && git commit -m "fix(swiss): canlı smoke test düzeltmeleri"
```

---

## Notlar / v2 kapsamı (bu planın DIŞINDA)

- Per-sürücü kümülatif süre (Swiss `CurrentDriverId` geçişlerinden hesap) — Griiip'teki driverStints muadili.
- `gapAheadMs`/`gapBehindMs` komşu Rank'tan hassas hesap (v1'de yalnızca lidere fark).
- Tur süresi serisi (lapHistory) — Swiss'te ayrı dosya/delta gerekebilir.
- Retired tespiti (Status kodları + Messages).
- Swiss race-control `Messages` → rc_message/retired/time_loss olay eşlemesi (v1'de raceLog boş).
- Hava verisi (bulunursa).
- Artımlı delta dosyaları (`.../<seq>.json`) ile bant genişliği optimizasyonu.
