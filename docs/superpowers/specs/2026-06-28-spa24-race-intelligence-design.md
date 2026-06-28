# Spa24 Race Intelligence — Tasarım

Tarih: 2026-06-28
Durum: Onaylandı (kullanıcı), implementasyon planı bekliyor

## Amaç

`wec-stint-watcher`'a üç canlı-yarış zekâsı özelliği eklemek:
1. **Sürücü süre-kuralı takibi** (SRO Spa24 reglemanına göre)
2. **Gerçek stint analizi + pit penceresi tahmini**
3. **Canlı pist haritası** (Spa silueti, araç konumları)

Mevcut provider soyutlaması, event/store/web katmanı ve WEC/Griiip yolu korunur.

## SRO 2026 Spa24 sürüş-süresi kuralları (araştırıldı)

Kaynaklar: gt-world-challenge-europe.com, pitdebrief.com. Genel:
- **Sürücü başına max toplam: 11 saat (660 dk)**; min toplam: **2 saat (120 dk)**.
- Bronze Cup: Platinum max **8s (480dk)**, Silver max **6s (360dk)**.
- Max sürekli sürüş ~3s09 öncesi zorunlu mola (v1 dışı — pit zaten ~1s'de bir).
- Sınıf/kategoriye özel min'ler (Gold'da Silver ≥4s, Pro-Am'de Bronze toplam ≥8s) — v1'de
  yalnızca genel max/min + kategori-max override'ları; ince sınıf-min kuralları v2.

Bu değerler config varsayılanı olur; `config.driverRules` ile ezilebilir.

---

## Feature 1: Sürücü süre-kuralı takibi

**Modül:** `src/driverRules.js` — saf fonksiyon.

**Arayüz:**
```
assessDriverRules(driversWithSeconds, classShortName, rulesCfg) -> Array<{
  id, name, cat, seconds, maxSec, minSec,
  status: "ok" | "warn" | "over" | "under",   // over=max aşıldı, under=min altında (yarış sonu riski), warn=max'a yakın
  pctOfMax,                                    // seconds/maxSec
}>
```
- `maxSec`: kategori override (rulesCfg.classOverrides[class]?.[cat] ?? rulesCfg.maxTotalMin) * 60.
- `minSec`: rulesCfg.minTotalMin * 60.
- `status`: seconds>maxSec → over; seconds≥maxSec*warnAtPct → warn; aksi ok. (under: yalnızca
  yarış kalan süresi azken min altındaysa — v1'de basit: seconds<minSec ise "under" bilgi amaçlı.)

**Config (`config.driverRules`, varsayılan):**
```json
{
  "maxTotalMin": 660, "minTotalMin": 120, "warnAtPct": 0.9,
  "classOverrides": { "Bronze": { "Platinum": 480, "Silver": 360 } }
}
```
`class` = CarState.classId (Swiss'te ShortName: "Pro"/"Gold"/"Silver"/"Bronze"/"Pam"). cat = sürücü
LicenseTypeName (Platinum/Gold/Silver/Bronze).

**Entegrasyon:** `index.js` `stateOut()` içinde her aracın `drivers[]`'ine `rule` alanı eklenir
(`assessDriverRules` ile). Ayrıca aktif sürücü "over"/"warn"'a geçince **bir kez** `driver_rule`
olayı üretilir (eventDetector'a yeni tip; prev/next status karşılaştırmasıyla, mevcut diff deseni).

**Test:** saf fonksiyon birim testleri (ok/warn/over/under, kategori override, sınıf eşleşmesi).

---

## Feature 2: Gerçek stint analizi + pit tahmini

**Modül:** `src/stintTracker.js` — durumsal (swissDriverTimes deseni; kalıcılaştırılabilir).

**Arayüz:**
```
createStintTracker() -> {
  update(pid, { lap, lastLapMs, inPit, pitCount, nowMs }),   // her poll çağrılır
  get(pid) -> {
    stintLaps,            // mevcut stint tur sayısı
    avgPaceMs,            // bu stint geçerli turların ortalaması (out/in/SC turları ~ filtrelenir)
    degradationMsPerLap,  // bu stint lineer trend eğimi (pace artışı/tur)
    avgStintLaps,         // toplamTur/pitSayısı (kendi geçmişinden tahmin)
    predictedPitLap,      // stintStartLap + avgStintLaps
    lapsToPit,            // predictedPitLap - lap
  },
  all(), dump(), load(data)
}
```
**Mantık:**
- Tur tamamlanınca (lap arttı) `lastLapMs`'i mevcut stint listesine ekle.
- Pit tespiti: `pitCount` arttı VEYA `inPit` false→ stint sıfırla, `stintStartLap = lap`.
- `avgPaceMs`: stint turlarının medyanına yakın olanların ortalaması (outlier filtre: medyan ±%107).
- `degradationMsPerLap`: stint turlarına basit en-küçük-kareler eğimi (≥4 tur varsa).
- `avgStintLaps`: `totalLaps / max(1, pitCount)` (yeterli pit yoksa null → tahmin yok).
- Restart kalıcılığı: `dump()/load()` (store'a yeni `saveStintState/loadStintState`).

**Entegrasyon:** `index.js` snapshot handler'ında her efektif araç için `update(...)`; `stateOut`
CarState'e `stint` objesi ekler. Zayıf `summary.js` periyodik özetinin yerini `stintTracker.get`
çıktısıyla zenginleştir (buildStintSummary stint metriklerini de alır).

**Test:** durumsal birim testleri (stint sıfırlama, ortalama/degradasyon, tahmin; dump/load).

---

## Feature 3: Canlı pist haritası

**Yer:** Frontend (`public/index.html` + `public/app.js`). Backend değişikliği YOK.

- Spa-Francorchamps sadeleştirilmiş **inline SVG** path (tek `<path>`, ~kapalı eğri).
- Takip edilen araçlar `state[pid].trackPositionPct` (0..1) ile path üzerinde konumlanır:
  `path.getPointAtLength(pct * path.getTotalLength())`. Her araç: sınıf rengiyle nokta + araç no.
- Yalnızca en az bir araçta `trackPositionPct != null` ise göster (Swiss). Aksi halde harita paneli
  gizli (Griiip). Pinli/efektif araçlar gösterilir; pinli vurgulanır.
- Mevcut UI desenine uy: panel bir kez kurulur, her tick'te yalnızca nokta konumları güncellenir
  (titreme yok — mevcut "yerinde güncelle" prensibi).

**Test:** frontend (manuel smoke + opsiyonel jsdom yok); saf yardımcı varsa (pct→nokta) birim test.

---

## Mimari özet

- Yeni saf modül: `driverRules.js`. Yeni durumsal modül: `stintTracker.js` (+ store persist).
- `eventDetector.js`: `driver_rule` olay tipi (status geçişi). `model.js`: CarState'e `stint` +
  `drivers[].rule` (opsiyonel, default null).
- `index.js`: stintTracker.update + driverRules assess entegrasyonu (her iki provider).
- Frontend: pist haritası paneli.
- Griiip yolu: stint analizi Griiip'te de çalışır (lap/pit verisi var); pist haritası Swiss-only
  (trackPositionPct); driver rules Swiss-only pratikte (Griiip driverTimes DriverSwap'ten zaten var,
  çalışır ama SRO kuralları WEC'e uymaz → config ile kapatılabilir, varsayılan açık).

## Açık uçlar / v2
- Sınıf-kategori ince min kuralları (Gold'da Silver ≥4s, Pro-Am Bronze 6h-pencere).
- Max sürekli sürüş + zorunlu mola takibi.
- Pist haritası: gerçek ölçekli Spa geometrisi (v1 sadeleştirilmiş siluet).
- Stint pace'inde SC/FCY turlarının daha akıllı filtrelenmesi (flag ile).

## Test stratejisi
Mevcut 91 test korunur. Yeni saf/durumsal modüller TDD ile fixture'sız (sentetik girdi) test edilir.
Frontend harita manuel smoke (canlı veriyle) + varsa pct→nokta yardımcısı birim test.
