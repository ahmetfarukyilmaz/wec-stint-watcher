# Spa 24h (Swiss Timing) Adaptasyonu — Tasarım

Tarih: 2026-06-28
Durum: Onaylandı (kullanıcı), implementasyon planı bekliyor

## Amaç

`wec-stint-watcher`'ı **Crowdstrike 24 Hours of Spa**'ya (SRO / GT World Challenge Europe)
uyarlamak. Spa24 ayrı bir organizasyon ve veri kaynağı WEC'teki Griiip değil, **Swiss Timing**.
Hedef: mevcut tüm özellikleri (olay bildirimleri, stint izleme, kadro, akıllı takip, panel UI)
Spa24 verisiyle çalıştırmak.

## Kapsam sınırı (önemli)

Swiss Timing canlı timing sayfası şu uyarıyı veriyor: veri Al Kamel/Swiss Timing'e aittir, üçüncü
tarafların **dağıtması/yayması** yasal işlemle sonuçlanır. Bu araç **yalnızca kişisel/lokal kullanım**
içindir (`127.0.0.1`, kullanıcı kendi ekranında izler). Veri **yayınlanmaz/paylaşılmaz**. Bu sınır
mevcut WEC kullanımıyla aynı niteliktedir.

## Veri kaynağı (kanıtlanmış)

**Erişim:** Açık JSON CDN. `curl` ile HTTP 200 — auth yok, referer/cookie yok, WebSocket yok.
Node `fetch` ile doğrudan pollanır (CORS yalnızca tarayıcıyı bağlar, Node'u değil). Griiip kadar
temiz ve pollanabilir. (Standalone tarayıcı SPA'sı "no permission" verir — bu yalnızca UI'nın
iframe kontrolüdür; ham JSON dosyaları herkese açıktır.)

**Base:** `https://ps-cache.web.swisstiming.com/node/db/RAC_PROD/<KEY>.json`

**Keşif zinciri** (açılışta bir kez çözülür; sonra yalnızca TIMING pollanır):

| Adım | KEY | İçerik |
|------|-----|--------|
| 1 | `SRO_SEASONS_JSON` | `content.full.CurrentSeason` (= "2026") |
| 2 | `SRO_2026_SEASON_JSON` | `content.full.Meetings` (GUID'li), `PresentationMeetingId` (canlı etkinlik) |
| 3 | `SRO_2026_SCHEDULE_<MEETING_GUID>_JSON` | `content.full.Units` (oturumlar), `PresentationRoundId` (canlı oturum) |
| 4 | `SRO_2026_TIMING_<UNIT_GUID>_JSON` | ⭐ **canlı timing** — her poll bu çekilir |
| 5 | `SRO_2026_COMP_DETAIL_<UNIT_GUID>_JSON` | giriş listesi (araç no, sürücü, sınıf) — seyrek çekilir |
| (ops.) | `SRO_2026_TIMING_<UNIT_GUID>_JSON/<seq>.json` | artımlı delta; v1'de kullanılmaz (full snapshot yeterli) |

> GUID'ler dosya adında **BÜYÜK harf**. Her dosya `{uid, hash, content:{full:{...}}}` sarmalıdır.

### TIMING şeması (`content.full`)

- `UnitId`
- `UntInfo`: `{ ChequeredFlag, TrackFlag (int), StartRealTime, RemainingTime ("3:54:20"), SectorFlags[], ShowSectorFlags }`
- `Results`: `{ <competitorId>: { CompetitorId, ListIndex (genel sıra), ListIndexClass (sınıf sırası),
  MainResult: { BestTime:{Time, TimeState, Intermediates[{Time,Speed,TimeState,SpeedState}], LapNumber},
  LastLap:{Time, TimeState, Intermediates[...], LapNumber}, Rank, ClassRank, RankingTime, RankingLap,
  TotalTime, TotalLapCount, Status (int), SectBasedPcntPos (0..1, pistteki konum), NumResultOverrides } } }`

### COMP_DETAIL şeması (`content.full`)

- `Competitors`: `{ <competitorId>: { Id, Bib (araç no), ListIndex, ClassId, TeamName, TeamShortName,
  TeamCountryCode, CarTypeName, ManufacturerName, Drivers: { <id>: { FirstName, LastName, ShortName,
  CountryCode, LicenseTypeName (Bronze/Silver/Gold/Platinum = FIA kategori) } } } }`
- `Classes`: `{ <classId>: { Id, Name ("Pro Cup"...), ShortName } }`
- `Messages`: yarış kontrol / olay mesajları (pit/sürücü-değişim çıkarımı için aday kaynak)
- `IntermediateDefinitions`: sektör/ara tanımları

**Join anahtarı:** `CompetitorId` (TIMING.Results ↔ COMP_DETAIL.Competitors).

**İç `pid` kimliği (karar):** Sistem geneli (trackingStore, UI, bazı `Number(k)` zorlamaları)
araç-no benzeri sayısal pid varsayar. Swiss provider'da **pid = `Bib` (araç no, sayıya parse)**
kullanılır; `CompetitorId` yalnızca adapter içinde join için. Bu, `config.trackedParticipants`'ın
anlamlı (araç no) kalmasını sağlar ve mevcut modülleri değiştirmeden geriye uyumlu tutar.
Bib boş/0/çakışık olan kenar durumda `CompetitorId` hash'ine fallback (adapter içinde çözülür).

## CarState eşlemesi

| CarState alanı | Kaynak |
|---|---|
| `position` / `classPosition` | `MainResult.Rank` / `ClassRank` |
| `lapNumber` | `MainResult.TotalLapCount` |
| `lastLapMs` | `LastLap.Time` (parse → ms) |
| `bestLapMs` / `bestLapIsPurple` | `BestTime.Time` / `BestTime.TimeState` (mor = oturum en hızlısı) |
| `sectors` | `LastLap.Intermediates[]` (Time + Speed + renk=TimeState) |
| `topSpeedKph` | `Intermediates[].Speed` max |
| `gapToFirstMs` / `gapAheadMs` / `gapBehindMs` | **hesaplanır** — `TotalTime` farkı; `TotalLapCount` farkıyla "+N Lap" |
| `inPit` / retired | `MainResult.Status` kod eşlemesi (canlı veriyle doğrulanacak) |
| `carNumber` | `Competitors.Bib` |
| `classId` | `Competitors.ClassId` → `Classes` |
| `team` | `Competitors.TeamName` |
| `drivers[]` (isim, FIA kat) | `Competitors.Drivers[]` (ShortName + LicenseTypeName) |
| `currentDriver` / `currentDriverCat` | Doğrudan yok → `Messages`'tan çıkarım (canlı doğrulanacak) |
| `flag` | `UntInfo.TrackFlag` / `ChequeredFlag` |
| `raceClock.remainingMs` | `UntInfo.RemainingTime` (parse) |
| `trackPositionPct` (YENİ) | `MainResult.SectBasedPcntPos` |
| `manufacturer`, `carType` (YENİ) | `Competitors.ManufacturerName`, `CarTypeName` |

## Mimari

Provider soyutlaması — **tek kod tabanı, iki organizasyon.** Mevcut WEC kodu bozulmaz.

**Değişmeyen modüller:** `eventDetector`, `store`, `webServer`, `model` (CarState), `scheduler`,
`trackingStore`, `summary`, `driverStints`, `public/*` (frontend).

**Yeni modüller:**
- `src/swissApiClient.js` — keşif zinciri (seasons→season→schedule→presentationRoundId) +
  `fetchTiming()` + `fetchCompDetail()`. `createApiClient` ile aynı arayüzü taklit eder:
  `fetchAll()` → `{ timing, compDetail }` birleşik snapshot.
- `src/swissAdapter.js` — saf fonksiyon `adaptSnapshot(snap, trackedPids) → Map<pid, CarState>`,
  mevcut `adapter.js`'in muadili. `pid` olarak `CompetitorId` (veya Bib) kullanılır.

**Config:** `config.json`'a `provider: "swiss" | "griiip"` (varsayılan mevcut davranış için "griiip").
Swiss için ek alanlar: `seasonKey` (örn. "SRO_2026") opsiyonel; meeting/unit otomatik
`Presentation*Id`'den çözülür (manuel override için `meetingId`/`unitId` opsiyonel).

**`index.js`:** provider'a göre client + adapter çiftini seçer:
```
const { client, adapter } = provider === "swiss"
  ? { client: createSwissApiClient(cfg), adapter: swissAdaptSnapshot }
  : { client: createApiClient(cfg), adapter: adaptSnapshot };
```
`pollClient` zaten `adapter`'ı parametre olarak alacak şekilde küçük bir refactor ile genelleştirilir
(şu an `adapter.js`'i doğrudan import ediyor).

**Model:** CarState'e opsiyonel alanlar eklenir (`trackPositionPct`, `manufacturer`, `carType`).
Mevcut alanlar korunur; Griiip adapter'ı yeni alanları doldurmaz (null), sorun olmaz.

## Eşik/poller notları

- TIMING dosyası ~59KB; `pollIntervalSeconds` (8sn) yeterli. v1'de full snapshot her poll.
- COMP_DETAIL (giriş listesi) ~2 dk'da bir yenilenir (sürücü kadrosu seyrek değişir) — mevcut
  `driverTimesScheduler` paterni gibi.
- Keşif zinciri (Presentation*Id) ~5 dk'da bir tazelenir (oturum değişebilir).

## Açık uçlar — canlı veriyle ÇÖZÜLDÜ (2026-06-28, yarış canlıyken)

COMP_DETAIL.Competitors[id] beklenenden fazla **canlı** alan içeriyor:
1. **Pit** ✅ — `InPitLane` (bool, güvenilir) → `inPit`; `PitStopCount` → `pitCount`.
   (Not: TIMING `Status` pit ile temiz örtüşmüyor; pit için `InPitLane` kullan.)
2. **Aktif sürücü** ✅ — `CurrentDriverId` → `Drivers[CurrentDriverId]`. Yani COMP_DETAIL de
   her poll çekilmeli (InPitLane/CurrentDriverId/PitStopCount canlı değişir).
3. **Hava** — ayrı dosya bulunamadı (WEATHER/CONDITIONS 404). **v1'de `weather: null`** (atla).
4. **Gap** — `TotalTime` farkı; tur-aşağı durumda `TotalLapCount` farkıyla "+N Lap".

`Status` kodları gözlem: `2`=koşuyor, `4`=durmuş/garaj/çekilme karışımı (retired tespiti v2,
şimdilik `Messages` veya Status>2 → "running değil"). Fixture'lar: `fixtures/swiss_*.json`.

**Poll revizyonu:** COMP_DETAIL canlı olduğundan TIMING ile birlikte **her poll** çekilir.

## Test stratejisi

- Mevcut test desenini izle (saf fonksiyon testleri). `swissAdapter` için gerçek TIMING/COMP_DETAIL
  fixture'ları (`fixtures/swiss_*.json`) kaydedilip eşleme test edilir.
- `swissApiClient` keşif zinciri, sahte `fetch` ile test edilir.
- Mevcut 62 test (Griiip) bozulmamalı — provider soyutlaması geriye dönük uyumlu.
