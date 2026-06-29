# WEC Stint Watcher

**Live:** https://timing.thefcompass.com

I built this because the existing live timing tools didn't give me what I
wanted, so I made my own.

A 24/7 Node.js service that watches a live endurance race timing feed, fires
browser notifications on notable events, and tracks driver stints. It polls the
timing provider and pushes updates to a small web UI over Server-Sent Events.

Despite the name, it isn't WEC-only — it works across endurance series through
pluggable timing providers (currently Spa 24 Hours / GT World Challenge and
FIA WEC).

## Run

```bash
npm install
npm start
# open http://127.0.0.1:3000 and click "Enable notifications"
```

Requires Node.js >= 18. Behavior is configured in `config.json` (provider,
poll interval, which events to notify on, tracked cars). See
`config.swiss.example.json` for a Spa 24h starting point.

## Test

```bash
npm test
```
