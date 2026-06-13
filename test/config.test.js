// test/config.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync } from "node:fs";
import { loadConfig } from "../src/config.js";

const base = { apiBase: "https://insights.griiip.com", sessionId: 18130, trackedParticipants: [400061], pollIntervalSeconds: 8, events: {}, gapThresholdSeconds: 10, stintSummaryIntervalMinutes: 60, webPort: 3000, dataDir: "data" };

test("geçerli config yüklenir", () => {
  const p = "config.test.json";
  writeFileSync(p, JSON.stringify(base));
  const cfg = loadConfig(p);
  assert.equal(cfg.sessionId, 18130);
  assert.equal(cfg.trackedParticipants[0], 400061);
  rmSync(p);
});

test("apiBase boşsa hata fırlatır", () => {
  const p = "config.bad.json";
  writeFileSync(p, JSON.stringify({ ...base, apiBase: "" }));
  assert.throws(() => loadConfig(p), /apiBase/);
  rmSync(p);
});

test("trackedParticipants boşsa hata fırlatır", () => {
  const p = "config.bad2.json";
  writeFileSync(p, JSON.stringify({ ...base, trackedParticipants: [] }));
  assert.throws(() => loadConfig(p), /trackedParticipants/);
  rmSync(p);
});
