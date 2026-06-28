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

test("trackedParticipants boş dizi geçerlidir", () => {
  const p = "config.bad2.json";
  writeFileSync(p, JSON.stringify({ ...base, trackedParticipants: [] }));
  const cfg = loadConfig(p);
  assert.deepEqual(cfg.trackedParticipants, []);
  rmSync(p);
});

test("trackedParticipants dizi değilse hata fırlatır", () => {
  const p = "config.bad3.json";
  writeFileSync(p, JSON.stringify({ ...base, trackedParticipants: null }));
  assert.throws(() => loadConfig(p), /trackedParticipants/);
  rmSync(p);
});

test("loadConfig: provider yoksa default griiip", () => {
  const p = "test/.tmp-config.json";
  writeFileSync(p, JSON.stringify({ apiBase: "x", sessionId: 1, trackedParticipants: [1], pollIntervalSeconds: 8 }));
  const cfg = loadConfig(p);
  assert.equal(cfg.provider ?? "griiip", "griiip");
  rmSync(p);
});
