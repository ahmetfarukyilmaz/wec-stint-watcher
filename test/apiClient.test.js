// test/apiClient.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/apiClient.js";

function fakeFetch(routes) {
  return async (url) => {
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) throw new Error("beklenmeyen url: " + url);
    return { ok: true, status: 200, json: async () => routes[key] };
  };
}

test("fetchAll tüm endpoint'leri doğru sid ile çeker", async () => {
  const client = createApiClient({ apiBase: "https://x.test", sessionId: 18130 }, fakeFetch({
    "/live/ranks/18130": [{ pid: 1 }],
    "/live/gaps/18130": [{ pid: 1 }],
    "/live/laps/18130": [{ pid: 1 }],
    "/live/best-laps/18130": [{ pid: 1 }],
    "/live/pit-in/18130": [{ pid: 1 }],
    "/live/pit-out/18130": [{ pid: 1 }],
    "/live/participants/18130": [{ pid: 1 }],
    "/live/race-flags/18130": [{ flag: "GF" }],
  }));
  const snap = await client.fetchAll();
  assert.ok(Array.isArray(snap.ranks));
  assert.ok(Array.isArray(snap.gaps));
  assert.ok(Array.isArray(snap.laps));
  assert.ok(Array.isArray(snap.bestLaps));
  assert.ok(Array.isArray(snap.pitIn));
  assert.ok(Array.isArray(snap.pitOut));
  assert.ok(Array.isArray(snap.participants));
  assert.ok(Array.isArray(snap.flags));
});

test("bir endpoint hata verirse o alan [] döner, diğerleri etkilenmez", async () => {
  const ff = async (url) => {
    if (url.includes("gaps")) throw new Error("network");
    return { ok: true, status: 200, json: async () => [{ pid: 1 }] };
  };
  const client = createApiClient({ apiBase: "https://x.test", sessionId: 18130 }, ff);
  const snap = await client.fetchAll();
  assert.deepEqual(snap.gaps, []);
  assert.equal(snap.ranks.length, 1);
});
