// test/providers.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSwissProvider } from "../src/providers/swiss.js";

const timing = JSON.parse(readFileSync("fixtures/swiss_timing.json")).content.full;
const detail = JSON.parse(readFileSync("fixtures/swiss_comp_detail.json")).content.full;

test("swissProvider: arayüzü sağlar", () => {
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail }));
  const snap = { timing, detail };
  assert.equal(typeof p.fetchAll, "function");
  assert.ok(p.buildCars(snap).length > 0);
  const cars = p.buildCars(snap);
  assert.ok(p.adapt(snap, [cars[0].pid]).size === 1);
  assert.ok(Array.isArray(p.raceLog(snap)));
});

test("swissProvider.raceLog: Messages'ı RCMessage olaylarına map'ler", () => {
  const detailMsgs = JSON.parse(readFileSync("fixtures/swiss_comp_detail_msgs.json")).content.full;
  const p = createSwissProvider({}, () => Promise.resolve({ timing, detail: detailMsgs }));
  const items = p.raceLog({ timing, detail: detailMsgs });
  assert.ok(items.length >= 1, "en az bir mesaj");
  for (const it of items) {
    assert.equal(it.type, "RCMessage");
    assert.equal(typeof it.raceLogItemId, "string");
    assert.equal(typeof it.text, "string");
  }
  // dedup için id benzersiz olmalı
  const ids = new Set(items.map((x) => x.raceLogItemId));
  assert.equal(ids.size, items.length);
});

test("swissProvider.raceLog: PENALTY/RETIRED mesajlarını sınıflandırır", () => {
  const detailSynthetic = {
    Messages: [
      { Time: "28.06.2026 14:00:00", Type: 1, Text: "CAR 5 - STOP&GO 4SEC PENALTY SHORT TECHNICAL PITSTOP" },
      { Time: "28.06.2026 14:01:00", Type: 1, Text: "CAR 46 RETIRED" },
      { Time: "28.06.2026 14:02:00", Type: 1, Text: "CAR 91 BLUE FLAG" },
      { Time: "28.06.2026 14:03:00", Type: 2, Text: "TRACK CLEAR" },
    ],
  };
  const p = createSwissProvider({}, () => Promise.resolve({}));
  const items = p.raceLog({ detail: detailSynthetic });
  assert.equal(items[0].type, "SignificantTimeLoss");
  assert.equal(items[0].pid, 5);
  assert.equal(items[1].type, "ParticipantRetired");
  assert.equal(items[1].pid, 46);
  assert.equal(items[1].carNumber, "46");
  assert.equal(items[2].type, "RCMessage");
  assert.equal(items[3].type, "RCMessage"); // araç no yok → genel
  // dedup id'ler Type'ı da içerir
  assert.ok(items.every((it) => typeof it.raceLogItemId === "string"));
});
