import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLapMs, parseClockMs } from "../src/swissParse.js";

test("parseLapMs: m:ss.mmm", () => {
  assert.equal(parseLapMs("2:17.484"), 137484);
});
test("parseLapMs: ss.mmm (dakikasız)", () => {
  assert.equal(parseLapMs("39.697"), 39697);
});
test("parseLapMs: boş/null → null", () => {
  assert.equal(parseLapMs(null), null);
  assert.equal(parseLapMs(""), null);
});
test("parseClockMs: h:mm:ss.mmm", () => {
  assert.equal(parseClockMs("20:05:04.277"), 72304277);
});
test("parseClockMs: h:mm:ss (ms'siz)", () => {
  assert.equal(parseClockMs("3:17:46"), 11866000);
});
test("parseClockMs: boş → null", () => {
  assert.equal(parseClockMs(""), null);
});
