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
| Deploy | Şimdilik local; tasarım taşınabilir tutulacak (VPS/Pi'ye gidebilir) |

## Veri kaynağı analizi (mevcut bulgular)

- Sayfa bir Angular SPA. Veri akışı **SignalR** (Microsoft) websocket hub'ı üzerinden.
- İstemci `JoinGroup("SID-<sessionId>")` ile oturum grubuna katılıyor (`SID-18130`).
- Güncellemeler `ReceiveBatch` event'iyle `{ items: [...] }` formatında toplu geliyor.
- Altyapı `insights.griiip.com` / Griiip platformu.
- **Bilinmeyenler (spike ile çözülecek):** hub'ın tam URL'i, auth gerektirip gerektirmediği,
  `items` içindeki alan şeması (hangi alan pozisyon, pit durumu, tur süresi vb.).

## Mimari

Tek bir Node.js süreci, 5 mantıksal modül. Her modül tek sorumluluk, ayrı dosya,
net arayüzlerle bağlı.

```
┌─────────────────────────────────────────────────────────┐
│                   wec-stint-watcher (Node)                │
│                                                           │
│  [feedClient] ──batch──> [eventDetector] ──event──>       │
│   SignalR hub             durum diff'i        [store]     │
│   JoinGroup(SID-18130)    pozisyon/pit/lap     SQLite     │
│   on ReceiveBatch                                 │       │
│                                                   ▼       │
│  [scheduler] ──stint özeti──────────────────> [webServer] │
│   periyodik tetik                             Express+SSE │
└───────────────────────────────────────────────────│──────┘
                                                      ▼
                                          Tarayıcı (dashboard)
                                          canlı durum + Notification API
```

### Modüller

- **`feedClient`** — `@microsoft/signalr` ile hub'a bağlanır, oturum grubuna katılır,
  ham `ReceiveBatch` item'larını yayar (EventEmitter). Bağlantı kopunca otomatik
  reconnect (exponential backoff). Hub URL + şema eşlemesi config'ten gelir.
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

## İlk adım: keşif spike'ı (ön koşul)

Asıl yapıya başlamadan önce küçük, atılabilir bir script:

1. Hub'a bağlan (`@microsoft/signalr`), `JoinGroup("SID-<sessionId>")`.
2. Gelen tüm `ReceiveBatch` item'larını ham JSON olarak dosyaya yaz (birkaç dakika).
3. Çıktıdan belirle: (a) hub URL + auth gereksinimi, (b) item şeması — hangi alan
   pozisyon, pit durumu, tur süresi, sürücü, gap.

Bu çıktı hem `config.hub` değerlerini hem de `eventDetector` alan eşlemesini ve test
fixture'larını besler. **Spike tamamlanmadan kalan modüller netleşmez.**

> Not: Spike, yarış canlıyken (ya da hub aktifken) çalıştırılmalı. Yarış canlı değilse
> hub URL'i yine bundle/negotiate üzerinden çıkarılabilir ama şema için canlı veri gerekir.

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
