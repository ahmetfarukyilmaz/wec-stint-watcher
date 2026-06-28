// test/swissApiClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSwissApiClient } from "../src/swissApiClient.js";

const F = {
  seasons: JSON.parse(readFileSync("fixtures/swiss_seasons.json", "utf8")),
  season: JSON.parse(readFileSync("fixtures/swiss_season.json", "utf8")),
  schedule: JSON.parse(readFileSync("fixtures/swiss_schedule.json", "utf8")),
  timing: JSON.parse(readFileSync("fixtures/swiss_timing.json", "utf8")),
  detail: JSON.parse(readFileSync("fixtures/swiss_comp_detail.json", "utf8")),
};
function fakeFetch(url) {
  const pick = url.includes("SEASONS") ? F.seasons
    : url.includes("SEASON") ? F.season
    : url.includes("SCHEDULE") ? F.schedule
    : url.includes("TIMING") ? F.timing
    : url.includes("COMP_DETAIL") ? F.detail
    : null;
  return Promise.resolve({ ok: pick != null, status: pick ? 200 : 404, json: () => Promise.resolve(pick) });
}

test("resolve: PresentationRoundId'den canlı unit'i bulur", async () => {
  const api = createSwissApiClient({}, fakeFetch);
  await api.resolve();
  const snap = await api.fetchAll();
  assert.ok(snap.timing?.Results);
  assert.ok(snap.detail?.Competitors);
});

test("fetchAll: adapter'ın beklediği şekli döndürür", async () => {
  const api = createSwissApiClient({}, fakeFetch);
  await api.resolve();
  const snap = await api.fetchAll();
  assert.ok(Object.keys(snap.timing.Results).length > 0);
  assert.ok(Object.keys(snap.detail.Competitors).length > 0);
});
