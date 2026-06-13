# Feed Schema (spike çıktısı — 2026-06-13, canlı yarış)

## ÖNEMLİ KEŞİF: Açık REST API var

Live timing'in arkasındaki Griiip API'si (`https://insights.griiip.com`) **auth'suz, tamamen
açık** ve temiz JSON döndürüyor. SignalR (`/live-session-stream`) sadece push kanalı; aynı veri
REST'ten anlık görüntü (snapshot) olarak çekilebiliyor. **Bu, mimaride SignalR yerine REST polling
kullanmayı mümkün ve tercih edilir kılıyor** (bkz. plan revizyonu).

- **Base URL:** `https://insights.griiip.com`
- **SignalR hub (alternatif):** `https://insights.griiip.com/live-session-stream`,
  `JoinGroup("SID-<sid>")`, `on("ReceiveBatch", {items:[...]})`.
- **Auth:** Gerekmiyor (public endpoint'ler).
- **Session ID (sid):** 18130 (WEC, canlı). Takip edilen `pid=400061`.

## Olaya/veriye özel REST endpoint'leri (hepsi `GET {base}/...`)

| Endpoint | İçerik |
|----------|--------|
| `/live/ranks/{sid}` | Sıralama: `overallPosition`, `position` (sınıf içi), `pid`, `carNumber`, `classId`, `ts` |
| `/live/gaps/{sid}` | `gapToFirstMillis`, `gapToFirstLaps`, `gapToAheadMillis`, `gapToAheadLaps`, `pid` |
| `/live/laps/{sid}` | Tüm turlar (pid başına): `lapNumber`, `lapTimeMillis`, `isValid`, `color`, `ts` |
| `/live/best-laps/{sid}` | En iyi turlar: `lapTimeMillis`, `lapNumber`, `color` (Purple=genel en hızlı) |
| `/live/pit-in/{sid}` | Pit giriş olayları |
| `/live/pit-out/{sid}` | Pit çıkış olayları |
| `/live/participants/{sid}` | Takım/araç/sürücü meta: `displayName`, `manufacturer`, `currentDriverId`, `drivers[]` (isim, `threeLettersName`, `externalDriverID`, `categoryId`) |
| `/live/participants-running-status/{sid}` | Araçların anlık durumu (running/pit/stopped) |
| `/live/race-flags/{sid}` | Bayrak durumları |
| `/live/racelog-items/{sid}/paged` | Hazır olay günlüğü (sistemin ürettiği olaylar) |
| `/live/session-clock/{sid}` | Yarış saati / kalan süre |
| `/live/session-info/{sid}` | Oturum bilgisi |
| `/api/v2/public/live/session/{sid}/bootstrap` | Tam başlangıç anlık görüntüsü |

## Ortak alan kalıbı

Çoğu kayıtta: `sid` (session id), `pid` (participant id), `carNumber`, `classId`
(örn. `HYPERCAR`, `LMGT3`), `ts` (ISO timestamp), `isDeleted`/`isValid`.

## Takip edilen araç (pid=400061)

- Takım: **MANTHEY DK ENGINEERING**, **Porsche 911 GT3 R LMGT3**, sınıf: LMGT3
- Sürücüler: James COTTINGHAM (COT), Timur BOGUSLAVSKIY (BOG), **Ayhancan GÜVEN** (3 harf adı dosyada)
- `currentDriverId` ile o an direksiyondaki sürücü belirlenir → `participants.drivers[].externalDriverID` ile eşleşir.

## Normalize CarState eşlemesi (REST polling için)

| CarState alanı | Kaynak |
|----------------|--------|
| `participantId` | `ranks[].pid` |
| `position` (genel) | `ranks[].overallPosition` |
| `classPosition` | `ranks[].position` |
| `classId` | `ranks[].classId` |
| `carNumber` | `ranks[].carNumber` |
| `lastLapMs` | `laps[]` içinde pid'in en yüksek `lapNumber` kaydının `lapTimeMillis` |
| `bestLapMs` | `best-laps[]` pid kaydının `lapTimeMillis` |
| `gapAheadMs` | `gaps[].gapToAheadMillis` |
| `gapToFirstMs` | `gaps[].gapToFirstMillis` |
| `inPit` | `participants-running-status[]` pid durumu (pit ise true) — ayrıca pit-in/pit-out ts karşılaştırması |
| `currentDriver` | `participants[].currentDriverId` → `drivers[].externalDriverID` eşleşmesi → `displayName` |
| `flag` | `race-flags[]` güncel bayrak |

> Fixtures: `fixtures/live_*.json` — yukarıdaki endpoint'lerin canlı yanıt örnekleri (test için).
