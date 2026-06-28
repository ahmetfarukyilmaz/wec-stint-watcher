# Spa24 Swiss v2 Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Swiss provider'ı dört iyileştirmeyle tamamla: sınıf-komşusu gap (ahead/behind), trackPositionPct normalizasyonu, race-control Messages → olay, ve per-sürücü kümülatif süre.

**Architecture:** İyileştirmeler mevcut provider soyutlamasına eklenir. swissAdapter'a gap + pct normalizasyonu; swissProvider.raceLog Messages'ı Griiip-RCMessage şekline map'ler (eventDetector.raceLogEvents değişmez); yeni durumsal `swissDriverTimes.js` index.js'te entegre edilir. Griiip yolu hiç etkilenmez.

**Tech Stack:** Node 18+ ESM, `node --test`, express. Bağımlılık eklenmez.

## Global Constraints
- Yeni runtime bağımlılığı YOK. ESM, Node >=18.
- Mevcut 80 test bozulmamalı; Griiip yolu hiç değişmez.
- Saf fonksiyonlar test edilir; durum (driver times) enjekte edilebilir/test edilebilir olmalı.
- Türkçe yorum/commit.
- Fixtures: `fixtures/swiss_timing.json`, `swiss_comp_detail.json` (gap/pct testi); `fixtures/swiss_comp_detail_msgs.json` (3 gerçek Message içerir — raceLog testi).
- Swiss schema: TIMING.Results[id].MainResult = {Rank, ClassRank, TotalTime (h:mm:ss.mmm string), TotalLapCount, SectBasedPcntPos, ...}; COMP_DETAIL = {Competitors[id]{Bib, ClassId, CurrentDriverId, Drivers{...}}, IntermediateDefinitionsCount (=3), Messages[]{Time, Text, Type}}.
- Sektör sayısı: `detail.IntermediateDefinitionsCount` (fallback `timing.UntInfo.SectorFlags.length`, son fallback 3).

---

### Task 1: Sınıf-komşusu gap (ahead/behind) + trackPositionPct normalizasyonu

swissAdapter'a iki iyileştirme. Aynı dosya, birlikte test edilir.

**Files:**
- Modify: `src/swissAdapter.js`
- Test: `test/swissAdapter.test.js`

**Interfaces:**
- Değişen: `swissAdaptSnapshot` artık `gapAheadMs`, `gapBehindMs`, `aheadCarNumber`, `behindCarNumber` doldurur (sınıf içi ClassRank komşusu) ve `trackPositionPct`'i 0..1'e normalize eder.

- [ ] **Step 1: Write the failing test**

```js
// test/swissAdapter.test.js'e ekle
test("swissAdaptSnapshot: sınıf komşusu gap (ahead/behind) hesaplar", () => {
  const cars = swissBuildCars(snap).filter((c) => c.overall != null).sort((a,b)=>a.overall-b.overall);
  // sınıfında 2. olan bir araç bul (hem ahead hem behind olası)
  const map = swissAdaptSnapshot(snap, cars.map((c) => c.pid));
  const mid = [...map.values()].find((c) => c.classPosition === 2);
  assert.ok(mid, "sınıfında 2. araç olmalı");
  assert.ok(mid.gapAheadMs != null && mid.gapAheadMs >= 0, "ahead gap dolu ve >=0");
  assert.ok(mid.aheadCarNumber != null, "ahead araç no dolu");
});

test("swissAdaptSnapshot: trackPositionPct 0..1 normalize", () => {
  const cars = swissBuildCars(snap).filter((c) => c.overall != null);
  const map = swissAdaptSnapshot(snap, cars.map((c) => c.pid));
  for (const c of map.values()) {
    if (c.trackPositionPct != null) assert.ok(c.trackPositionPct >= 0 && c.trackPositionPct <= 1, `pct 0..1: ${c.trackPositionPct}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/swissAdapter.test.js`
Expected: FAIL — gapAheadMs null / trackPositionPct > 1 (şu an / değil ham SectBasedPcntPos).

- [ ] **Step 3: Implement in swissAdapter.js**

`swissAdaptSnapshot` içinde, ana döngüden ÖNCE sınıf-bazlı sıralı liste kur:

```js
  // Sınıf içi ClassRank'e göre sıralı competitorId listesi (komşu gap için)
  const sectorCount = detail?.IntermediateDefinitionsCount || (untInfo.SectorFlags?.length) || 3;
  const byClass = new Map(); // classId -> [{id, classRank, totalMs, laps, bib}]
  for (const comp of Object.values(detail.Competitors ?? {})) {
    const r = results[comp.Id]?.MainResult;
    if (!r || r.ClassRank == null) continue;
    if (!byClass.has(comp.ClassId)) byClass.set(comp.ClassId, []);
    byClass.get(comp.ClassId).push({ id: comp.Id, classRank: r.ClassRank, totalMs: parseClockMs(r.TotalTime), laps: r.TotalLapCount, bib: comp.Bib });
  }
  for (const list of byClass.values()) list.sort((a, b) => a.classRank - b.classRank);
```

Ana döngüde (her tracked car için), mevcut `gapToFirstMs` hesabından sonra komşu gap ekle:

```js
    // Sınıf komşusu gap (ahead/behind)
    let gapAheadMs = null, gapBehindMs = null, aheadCarNumber = null, behindCarNumber = null;
    const clist = byClass.get(comp.ClassId);
    if (clist) {
      const idx = clist.findIndex((x) => x.id === id);
      const me = clist[idx];
      const neighborGap = (other) => {
        if (!other) return null;
        if (me.laps != null && other.laps != null && me.laps !== other.laps) return null; // farklı tur → ms gap yok
        if (me.totalMs == null || other.totalMs == null) return null;
        return Math.abs(me.totalMs - other.totalMs);
      };
      if (idx > 0) { aheadCarNumber = clist[idx - 1].bib ?? null; gapAheadMs = neighborGap(clist[idx - 1]); }
      if (idx >= 0 && idx < clist.length - 1) { behindCarNumber = clist[idx + 1].bib ?? null; gapBehindMs = neighborGap(clist[idx + 1]); }
    }
```

`makeCarState(...)` çağrısında ilgili alanları güncelle:
- `gapAheadMs: gapAheadMs,`
- `gapBehindMs: gapBehindMs,`
- `aheadCarNumber,`
- `behindCarNumber,`
- `trackPositionPct: res.SectBasedPcntPos != null ? Math.min(1, Math.max(0, res.SectBasedPcntPos / sectorCount)) : null,`

> `aheadCarNumber`/`behindCarNumber` zaten CarState'te var (model.js'te tanımlı). gapAheadMs/gapBehindMs de var.

- [ ] **Step 4: Run tests**

Run: `node --test test/swissAdapter.test.js` then `node --test`
Expected: PASS (yeni 2 test + tümü). Battle olayları artık Swiss'te de tetiklenebilir (gapAhead/Behind dolu).

- [ ] **Step 5: Commit**

```bash
git add src/swissAdapter.js test/swissAdapter.test.js
git commit -m "feat(swiss): sınıf komşusu gap (ahead/behind) + trackPositionPct 0..1 normalize"
```

---

### Task 2: Race-control Messages → rc_message olayları

swissProvider.raceLog artık COMP_DETAIL.Messages'ı, eventDetector.raceLogEvents'in beklediği Griiip-benzeri şekle map'ler. Böylece index.js'teki mevcut raceLog/dedup mantığı değişmeden Swiss'te de çalışır.

**Files:**
- Modify: `src/providers/swiss.js`
- Test: `test/providers.test.js`

**Interfaces:**
- Değişen: `createSwissProvider(...).raceLog(snap)` artık `[{ raceLogItemId, type:"RCMessage", text, lapNumber:null }]` döndürür (önceden `[]`).
- `raceLogItemId` = `Time|Text`'ten deterministik string (stabil id yok; Time+Text yeterince benzersiz).

- [ ] **Step 1: Write the failing test**

```js
// test/providers.test.js'e ekle
import { readFileSync as _rf } from "node:fs";
test("swissProvider.raceLog: Messages'ı RCMessage olaylarına map'ler", () => {
  const detailMsgs = JSON.parse(_rf("fixtures/swiss_comp_detail_msgs.json")).content.full;
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail: detailMsgs }));
  const items = p.raceLog({ timing, detail: detailMsgs });
  assert.ok(items.length >= 1, "en az bir mesaj");
  for (const it of items) {
    assert.equal(it.type, "RCMessage");
    assert.equal(typeof it.raceLogItemId, "string");
    assert.equal(typeof it.text, "string");
  }
  // dedup için id benzersiz olmalı
  const ids = new Set(items.map((x) => x.raceLogItemId));
  assert.equal(ids.size, items.length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/providers.test.js`
Expected: FAIL — raceLog şu an `[]` döndürüyor (items.length 0).

- [ ] **Step 3: Implement in src/providers/swiss.js**

`raceLog` fonksiyonunu değiştir (mevcut `raceLog: () => []` yerine):

```js
    raceLog: (snap) => {
      const msgs = snap.detail?.Messages ?? [];
      return msgs.map((m) => ({
        raceLogItemId: `${m.Time}|${m.Text}`,
        type: "RCMessage",
        text: m.Text ?? "",
        lapNumber: null,
      }));
    },
```

Yorum güncelle (artık Messages map'leniyor; retired/time_loss v3'e kalır — Messages metin tabanlı).

- [ ] **Step 4: Run tests**

Run: `node --test test/providers.test.js` then `node --test`
Expected: PASS. (eventDetector.raceLogEvents RCMessage → rc_message olayı üretir; index.js seenRaceLog dedup zaten raceLogItemId kullanır.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/swiss.js test/providers.test.js
git commit -m "feat(swiss): race-control Messages → rc_message olayları (RCMessage map)"
```

---

### Task 3: Per-sürücü kümülatif süre — durumsal accumulator

Swiss'te DriverSwap log'u yok; aktif sürücü her poll'da `CurrentDriverId`'den okunur. Pollar arası süre biriktiren durumsal bir tracker.

**Files:**
- Create: `src/swissDriverTimes.js`
- Test: `test/swissDriverTimes.test.js`

**Interfaces:**
- Produces: `createSwissDriverTimes() -> { update(pid, driverId, nowMs), get(pid) -> Record<driverId, seconds>, all() -> Record<pid, Record<driverId, seconds>> }`
- `update`: aynı pid+driverId için son `update`'ten beri geçen süreyi (nowMs farkı) o sürücüye ekler; sürücü değişince yeni sürücüden başlar. İlk gözlemde süre eklenmez (referans noktası).

- [ ] **Step 1: Write the failing test**

```js
// test/swissDriverTimes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSwissDriverTimes } from "../src/swissDriverTimes.js";

test("ilk gözlem süre eklemez, sonraki gözlemler biriktirir", () => {
  const t = createSwissDriverTimes();
  t.update(91, "A", 1000);          // referans
  t.update(91, "A", 4000);          // +3s A
  assert.equal(Math.round(t.get(91)["A"]), 3);
});

test("sürücü değişince yeni sürücüye geçer", () => {
  const t = createSwissDriverTimes();
  t.update(91, "A", 0);
  t.update(91, "A", 10000);         // +10s A
  t.update(91, "B", 12000);         // değişim anı: 0..2s'lik dilim A'ya mı B'ye mi? referans=12000, B başlar
  t.update(91, "B", 15000);         // +3s B
  assert.equal(Math.round(t.get(91)["A"]), 10);
  assert.equal(Math.round(t.get(91)["B"]), 3);
});

test("birden çok araç bağımsız izlenir; all() hepsini verir", () => {
  const t = createSwissDriverTimes();
  t.update(1, "X", 0); t.update(1, "X", 5000);
  t.update(2, "Y", 0); t.update(2, "Y", 2000);
  const all = t.all();
  assert.equal(Math.round(all[1]["X"]), 5);
  assert.equal(Math.round(all[2]["Y"]), 2);
});

test("null driverId güvenli (atla)", () => {
  const t = createSwissDriverTimes();
  t.update(1, null, 0);
  t.update(1, null, 5000);
  assert.deepEqual(t.get(1), {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/swissDriverTimes.test.js`
Expected: FAIL — `Cannot find module '../src/swissDriverTimes.js'`

- [ ] **Step 3: Implement**

```js
// src/swissDriverTimes.js
// Pollar arası aktif sürücü gözlemlerinden per-sürücü kümülatif süre (saniye) biriktirir.
// Swiss'te DriverSwap log'u olmadığından her poll'daki CurrentDriverId'den hesaplanır.
export function createSwissDriverTimes() {
  const byPid = new Map(); // pid -> { totals: Map<driverId, sec>, curId, lastMs }

  function update(pid, driverId, nowMs) {
    if (driverId == null) return; // bilinmeyen sürücü: referans alma
    let st = byPid.get(pid);
    if (!st) { st = { totals: new Map(), curId: driverId, lastMs: nowMs }; byPid.set(pid, st); return; }
    if (driverId === st.curId) {
      const dt = (nowMs - st.lastMs) / 1000;
      if (dt > 0) st.totals.set(driverId, (st.totals.get(driverId) ?? 0) + dt);
    }
    // sürücü değişse de değişmese de referansı ilerlet; değişimde yeni sürücüden başla
    st.curId = driverId;
    st.lastMs = nowMs;
  }

  function get(pid) {
    const st = byPid.get(pid);
    if (!st) return {};
    return Object.fromEntries(st.totals);
  }

  function all() {
    const out = {};
    for (const pid of byPid.keys()) out[pid] = get(pid);
    return out;
  }

  return { update, get, all };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/swissDriverTimes.test.js` then `node --test`
Expected: PASS (4 yeni test + tümü).

- [ ] **Step 5: Commit**

```bash
git add src/swissDriverTimes.js test/swissDriverTimes.test.js
git commit -m "feat(swiss): per-sürücü kümülatif süre accumulator (poll-bazlı)"
```

---

### Task 4: swissDriverTimes'ı index.js'e entegre et

Swiss provider'da, her snapshot'ta tracker'ı güncelle ve `driverTimes`'ı doldur ki `stateOut` sürücü başına saniyeyi göstersin (Griiip'teki gibi). Griiip yolu değişmez.

**Files:**
- Modify: `src/index.js`

**Interfaces:**
- Consumes: `createSwissDriverTimes` (Task 3); CarState.drivers[].{id, current} (swissAdapter sağlar).

- [ ] **Step 1: index.js'i incele ve entegre et**

`src/index.js` başına import ekle:
```js
import { createSwissDriverTimes } from "./swissDriverTimes.js";
```

Provider seçiminden sonra, swiss ise tracker oluştur:
```js
const swissDriverTimes = cfg.provider === "swiss" ? createSwissDriverTimes() : null;
```

`poll.onSnapshot((snapshot) => { ... })` handler'ının BAŞINDA (effective döngüsünden önce veya içinde), swiss ise her tracked car için tracker'ı güncelle ve driverTimes'ı yenile. En temizi: effective döngüsünde `next` state'i işlenirken aktif sürücü id'sini al. Döngü sonrası driverTimes'ı doldur:

```js
  if (swissDriverTimes) {
    const now = Date.now();
    for (const pid of effective) {
      const st = stateMap.get(pid);
      const curDrv = st?.drivers?.find((d) => d.current);
      if (curDrv?.id) swissDriverTimes.update(pid, curDrv.id, now);
    }
    Object.assign(driverTimes, swissDriverTimes.all());
  }
```

> `driverTimes` zaten index.js'te global obje; `stateOut` onu kullanıp `drivers[].seconds`'ı dolduruyor. `refreshDriverTimes` swiss'te zaten erken dönüyor (Task 7/v1), çakışma yok.

- [ ] **Step 2: Syntax + suite kontrolü**

Run: `node --check src/index.js && node --test`
Expected: tümü PASS (index.js test kapsamında değil; syntax + mevcut testler).

- [ ] **Step 3: Canlı smoke (opsiyonel, yarış canlıysa)**

`cp config.swiss.example.json config.json && npm start` → birkaç dk sonra bir aracı pinle → kadroda sürücü başına süre artmalı; gap ahead/behind ve rc_message olayları görünmeli. Sonra `git checkout config.json`.

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat(swiss): per-sürücü süreyi index.js'e entegre et (poll-bazlı tracker)"
```

---

## Self-review notları
- Griiip yolu hiçbir task'ta değişmez (yalnızca swiss* dosyaları ve index.js'in swiss-guard'lı bölümleri).
- Tüm yeni mantık saf/test edilebilir (driver times durumu enjekte edilebilir tracker'da izole).
- v3 kapsamı: Messages'tan retired/time_loss çıkarımı (metin parse); gap'in tam interval (yalnızca komşu değil) hassasiyeti.
