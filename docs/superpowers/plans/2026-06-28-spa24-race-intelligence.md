# Spa24 Race Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Üç canlı-yarış zekâsı özelliği ekle: sürücü süre-kuralı takibi (SRO), gerçek stint analizi + pit tahmini, ve canlı Spa pist haritası.

**Architecture:** Saf `driverRules.js` ve durumsal `stintTracker.js` modülleri index.js'te entegre edilir; CarState çıktısı (stateOut) `stint` ve `drivers[].rule` ile zenginleştirilir; `driver_rule` olayı index.js'te status geçişinde üretilir. Pist haritası + stint/rule gösterimi frontend'de. Provider/event/store/adapter katmanı ve WEC/Griiip yolu korunur.

**Tech Stack:** Node 18+ ESM, `node --test`, express, vanilla JS frontend (SVG). Bağımlılık eklenmez.

## Global Constraints
- Yeni runtime bağımlılığı YOK. ESM, Node >=18.
- Mevcut 91 test bozulmamalı; Griiip yolu davranışı korunur.
- Saf fonksiyonlar TDD ile test edilir; durumsal modül enjekte edilebilir/test edilebilir.
- Türkçe yorum/commit.
- SRO kural varsayılanları (config.driverRules): maxTotalMin=660, minTotalMin=120, warnAtPct=0.9,
  classOverrides={"Bronze":{"Platinum":480,"Silver":360}}.
- Sürücü status: "ok" | "warn" (max'a yakın) | "over" (max aşıldı). ("under" v2.)
- classId Swiss'te ShortName ("Pro"/"Gold"/"Silver"/"Bronze"/"Pam"); cat = LicenseTypeName
  ("Platinum"/"Gold"/"Silver"/"Bronze").
- trackPositionPct 0..1 (Swiss); Griiip'te null → harita gizli.
- Frontend prensibi: panel bir kez kurulur, her tick'te yerinde güncellenir (titreme yok).

---

### Task 1: Sürücü kuralları — `driverRules.js` (saf) + config

**Files:**
- Create: `src/driverRules.js`
- Modify: `config.json`, `config.swiss.example.json`
- Test: `test/driverRules.test.js`

**Interfaces:**
- Produces: `assessDriverRules(drivers, classShortName, cfg) -> Array<{...driver, maxSec, minSec, status, pctOfMax}>`
  - `drivers`: `[{id, name, cat, seconds, current}]`
  - `cfg`: `{maxTotalMin, minTotalMin, warnAtPct, classOverrides}` (eksikse güvenli varsayılan)

- [ ] **Step 1: Write the failing test**

```js
// test/driverRules.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDriverRules } from "../src/driverRules.js";

const cfg = { maxTotalMin: 660, minTotalMin: 120, warnAtPct: 0.9, classOverrides: { Bronze: { Platinum: 480, Silver: 360 } } };

test("ok / warn / over eşikleri (genel 11s)", () => {
  const r = assessDriverRules([
    { id: "a", name: "A", cat: "Gold", seconds: 3600 },        // 1s → ok
    { id: "b", name: "B", cat: "Gold", seconds: 660 * 60 * 0.95 }, // %95 → warn
    { id: "c", name: "C", cat: "Gold", seconds: 660 * 60 + 1 },    // >11s → over
  ], "Gold", cfg);
  assert.equal(r[0].status, "ok");
  assert.equal(r[1].status, "warn");
  assert.equal(r[2].status, "over");
  assert.equal(r[0].maxSec, 660 * 60);
});

test("Bronze cup kategori override (Platinum 8s, Silver 6s)", () => {
  const r = assessDriverRules([
    { id: "p", name: "P", cat: "Platinum", seconds: 480 * 60 + 1 }, // >8s → over
    { id: "s", name: "S", cat: "Silver", seconds: 360 * 60 * 0.5 }, // %50 of 6s → ok
  ], "Bronze", cfg);
  assert.equal(r[0].maxSec, 480 * 60);
  assert.equal(r[0].status, "over");
  assert.equal(r[1].maxSec, 360 * 60);
  assert.equal(r[1].status, "ok");
});

test("eksik cfg güvenli varsayılan kullanır", () => {
  const r = assessDriverRules([{ id: "a", name: "A", cat: "Silver", seconds: 0 }], "Pro", undefined);
  assert.equal(r[0].maxSec, 660 * 60);
  assert.equal(r[0].status, "ok");
});

test("pctOfMax hesaplanır", () => {
  const r = assessDriverRules([{ id: "a", name: "A", cat: "Gold", seconds: 330 * 60 }], "Gold", cfg);
  assert.ok(Math.abs(r[0].pctOfMax - 0.5) < 1e-9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/driverRules.test.js`
Expected: FAIL — `Cannot find module '../src/driverRules.js'`

- [ ] **Step 3: Implement**

```js
// src/driverRules.js
// SRO Spa24 sürüş-süresi kurallarına göre sürücü değerlendirmesi. Saf fonksiyon.
const DEFAULTS = { maxTotalMin: 660, minTotalMin: 120, warnAtPct: 0.9, classOverrides: { Bronze: { Platinum: 480, Silver: 360 } } };

export function assessDriverRules(drivers, classShortName, cfg) {
  const c = cfg || DEFAULTS;
  const maxDefault = (c.maxTotalMin ?? DEFAULTS.maxTotalMin) * 60;
  const minSec = (c.minTotalMin ?? DEFAULTS.minTotalMin) * 60;
  const warnAt = c.warnAtPct ?? DEFAULTS.warnAtPct;
  const overrides = (c.classOverrides ?? {})[classShortName] ?? {};
  return (drivers ?? []).map((d) => {
    const maxSec = overrides[d.cat] != null ? overrides[d.cat] * 60 : maxDefault;
    const seconds = d.seconds ?? 0;
    let status = "ok";
    if (seconds > maxSec) status = "over";
    else if (seconds >= maxSec * warnAt) status = "warn";
    return { ...d, maxSec, minSec, status, pctOfMax: maxSec ? seconds / maxSec : null };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/driverRules.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Add config defaults**

`config.json`'a (üst seviye) ekle:
```json
  "driverRules": { "maxTotalMin": 660, "minTotalMin": 120, "warnAtPct": 0.9, "classOverrides": { "Bronze": { "Platinum": 480, "Silver": 360 } } },
```
`config.swiss.example.json`'a da aynısını ekle. (Griiip için WEC kuralları farklıdır; istenirse `"driverRules": { "enabled": false }` ile kapatılır — index.js bunu kontrol eder.)

- [ ] **Step 6: Run full suite + commit**

Run: `node --test`
Expected: tümü PASS.
```bash
git add src/driverRules.js test/driverRules.test.js config.json config.swiss.example.json
git commit -m "feat: SRO sürücü süre-kuralı değerlendirmesi (driverRules saf fonksiyon + config)"
```

---

### Task 2: Stint analizi — `stintTracker.js` (durumsal)

**Files:**
- Create: `src/stintTracker.js`
- Test: `test/stintTracker.test.js`

**Interfaces:**
- Produces: `createStintTracker() -> { update(pid, obs), get(pid), all(), dump(), load(data) }`
  - `obs`: `{ lap, lastLapMs, inPit, pitCount, nowMs }`
  - `get(pid) -> { stintLaps, avgPaceMs, degradationMsPerLap, avgStintLaps, predictedPitLap, lapsToPit } | null`

- [ ] **Step 1: Write the failing test**

```js
// test/stintTracker.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStintTracker } from "../src/stintTracker.js";

test("tamamlanan turları biriktirir, ortalama pace hesaplar", () => {
  const t = createStintTracker();
  t.update(1, { lap: 10, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 }); // referans
  t.update(1, { lap: 11, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  t.update(1, { lap: 12, lastLapMs: 121000, inPit: false, pitCount: 0, nowMs: 2 });
  const g = t.get(1);
  assert.equal(g.stintLaps, 2);
  assert.ok(g.avgPaceMs >= 120000 && g.avgPaceMs <= 121000);
});

test("pit stint'i sıfırlar", () => {
  const t = createStintTracker();
  t.update(1, { lap: 10, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  t.update(1, { lap: 11, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  t.update(1, { lap: 12, lastLapMs: 200000, inPit: true, pitCount: 1, nowMs: 2 }); // pit
  t.update(1, { lap: 13, lastLapMs: 121000, inPit: false, pitCount: 1, nowMs: 3 });
  const g = t.get(1);
  assert.equal(g.stintLaps, 1); // 12'de pit → stintStart 12, şu an 13
});

test("artan tur süreleri pozitif degradasyon verir", () => {
  const t = createStintTracker();
  t.update(1, { lap: 0, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  for (let i = 1; i <= 6; i++) t.update(1, { lap: i, lastLapMs: 120000 + i * 200, inPit: false, pitCount: 0, nowMs: i });
  const g = t.get(1);
  assert.ok(g.degradationMsPerLap > 0, "pace tur başına artıyor");
});

test("pit sayısından ortalama stint + pit tahmini", () => {
  const t = createStintTracker();
  t.update(1, { lap: 0, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  // 30 tur, 2 pit → avgStintLaps=15
  t.update(1, { lap: 30, lastLapMs: 120000, inPit: false, pitCount: 2, nowMs: 1 });
  const g = t.get(1);
  assert.equal(g.avgStintLaps, 15);
  assert.equal(typeof g.predictedPitLap, "number");
  assert.equal(typeof g.lapsToPit, "number");
});

test("dump/load durumu korur", () => {
  const t = createStintTracker();
  t.update(1, { lap: 5, lastLapMs: null, inPit: false, pitCount: 0, nowMs: 0 });
  t.update(1, { lap: 6, lastLapMs: 120000, inPit: false, pitCount: 0, nowMs: 1 });
  const t2 = createStintTracker();
  t2.load(t.dump());
  t2.update(1, { lap: 7, lastLapMs: 121000, inPit: false, pitCount: 0, nowMs: 2 });
  assert.equal(t2.get(1).stintLaps, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/stintTracker.test.js`
Expected: FAIL — `Cannot find module '../src/stintTracker.js'`

- [ ] **Step 3: Implement**

```js
// src/stintTracker.js
// Pollar arası tur/pit gözlemlerinden stint metrikleri biriktirir (durumsal).
export function createStintTracker() {
  const byPid = new Map(); // pid -> { stintStartLap, laps:[{lap,ms}], lastLap, lap, pitCount }

  function update(pid, obs) {
    const { lap, lastLapMs, pitCount } = obs || {};
    let st = byPid.get(pid);
    if (!st) {
      st = { stintStartLap: lap ?? 0, laps: [], lastLap: lap ?? 0, lap: lap ?? 0, pitCount: pitCount ?? 0 };
      byPid.set(pid, st);
      return;
    }
    if (pitCount != null && pitCount > st.pitCount) { st.laps = []; st.stintStartLap = lap ?? st.lap; }
    if (lap != null && lap > st.lastLap && lastLapMs != null) {
      st.laps.push({ lap, ms: lastLapMs });
      if (st.laps.length > 60) st.laps.shift();
    }
    if (lap != null) { st.lastLap = lap; st.lap = lap; }
    if (pitCount != null) st.pitCount = pitCount;
  }

  function get(pid) {
    const st = byPid.get(pid);
    if (!st) return null;
    const stintLaps = Math.max(0, (st.lap ?? 0) - st.stintStartLap);
    const times = st.laps.map((l) => l.ms).filter((m) => m > 0);
    let avgPaceMs = null;
    if (times.length) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const clean = times.filter((m) => m <= median * 1.07); // out/SC turlarını ele
      avgPaceMs = clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length) : null;
    }
    const degradationMsPerLap = st.laps.length >= 4 ? olsSlope(st.laps.map((l, i) => [i, l.ms])) : null;
    const avgStintLaps = st.pitCount > 0 ? st.lap / st.pitCount : null;
    const predictedPitLap = avgStintLaps != null ? Math.round(st.stintStartLap + avgStintLaps) : null;
    const lapsToPit = predictedPitLap != null ? predictedPitLap - st.lap : null;
    return {
      stintLaps,
      avgPaceMs,
      degradationMsPerLap,
      avgStintLaps: avgStintLaps != null ? Math.round(avgStintLaps * 10) / 10 : null,
      predictedPitLap,
      lapsToPit,
    };
  }

  function all() { const o = {}; for (const pid of byPid.keys()) o[pid] = get(pid); return o; }
  function dump() { const o = {}; for (const [pid, st] of byPid) o[pid] = st; return o; }
  function load(data) { if (!data || typeof data !== "object") return; for (const [pid, st] of Object.entries(data)) byPid.set(Number(pid), st); }

  return { update, get, all, dump, load };
}

// Basit en-küçük-kareler eğimi (ms/tur).
function olsSlope(points) {
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  return Math.round((n * sxy - sx * sy) / d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/stintTracker.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stintTracker.js test/stintTracker.test.js
git commit -m "feat: stint analizi tracker (pace/degradasyon/pit tahmini, durumsal)"
```

---

### Task 3: Backend entegrasyon — index.js + store kalıcılığı + driver_rule olayı

stintTracker'ı her poll'da besle ve kalıcılaştır; stateOut'a `stint` ve `drivers[].rule` ekle;
aktif sürücü warn/over'a geçince `driver_rule` olayı üret.

**Files:**
- Modify: `src/store.js`, `src/index.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: `createStintTracker` (Task 2), `assessDriverRules` (Task 1), `makeEvent` (model.js).
- Produces: store `saveStintState(obj)`/`loadStintState()`; stateOut çıktısında her araçta `stint` objesi
  ve `drivers[].rule = {status, maxSec, pctOfMax}`; yeni olay tipi `driver_rule`.

- [ ] **Step 1: Write the failing test (store)**

```js
// test/store.test.js'e ekle
test("stintState yazılır/okunur; yoksa boş obje", () => {
  assert.deepEqual(createStore(DIR).loadStintState(), {});
  const s1 = createStore(DIR);
  s1.saveStintState({ 1: { stintStartLap: 5, laps: [], lastLap: 7, lap: 7, pitCount: 0 } });
  const s2 = createStore(DIR);
  assert.equal(s2.loadStintState()[1].stintStartLap, 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/store.test.js`
Expected: FAIL — `s1.saveStintState is not a function`

- [ ] **Step 3: Add store methods**

`src/store.js` içinde `driverTimesPath` satırından sonra ekle:
```js
  const stintStatePath = join(dir, "stintState.json");
```
return objesine (loadDriverTimes'tan sonra) ekle:
```js
    saveStintState(obj) { writeFileSync(stintStatePath, JSON.stringify(obj)); },
    loadStintState() {
      if (!existsSync(stintStatePath)) return {};
      try { return JSON.parse(readFileSync(stintStatePath, "utf8")); } catch { return {}; }
    },
```

- [ ] **Step 4: Run store test**

Run: `node --test test/store.test.js`
Expected: PASS

- [ ] **Step 5: Wire into index.js**

Importlara ekle (mevcut import bloğunda):
```js
import { createStintTracker } from "./stintTracker.js";
import { assessDriverRules } from "./driverRules.js";
```
`makeEvent` zaten model.js'ten import ediliyor mu kontrol et; değilse `import { makeCarState, makeEvent } from "./model.js";` olacak şekilde ekle.

Provider/swissDriverTimes kurulumunun yakınına ekle:
```js
const stintTracker = createStintTracker();
stintTracker.load(store.loadStintState());
const driverRuleStatus = new Map(); // pid -> son aktif sürücü status (geçiş tespiti)
```

`stateOut()` fonksiyonunu güncelle (mevcut gövdenin yerine):
```js
function stateOut() {
  const out = {};
  const rulesOn = cfg.driverRules?.enabled !== false;
  for (const [pid, c] of stateMap) {
    const dt = driverTimes[pid] || {};
    let drivers = (c.drivers || []).map((d) => ({ ...d, seconds: d.id != null ? (dt[d.id] ?? null) : null }));
    if (rulesOn) {
      const assessed = assessDriverRules(drivers, c.classId, cfg.driverRules);
      drivers = drivers.map((d, i) => ({ ...d, rule: { status: assessed[i].status, maxSec: assessed[i].maxSec, pctOfMax: assessed[i].pctOfMax } }));
    }
    out[pid] = { ...c, drivers, stint: stintTracker.get(pid), pinned: tracking.isPinned(pid) };
  }
  return out;
}
```

Snapshot handler'ında (`poll.onSnapshot(...)` içinde), efektif döngüden SONRA (stateMap güncel),
mevcut swissDriverTimes bloğunun yakınına ekle:
```js
  // Stint tracker besle + kalıcılaştır (her iki provider)
  const nowTs = Date.now();
  for (const pid of effective) {
    const c = stateMap.get(pid);
    if (!c) continue;
    stintTracker.update(pid, { lap: c.lapNumber, lastLapMs: c.lastLapMs, inPit: c.inPit, pitCount: c.pitCount, nowMs: nowTs });
  }
  store.saveStintState(stintTracker.dump());

  // Sürücü kural olayı: aktif sürücü warn/over'a geçince bir kez
  if (cfg.driverRules?.enabled !== false) {
    for (const pid of effective) {
      const c = stateMap.get(pid);
      if (!c) continue;
      const dt = driverTimes[pid] || {};
      const withSec = (c.drivers || []).map((d) => ({ ...d, seconds: d.id != null ? (dt[d.id] ?? null) : null }));
      const active = assessDriverRules(withSec, c.classId, cfg.driverRules).find((d) => d.current);
      if (!active) continue;
      const prev = driverRuleStatus.get(pid) || "ok";
      if (active.status !== prev && (active.status === "warn" || active.status === "over")) {
        const ev = makeEvent("driver_rule", pid, { driver: active.name, status: active.status, seconds: Math.round(active.seconds ?? 0), maxSec: active.maxSec }, nowTs);
        store.appendEvent(ev); web.broadcast(ev);
      }
      driverRuleStatus.set(pid, active.status);
    }
  }
```

> Not: `effective` değişkeni handler içinde zaten mevcut (`const effective = poll.getTracked();`).
> SIGINT handler'ına dokunma. Griiip yolunda da stint çalışır (lap/pit verisi var).

- [ ] **Step 6: Syntax + full suite**

Run: `node --check src/index.js && node --test`
Expected: `index.js syntax OK` ve tüm testler PASS (91 + yeni store/driverRules/stintTracker testleri).

- [ ] **Step 7: Commit**

```bash
git add src/store.js src/index.js test/store.test.js
git commit -m "feat: stint+driver-rule'u index.js'e entegre et (stateOut zenginleştirme, driver_rule olayı, kalıcılık)"
```

---

### Task 4: Frontend — canlı Spa pist haritası

Yeni bir panel: stilize Spa SVG silueti üzerinde takip edilen araçları `trackPositionPct` ile konumla.

**Files:**
- Modify: `public/index.html`, `public/app.js`

**Interfaces:**
- Consumes: `state[pid].trackPositionPct` (0..1), `state[pid].carNumber`, `state[pid].classId`, `state[pid].pinned`.

- [ ] **Step 1: app.js yapısını incele**

Önce `public/app.js` ve `public/index.html`'i oku: panellerin nasıl kurulduğunu, state'in nasıl
geldiğini (SSE `tick` → `state`), sınıf renklerinin nerede tanımlı olduğunu (varsa) öğren. Mevcut
"panel bir kez kur, yerinde güncelle" desenine uy.

- [ ] **Step 2: HTML — harita konteyneri ekle**

`public/index.html`'e uygun bir yere (ör. genel feed yakınına) ekle:
```html
<section id="trackmap-panel" style="display:none">
  <h3 style="margin:4px 0">Pist Haritası</h3>
  <svg id="trackmap" viewBox="0 0 1000 600" style="width:100%;max-height:320px">
    <path id="trackpath" d="M120,470 C90,360 140,250 250,210 L430,150 C520,120 560,90 540,60 C700,90 840,170 800,280 L640,360 C560,400 600,470 690,480 L800,510 C540,560 300,560 200,520 C150,500 130,500 120,470 Z"
          fill="none" stroke="#444" stroke-width="10" stroke-linejoin="round"/>
    <g id="trackmap-cars"></g>
  </svg>
</section>
```

- [ ] **Step 3: app.js — harita render fonksiyonu**

`public/app.js`'e bir render fonksiyonu ekle ve her `tick`/state güncellemesinde çağır. Mevcut sınıf
renk fonksiyonu varsa onu kullan; yoksa aşağıdaki `classColor`'ı ekle:

```js
// Pist haritası: takip edilen araçları trackPositionPct'e göre path üzerinde konumla.
const CLASS_COLORS = { Pro: "#e10600", Gold: "#d4af37", Silver: "#9aa0a6", Bronze: "#cd7f32", Pam: "#1e88e5" };
function classColor(classId) { return CLASS_COLORS[classId] || "#26c281"; }

function renderTrackMap(state) {
  const panel = document.getElementById("trackmap-panel");
  const path = document.getElementById("trackpath");
  const g = document.getElementById("trackmap-cars");
  if (!panel || !path || !g) return;
  const cars = Object.values(state).filter((c) => c.trackPositionPct != null);
  if (!cars.length) { panel.style.display = "none"; return; }
  panel.style.display = "";
  const total = path.getTotalLength();
  // mevcut işaretçileri pid bazında güncelle (titreme yok)
  const seen = new Set();
  for (const c of cars) {
    const pid = c.participantId;
    seen.add(String(pid));
    const pt = path.getPointAtLength(Math.max(0, Math.min(1, c.trackPositionPct)) * total);
    let grp = g.querySelector(`[data-pid="${pid}"]`);
    if (!grp) {
      grp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      grp.setAttribute("data-pid", String(pid));
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "11");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dy", "4");
      label.setAttribute("font-size", "11");
      label.setAttribute("fill", "#fff");
      grp.appendChild(dot); grp.appendChild(label);
      g.appendChild(grp);
    }
    grp.querySelector("circle").setAttribute("cx", pt.x);
    grp.querySelector("circle").setAttribute("cy", pt.y);
    grp.querySelector("circle").setAttribute("fill", classColor(c.classId));
    grp.querySelector("circle").setAttribute("stroke", c.pinned ? "#fff" : "none");
    grp.querySelector("circle").setAttribute("stroke-width", c.pinned ? "2" : "0");
    const label = grp.querySelector("text");
    label.setAttribute("x", pt.x); label.setAttribute("y", pt.y);
    label.textContent = c.carNumber ?? "";
  }
  // artık listede olmayanları kaldır
  for (const grp of [...g.children]) if (!seen.has(grp.getAttribute("data-pid"))) grp.remove();
}
```
`state[pid]` objelerinde `participantId` olduğundan emin ol; yoksa state'in anahtarını (pid) kullan
(`Object.entries(state)` ile pid'i ver). State'in geldiği yeri (tick handler / render döngüsü) bul ve
oraya `renderTrackMap(state)` çağrısı ekle.

- [ ] **Step 4: Manuel smoke (yarış canlıysa)**

`cp config.swiss.example.json config.json && npm start` → `127.0.0.1:3000` → bir-iki araç takibe al →
Pist Haritası panelinde araç noktaları path üzerinde hareket etmeli (sınıf renkli, pinli beyaz çerçeve).
Sonra `git checkout config.json`. Griiip config'inde panel gizli kalmalı (trackPositionPct null).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat(ui): canlı Spa pist haritası (trackPositionPct ile SVG konumlama)"
```

---

### Task 5: Frontend — stint metrikleri + sürücü kural rozetleri

Araç panelinde stint analizini ve kadroda sürücü kural durumunu göster. `driver_rule` olayına etiket ver.

**Files:**
- Modify: `public/app.js` (ve gerekirse `public/index.html`)

**Interfaces:**
- Consumes: `state[pid].stint = {stintLaps, avgPaceMs, degradationMsPerLap, predictedPitLap, lapsToPit, avgStintLaps}`;
  `state[pid].drivers[].rule = {status, maxSec, pctOfMax}`; `driver_rule` event `{driver, status, seconds, maxSec}`.

- [ ] **Step 1: app.js'te araç paneli render'ını bul**

`public/app.js`'te bir aracın kart/panelinin çizildiği yeri ve sürücü kadrosunun listelendiği yeri oku.
Mevcut "yerinde güncelle" desenine uy.

- [ ] **Step 2: Stint bilgisini panele ekle**

Araç panelinde uygun bir satıra stint özeti ekle (mevcut tur/pit satırının yanına). Yardımcı:
```js
function fmtMs(ms) { if (ms == null) return "—"; const s = ms / 1000; const m = Math.floor(s / 60); return m > 0 ? `${m}:${(s % 60).toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}`; }
function stintText(st) {
  if (!st) return "";
  const deg = st.degradationMsPerLap != null ? `${st.degradationMsPerLap > 0 ? "+" : ""}${(st.degradationMsPerLap / 1000).toFixed(2)}s/tur` : "—";
  const pit = st.lapsToPit != null ? `~${st.lapsToPit} turda pit` : "—";
  return `Stint ${st.stintLaps} tur · ort ${fmtMs(st.avgPaceMs)} · deg ${deg} · ${pit}`;
}
```
Panelin stint satırına `stintText(c.stint)` yaz (mevcut güncelleme döngüsünde, textContent ile).

- [ ] **Step 3: Sürücü kural rozetini kadroda göster**

Sürücü kadrosu satırında, sürücünün `rule.status`'una göre renkli rozet ekle:
```js
function ruleBadge(rule) {
  if (!rule || rule.status === "ok") return "";
  const color = rule.status === "over" ? "#e10600" : "#f5a623"; // over=kırmızı, warn=turuncu
  const pct = rule.pctOfMax != null ? Math.round(rule.pctOfMax * 100) : "";
  return `<span style="background:${color};color:#fff;border-radius:3px;padding:0 4px;font-size:10px;margin-left:4px">${pct}%${rule.status === "over" ? " ⚠" : ""}</span>`;
}
```
Kadro satırında sürücü adının yanına `ruleBadge(d.rule)` ekle (innerHTML ile; mevcut kadro render
desenine uyarak). Sürücü süresi (`d.seconds`) zaten gösteriliyorsa onun yanına koy.

- [ ] **Step 4: `driver_rule` olayına etiket**

Olay feed'inde tip→metin eşlemesi varsa `driver_rule` ekle (ör. `driver_rule: "Sürücü kuralı"`),
mesaj: `${payload.driver} ${payload.status === "over" ? "max süreyi aştı" : "max süreye yaklaştı"} (${Math.round(payload.seconds/60)}dk)`. Eşleme yoksa olay zaten ham gösteriliyordur — yine de okunur bir
satır üret.

- [ ] **Step 5: Manuel smoke**

`npm start` (swiss config) → bir araç pinle → panelde stint satırı (tur/ort/deg/pit tahmini) görünmeli;
kadroda uzun süren sürücüde renkli yüzde rozeti belirmeli (warn ~%90, over kırmızı). `git checkout config.json`.

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/index.html
git commit -m "feat(ui): stint metrikleri paneli + sürücü kural rozetleri + driver_rule olay etiketi"
```

---

## Self-review notları
- Spec kapsamı: F1 sürücü kuralları (Task 1 + 3 + 5), F2 stint analizi (Task 2 + 3 + 5), F3 pist haritası (Task 4). Tümü karşılandı.
- Griiip yolu: stint çalışır; driver rules cfg ile kapatılabilir; harita Swiss-only (trackPositionPct null → gizli).
- Tip tutarlılığı: `stint` alanları ve `rule` alanları stateOut ↔ frontend ↔ test boyunca aynı.
- v2: sınıf-kategori ince min kuralları, sürekli-sürüş limiti, gerçek-ölçek Spa geometrisi, SC/FCY pace filtresi.
