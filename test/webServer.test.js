// test/webServer.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/webServer.js";

test("server başlar, /api/state döner ve SSE'ye yayım yapar", async () => {
  const getState = () => ({ 400061: { participantId: 400061, classPosition: 3 } });
  const server = createWebServer({ port: 0, getState, publicDir: "public" });
  const { port } = await server.listen();

  const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  assert.equal(state[400061].classPosition, 3);

  const ctrl = new AbortController();
  const sse = await fetch(`http://127.0.0.1:${port}/events`, { headers: { Accept: "text/event-stream" }, signal: ctrl.signal });
  const reader = sse.body.getReader();
  const dec = new TextDecoder();
  // ilk chunk ": connected" yorumu olabilir; broadcast'i bekleyip olayı arayana kadar oku
  server.broadcast({ type: "pit_in", participantId: 400061, payload: {}, at: 1 });
  let received = "";
  while (!received.includes("pit_in")) {
    const { value, done } = await reader.read();
    if (done) break;
    received += dec.decode(value);
  }
  assert.match(received, /pit_in/);

  ctrl.abort();
  await server.close();
});

test("/api/events geçmiş olayları döner", async () => {
  const events = [{ type: "pit_in", participantId: 400061, payload: {}, at: 10 }, { type: "best_lap", participantId: 400061, payload: {}, at: 20 }];
  const server = createWebServer({ port: 0, getState: () => ({}), getEvents: () => events, publicDir: "public" });
  const { port } = await server.listen();
  const got = await (await fetch(`http://127.0.0.1:${port}/api/events`)).json();
  assert.equal(got.length, 2);
  assert.equal(got[1].type, "best_lap");
  await server.close();
});

test("getEvents verilmezse /api/events boş dizi döner", async () => {
  const server = createWebServer({ port: 0, getState: () => ({}), publicDir: "public" });
  const { port } = await server.listen();
  const got = await (await fetch(`http://127.0.0.1:${port}/api/events`)).json();
  assert.deepEqual(got, []);
  await server.close();
});

test("/api/cars ve /api/tracked + POST add/remove", async () => {
  let tracked = [400061];
  const server = createWebServer({
    port: 0, getState: () => ({}), publicDir: "public",
    getCars: () => [{ pid: 400061, carNumber: "91" }, { pid: 400092, carNumber: "92" }],
    getTracked: () => tracked,
    addCar: (n) => { const pid = 400000 + Number(n); tracked.push(pid); return { ok: true, pid, carNumber: String(n) }; },
    removeCar: (pid) => { tracked = tracked.filter((p) => p !== Number(pid)); return { ok: true }; },
  });
  const { port } = await server.listen();
  const base = `http://127.0.0.1:${port}`;

  const cars = await (await fetch(`${base}/api/cars`)).json();
  assert.equal(cars.length, 2);
  assert.deepEqual(await (await fetch(`${base}/api/tracked`)).json(), [400061]);

  const add = await (await fetch(`${base}/api/tracked`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add: "92" }) })).json();
  assert.equal(add.ok, true);
  assert.equal(add.pid, 400092);
  assert.deepEqual(await (await fetch(`${base}/api/tracked`)).json(), [400061, 400092]);

  await fetch(`${base}/api/tracked`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ remove: 400061 }) });
  assert.deepEqual(await (await fetch(`${base}/api/tracked`)).json(), [400092]);

  await server.close();
});

test("/api/meta getMeta sonucunu döner", async () => {
  const server = createWebServer({ port: 0, getState: () => ({}), publicDir: "public", getMeta: () => ({ provider: "swiss", series: "SRO LIVE", readOnly: true }) });
  const { port } = await server.listen();
  const meta = await (await fetch(`http://127.0.0.1:${port}/api/meta`)).json();
  assert.equal(meta.series, "SRO LIVE");
  assert.equal(meta.readOnly, true);
  await server.close();
});

test("readOnly modunda POST uçları 403, GET açık", async () => {
  let tracked = [91];
  const server = createWebServer({
    port: 0, readOnly: true, getState: () => ({}), publicDir: "public",
    getTracked: () => tracked,
    addCar: (n) => { tracked.push(Number(n)); return { ok: true }; },
    setSmart: () => ({ ok: true }),
  });
  const { port } = await server.listen();
  const base = `http://127.0.0.1:${port}`;

  // GET çalışır
  assert.deepEqual(await (await fetch(`${base}/api/tracked`)).json(), [91]);

  // POST'lar reddedilir ve durum değişmez
  const post = await fetch(`${base}/api/tracked`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add: "92" }) });
  assert.equal(post.status, 403);
  const smart = await fetch(`${base}/api/smart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: null, topN: 5 }) });
  assert.equal(smart.status, 403);
  assert.deepEqual(await (await fetch(`${base}/api/tracked`)).json(), [91]);

  await server.close();
});
