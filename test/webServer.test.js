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
