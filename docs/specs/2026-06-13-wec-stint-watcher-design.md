# WEC Stint Watcher — Tasarım Dokümanı

**Tarih:** 2026-06-13
**Durum:** Tasarım (onay bekliyor)

## Amaç

FIA WEC 24 saat yarışında belirli bir aracı/sürücüyü (örn. `participantId=400061`)
takip eden, önemli olaylarda bildirim veren ve periyodik özet üreten bir sistem.
Veri kaynağı resmi live timing: `livetiming.fiawec.com` (Griiip altyapısı, SignalR).

## Kararlar (brainstorm sonucu)

| Konu | Karar |
|------|-------|
| Platform | Web uygulaması (tarayıcı arayüzü + bildirim) |
| Çalışma şekli | **7/24 arka planda** çalışan bağımsız servis (resmi sayfa açık olması gerekmez) |
| Bildirim olayları | Sıra değişimi, pit giriş/çıkış, tur & tempo (best/fastest lap), sürücü değişimi, gap eşiği, incident/bayrak |
| Özet türleri | Periyodik **stint özeti** + **olay anı bağlamı** (AI anlatı ve yarış sonu raporu kapsam dışı) |
| Teknoloji | **Node.js**, tek servis (Express + dosya bazlı kayıt + basit frontend) |
| Saklama | **Dosya bazlı** (JSONL olay günlüğü + JSON state snapshot); SQLite değil |
| Bildirim | Sadece tarayıcı `Notification API` (ses / native masaüstü bildirimi yok) |
| Araç sayısı | **Tek araç** ile başlanacak; config liste olsa da ilk sürüm tek aracı işler |
| **Veri kaynağı** | **REST polling** (spike sonrası karar — bkz. aşağı). SignalR DEĞİL. |
| Deploy | Şimdilik local; tasarım taşınabilir tutulacak (VPS/Pi'ye gidebilir) |

## Veri kaynağı analizi (spike tamamlandı — 2026-06-13)

Spike sırasında **auth gerektirmeyen, tamamen açık bir REST API** keşfedildi
(`https://insights.griiip.com`). SignalR (`/live-session-stream`) yalnızca push kanalı;
aynı veri REST'ten anlık görüntü olarak çekilebiliyor. **Karar: REST polling kullan.**

Detaylı şema ve endpoint listesi: `docs/specs/feed-schema.md`. Özet kullanılacak endpoint'ler
(hepsi `GET https://insights.griiip.com/...`):

- `/live/ranks/{sid}` — sıralama (`overallPosition`, `position`, `pid`, `carNumber`, `classId`)
- `/live/gaps/{sid}` — `gapToFirstMillis`, `gapToAheadMillis`
- `/live/laps/{sid}` — turlar (pid başına son tur = max `lapNumber`)
- `/live/best-laps/{sid}` — en iyi tur (`lapTimeMillis`, `color` Purple=genel en hızlı)
- `/live/pit-in/{sid}`, `/live/pit-out/{sid}` — pit olayları (pitCount + inPit türetilir)
- `/live/participants/{sid}` — sürücü meta (`currentDriverId` → `drivers[].externalDriverID`)
- `/live/race-flags/{sid}` — bayraklar

Canlı yanıt örnekleri `fixtures/live_*.json` altında (test fixture'ı olarak kullanılacak).
Takip edilen `pid=400061` = #91 Manthey DK Engineering (Porsche 911 GT3 R LMGT3, LMGT3 sınıfı).

## Mimari

Tek bir Node.js süreci, 5 mantıksal modül. Her modül tek sorumluluk, ayrı dosya,
net arayüzlerle bağlı.

```
┌─────────────────────────────────────────────────────────┐
│                   wec-stint-watcher (Node)                │
│                                                           │
│  [pollClient] ─snapshot─> [eventDetector] ──event──>      │
│   her N sn REST poll      durum diff'i        [store]     │
│   ranks/gaps/laps/pit...  pozisyon/pit/lap   jsonl+json   │
│   -> adapter -> CarState                          │       │
│                                                   ▼       │
│  [scheduler] ──stint özeti──────────────────> [webServer] │
│   periyodik tetik                             Express+SSE │
└───────────────────────────────────────────────────│──────┘
                                                      ▼
                                          Tarayıcı (dashboard)
                                          canlı durum + Notification API
```

### Modüller

- **`pollClient`** — Her `pollIntervalSeconds`'te bir REST endpoint setini (`ranks`, `gaps`,
  `laps`, `best-laps`, `pit-in`, `pit-out`, `participants`, `race-flags`) `fetch` ile çeker,
  `adapter` ile `Map<pid, CarState>`'e birleştirir, anlık görüntüyü (snapshot) yayar.
  Bir endpoint hata verirse o tur atlanır, servis çökmez.
- **`eventDetector`** — Takip edilen araç(lar) için son bilinen durumu tutar. Her batch'te
  önceki durumla diff alıp tipli olaylar üretir:
  `position_change`, `pit_in`, `pit_out`, `best_lap`, `fastest_lap`, `driver_change`,
  `gap_threshold`, `flag/incident`. Saf fonksiyon olarak yazılır (state + batch → events),
  böylece kolay test edilir. Her olaya **olay anı bağlamı** eklenir
  (pozisyon, öndeki/arkadaki gap, son tur süresi).
- **`store`** (dosya bazlı) — Olaylar `events.jsonl` dosyasına append edilir (her satır bir
  olay: zaman, tür, araç, payload). Son durum `state.json` snapshot olarak yazılır.
  24 saatlik geçmiş; servis restart'ında `state.json`'dan kaldığı yerden devam eder.
- **`scheduler`** — Yapılandırılabilir aralıkla (örn. saat başı veya stint sonunda)
  **periyodik stint özeti** üretir: pozisyon, tur sayısı, en iyi tur, pit sayısı,
  ana rakiplerle gap.
- **`webServer`** (Express) — Dashboard'u sunar; canlı state ile yeni olayları **SSE** ile
  tarayıcıya push'lar. Tarayıcı `Notification API` ile masaüstü bildirimi verir.

## Veri akışı

1. `feedClient` hub'a bağlanır → `JoinGroup("SID-18130")` → `ReceiveBatch` item'ları yayar.
2. `eventDetector` her batch'i alır, son durumla karşılaştırır, olay listesi üretir.
3. Üretilen olaylar `store`'a yazılır ve `webServer`'a iletilir.
4. `webServer` olayları SSE ile tüm bağlı tarayıcılara push'lar.
5. `scheduler` periyodik olarak `store` + güncel state'ten stint özeti üretir → aynı SSE kanalı.
6. Tarayıcı: canlı durum tablosu gösterir, gelen olaylarda `Notification` tetikler.

## Konfigürasyon

Tek `config.json`:

```jsonc
{
  "sessionId": 18130,
  "trackedParticipants": [400061],     // ilk sürüm tek aracı işler; liste sonraki sürüme hazır
  "events": {                          // per olay türü aç/kapa
    "position_change": true,
    "pit": true,
    "lap": true,
    "driver_change": true,
    "gap_threshold": true,
    "flag": true
  },
  "gapThresholdSeconds": 10,           // gap eşiği geçişte tek bildirim
  "stintSummaryIntervalMinutes": 60,
  "hub": { "url": "", "auth": null }   // spike sonrası doldurulacak
}
```

## Hata yönetimi

- **Hub kopması** → exponential backoff reconnect; dashboard'da "bağlantı koptu" rozeti.
- **Bozuk/eksik batch** → ilgili item atlanır ve loglanır; servis çökmez.
- **Servis restart** → SQLite'tan son durum yüklenir; kaçırılan süre "veri boşluğu" işaretlenir.
- **Bildirim spam'i** → debounce/eşik. Gap eşiği yalnızca geçiş anında bir kez tetikler
  (histerezis ile yeniden tetiklemeyi engelle).

## Test stratejisi

- **Spike çıktısı = test fixture**: yakalanan gerçek `ReceiveBatch` JSON'ları kaydedilir.
- `eventDetector` saf fonksiyon → fixture'lara karşı birim testler
  (örn. "art arda gelen şu iki batch `pit_out` üretmeli", "pozisyon 4→3 olunca `position_change`").
- `store` için round-trip testi (events.jsonl append + state.json yaz/oku/yeniden başlat).
- `feedClient` reconnect mantığı sahte bir hub ile test edilir.

## Keşif spike'ı (TAMAMLANDI — 2026-06-13)

Spike canlı yarışta yapıldı. Sonuç: açık REST API keşfedildi, şema `docs/specs/feed-schema.md`'ye
yazıldı, canlı yanıt örnekleri `fixtures/live_*.json`'a kaydedildi. SignalR yerine REST polling'e
geçildi. Bu fixture'lar `adapter` ve `eventDetector` için test verisi olarak kullanılacak.

## Kapsam dışı (YAGNI)

- AI anlatı özeti (Claude API ile doğal dil yorum) — sonraya bırakıldı.
- Yarış sonu toparlayıcı raporu.
- Çok kullanıcılı/auth'lu dağıtım, ölçeklenebilir iki katmanlı mimari.
- Mobil push (ntfy/Pushover) — şimdilik tarayıcı bildirimi yeterli.
- Ses / native masaüstü bildirimi — sadece tarayıcı `Notification` kullanılacak.
- Çoklu araç işleme — ilk sürümde tek araç; config yapısı çokluya hazır.

## Çözülen sorular (onaylandı)

1. **Bildirim:** SSE + tarayıcı `Notification` yeterli; ek ses/native bildirim yok.
2. **Saklama:** Dosya bazlı (`events.jsonl` + `state.json`); SQLite kullanılmayacak.
3. **Araç sayısı:** İlk sürüm tek araç işler.
