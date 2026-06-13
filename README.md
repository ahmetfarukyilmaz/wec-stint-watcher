# WEC Stint Watcher

FIA WEC 24h yarışında bir aracı (varsayılan: #91 Manthey, pid 400061) izleyip önemli
olaylarda tarayıcı bildirimi veren ve periyodik stint özeti üreten 7/24 Node.js servisi.
Veri kaynağı: Griiip açık REST API (insights.griiip.com), polling ile.

## Kurulum
npm install

## Çalıştır
npm start
# http://127.0.0.1:3000 — "Bildirimleri aç"a bas

## Yapılandırma — config.json
- apiBase: API kökü (https://insights.griiip.com)
- sessionId: izlenecek oturum (örn. 18130)
- trackedParticipants: takip edilecek araç pid'leri (ilk sürüm tek araç)
- pollIntervalSeconds: poll aralığı (sn)
- events: olay türü başına aç/kapa
- gapThresholdSeconds: gap eşiği
- stintSummaryIntervalMinutes: özet aralığı

## Test
npm test

## Mimari
pollClient (REST poll) -> adapter (CarState) -> eventDetector (diff) -> store + webServer (SSE) -> tarayıcı
Şema/endpoint detayları: docs/specs/feed-schema.md
