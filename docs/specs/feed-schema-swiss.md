# Feed Schema — Swiss Timing (Spa 24h, 2026-06-28)

## ÖNEMLİ: Açık JSON CDN

Swiss Timing canlı timing sayfasının arkasındaki veri kaynağı **tamamen açık REST API**. Auth yok,
referer/cookie gerekmiyor, WebSocket yok. Node `fetch` ile doğrudan pollanabiliyor.

- **Base URL:** `https://ps-cache.web.swisstiming.com/node/db/RAC_PROD/<KEY>.json`
- **Erişim:** HTTP GET, 200 OK, JSON response
- **Polling:** TIMING ~59KB, ~8sn interval; COMP_DETAIL canlı alanlar içeriyor, her poll çekilir
- **Yasal not:** Veri Al Kamel/Swiss Timing'e aittir. Dağıtım/yayın yasaklı. Araç yalnızca kişisel
  kullanım (`127.0.0.1`).

## Keşif zinciri (açılışta bir kez)

| Adım | KEY | İçerik | Amaç |
|------|-----|--------|------|
| 1 | `SRO_SEASONS_JSON` | `content.full.CurrentSeason` | "2026" |
| 2 | `SRO_2026_SEASON_JSON` | `content.full.Meetings[]` (GUID'li), `PresentationMeetingId` | Canlı etkinlik (Spa24) |
| 3 | `SRO_2026_SCHEDULE_<MEETING_GUID>_JSON` | `content.full.Units[]` (oturumlar), `PresentationRoundId` | Canlı oturum |
| 4 | `SRO_2026_TIMING_<UNIT_GUID>_JSON` | ⭐ **canlı timing** | Her poll bu çekilir (~8sn) |
| 5 | `SRO_2026_COMP_DETAIL_<UNIT_GUID>_JSON` | Araç listesi, sürücü, sınıf | Her poll çekilir (canlı alanlar) |

> GUID'ler dosya adında **BÜYÜK harf**. Her dosya yapısı: `{uid, hash, content:{full:{...}}}`

## TIMING şeması (`content.full`)

Canlı timing verisi ve laptiming.

### Üst düzey alanlar

- `UnitId` — oturum GUID
- `UntInfo` — yarış bilgisi
- `Results` — araçlar ve performans verileri

### UntInfo

| Alan | Tip | Açıklama |
|------|-----|----------|
| `ChequeredFlag` | bool | İpli bayrağı (yarış bitti mi) |
| `TrackFlag` | int | Pist durumu (yeşil=0, sarı=1, vs.) |
| `StartRealTime` | string | Yarış başlama zamanı (ISO) |
| `RemainingTime` | string | Kalan süre ("3:54:20" formatı) |
| `SectorFlags` | array | Sektör bayrak durumları |
| `ShowSectorFlags` | bool | Sektör bayraklarını göster mi |

### Results (CompetitorId → Result)

Her araç için (kişiye özgü `CompetitorId` anahtar):

| Alan | Tip | Açıklama |
|------|-----|----------|
| `CompetitorId` | string | Benzersiz araç ID (COMP_DETAIL join için) |
| `ListIndex` | int | Genel sıra sırası |
| `ListIndexClass` | int | Sınıf içi sıra sırası |
| `MainResult` | object | Performans ve durum verileri (aşağıya bakın) |

#### MainResult yapısı

| Alan | Tip | Açıklama |
|------|-----|----------|
| `BestTime` | object | En iyi tur: `{Time (m:ss.mmm string, parse→ms), TimeState, Intermediates[], LapNumber}` |
| `LastLap` | object | Son tur: `{Time (m:ss.mmm string, parse→ms), TimeState, Intermediates[], LapNumber}` |
| `Intermediates[]` | array | Sektör verisi: `{Time (ss.mmm string, parse→ms), Speed, TimeState, SpeedState}` |
| `Rank` | int | Genel konum (sıra) |
| `ClassRank` | int | Sınıf içi konum |
| `RankingTime` | string | Sıralamada kullanılan zaman (best tur veya diğer kriter) |
| `RankingLap` | int | Sıralamada kullanılan tur numarası |
| `TotalTime` | string | Toplam geçen zaman (h:mm:ss.mmm string, parseClockMs ile parse) |
| `TotalLapCount` | int | Tamamlanan tur sayısı |
| `Status` | int | Araç durumu kodu: `2`=koşuyor, `4`=durmuş/garaj/çekilme |
| `SectBasedPcntPos` | float | Pistteki konum yüzdesi (0..1) |
| `NumResultOverrides` | int | Sonuç override sayısı |

**TimeState renkleri:** mor (genel en hızlı), sarı (sınıf en hızlısı), gri (diğer), vs.

## COMP_DETAIL şeması (`content.full`)

Araç kaydı, sürücü bilgisi, sınıf tanımı. Canlı alanlar içeriyor (`CurrentDriverId`, `InPitLane`,
`PitStopCount`).

### Üst düzey alanlar

- `UnitId` — oturum GUID
- `Competitors` — araçlar ve takımlar
- `Classes` — sınıf tanımları
- `Messages` — kontrol merkezi mesajları
- `IntermediateDefinitions` — sektör/ara tanımları
- `SourceRounds`, `SourceRoundsCount` — kaynak oturum meta
- `IntermediateDefinitionsCount` — ara tanım sayısı

### Competitors (CompetitorId → Competitor)

Her araç için (kişiye özgü `CompetitorId` anahtar):

| Alan | Tip | Açıklama |
|------|-----|----------|
| `Id` | string | Benzersiz ID |
| `Bib` | int | **Araç no** — pid olarak kullanılır (Bib→number(Bib)) |
| `ListIndex` | int | Sıra indeksi |
| `ClassId` | string | Sınıf ID (Classes[ClassId]'de bulunur) |
| `TeamName` | string | Takım adı (tam) |
| `TeamShortName` | string | Takım adı (kısa) |
| `TeamCountryCode` | string | Takım ülkesi (ISO 2-char) |
| `TeamId` | string | Takım ID |
| `CarTypeName` | string | Araç türü ("GT3", "LMGT3", vs.) |
| `LicenseHolderName` | string | Lisans sahibi adı |
| `ManufacturerName` | string | Üretici ("Porsche", "BMW", vs.) |
| `Drivers` | object | Sürücü listesi (Id → Driver) |
| **`CurrentDriverId`** ⭐ | string | Direksiyonda olan sürücü ID (canlı) |
| **`InPitLane`** ⭐ | bool | Pit lanedeyiz mi (canlı, güvenilir) |
| **`PitStopCount`** ⭐ | int | Yapılan pit stopları sayısı (canlı) |

#### Drivers (DriverId → Driver)

Her sürücü:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `Id` | string | Sürücü ID |
| `ListIndex` | int | Sıra indeksi |
| `FirstName` | string | Adı |
| `LastName` | string | Soyadı |
| `ShortName` | string | 3 harf kısaltma |
| `CountryCode` | string | Ülkesi (ISO 2-char) |
| `LicenseTypeName` | string | **FIA kategori:** Bronze, Silver, Gold, Platinum |

### Classes (ClassId → Class)

Sınıf tanımları:

| Alan | Tip | Açıklama |
|------|-----|----------|
| `Id` | string | Sınıf ID |
| `ListIndex` | int | Sıra indeksi |
| `Name` | string | Sınıf adı ("Pro Cup", "Silver Cup", vs.) |
| `ShortName` | string | Kısa ad |

### Messages

Kontrol merkezi mesajları (pit girdisi, sürücü değişimi, kesinleşme, vs.). Olay çıkarımı için
bir aday kaynak.

### IntermediateDefinitions

Sektör / ara tanımları (sektör adları, noktalar, vs.).

## Join anahtarı ve pid eşlemesi

**TIMING ↔ COMP_DETAIL:** `CompetitorId` (her iki tarafta da bulunur).

**pid (dahili kullanım):** Swiss provider'da **pid = `Competitors.Bib` sayıya dönüştürülmüş**
(araç no). Bu:
- `config.trackedParticipants` anlamlı tutmayı (araç no esaslı) sağlar
- Mevcut modülleri (trackingStore, UI, summary) değiştirmeden geriye uyumlu kalır
- Bib boş/0/çakışık kenar durumda `CompetitorId` hash'ine fallback'lenir

## Normalize CarState eşlemesi

| CarState alanı | Kaynak |
|---|---|
| `participantId` | `Competitors.Bib` (sayıya dönüştürülmüş) |
| `position` | `MainResult.Rank` |
| `classPosition` | `MainResult.ClassRank` |
| `classId` | `Competitors.ClassId` → `Classes[ClassId]` |
| `carNumber` | `Competitors.Bib` |
| `lapNumber` | `MainResult.TotalLapCount` |
| `lastLapMs` | `MainResult.LastLap.Time` (m:ss.mmm string, parseLapMs ile parse) |
| `bestLapMs` | `MainResult.BestTime.Time` (m:ss.mmm string, parseLapMs ile parse) |
| `bestLapIsPurple` | `MainResult.BestTime.TimeState` (mor = genel en hızlı) |
| `sectors` | `MainResult.LastLap.Intermediates[]` (Time + Speed + TimeState rengi) |
| `topSpeedKph` | `Intermediates[].Speed` maksimumu |
| `gapToFirstMs` | Hesaplanan: `TotalTime` farkı; +N Lap ise tur farkı |
| `gapAheadMs` | Hesaplanan: önceki araçla `TotalTime` farkı |
| `gapBehindMs` | Hesaplanan: sonraki araçla `TotalTime` farkı |
| `inPit` | `Competitors.InPitLane` (bool, güvenilir) |
| `pitCount` | `Competitors.PitStopCount` |
| `retired` | `MainResult.Status > 2` (tahmini; v2'de `Messages` ile iyileştirilir) |
| `team` | `Competitors.TeamName` |
| `manufacturer` | `Competitors.ManufacturerName` |
| `carType` | `Competitors.CarTypeName` |
| `drivers[]` | `Competitors.Drivers[]` (isim + LicenseTypeName/FIA kategori) |
| `currentDriver` | `Competitors.CurrentDriverId` → `Drivers[CurrentDriverId]` |
| `currentDriverCat` | `Drivers[CurrentDriverId].LicenseTypeName` |
| `flag` | `UntInfo.TrackFlag` (pist), `UntInfo.ChequeredFlag` (yarış sonu) |
| `raceClock.remainingMs` | `UntInfo.RemainingTime` (h:mm:ss string, parseClockMs ile parse) |
| `trackPositionPct` | `MainResult.SectBasedPcntPos` (0..1, pistteki konum) |

> Fixtures: `fixtures/swiss_*.json` — canlı Spa 24h yarışından (2026-06-28) çekilmiş veri örnekleri.
> Tüm test senaryoları bu fixture'lara karşı çalışır.
