// test/scheduler.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../src/scheduler.js";

test("verilen aralıkta callback'i tetikler", async () => {
  let calls = 0;
  const sched = createScheduler(10, () => { calls++; });
  sched.start();
  await new Promise((r) => setTimeout(r, 35));
  sched.stop();
  assert.ok(calls >= 2, `en az 2 tetik bekleniyordu, ${calls} oldu`);
});

test("stop sonrası tetiklenmez", async () => {
  let calls = 0;
  const sched = createScheduler(10, () => { calls++; });
  sched.start();
  sched.stop();
  const after = calls;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, after);
});
