// test/swissAdapter.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swissBuildCars, swissAdaptSnapshot } from "../src/swissAdapter.js";

const timing = JSON.parse(readFileSync("fixtures/swiss_timing.json")).content.full;
const detail = JSON.parse(readFileSync("fixtures/swiss_comp_detail.json")).content.full;
const snap = { timing, detail };

test("swissBuildCars: tüm araçları araç no + sınıf ile listeler", () => {
  const cars = swissBuildCars(snap);
  assert.ok(cars.length >= 60);
  const racing = cars.filter((c) => c.overall != null);
  assert.ok(racing.length >= 60);
  for (const c of racing.slice(0, 5)) {
    assert.equal(typeof c.carNumber, "string");
    assert.ok(c.classId);
    assert.equal(typeof c.overall, "number");
  }
});

test("swissAdaptSnapshot: lider doğru eşlenir", () => {
  const leader = swissBuildCars(snap).find((c) => c.overall === 1);
  const map = swissAdaptSnapshot(snap, [leader.pid]);
  const cs = map.get(leader.pid);
  assert.equal(cs.position, 1);
  assert.equal(cs.classPosition, leader.classPos);
  assert.ok(cs.lapNumber > 0);
  assert.ok(cs.bestLapMs > 0);
  assert.equal(cs.carNumber, leader.carNumber);
  assert.ok(Array.isArray(cs.drivers) && cs.drivers.length > 0);
  // aktif sürücü işaretli
  assert.ok(cs.drivers.some((d) => d.current));
});

test("swissAdaptSnapshot: pit alanları COMP_DETAIL'den", () => {
  const cars = swissBuildCars(snap);
  const map = swissAdaptSnapshot(snap, cars.map((c) => c.pid));
  // en az bir araçta pitCount > 0 olmalı (24h yarış)
  assert.ok([...map.values()].some((cs) => cs.pitCount > 0));
  assert.ok([...map.values()].every((cs) => typeof cs.inPit === "boolean"));
});

test("swissAdaptSnapshot: takip edilmeyen pid map'te yok", () => {
  const map = swissAdaptSnapshot(snap, [999999]);
  assert.equal(map.size, 0);
});

test("swissAdaptSnapshot: null MainResult ile çökmez (DNS/unclassified)", () => {
  // Synthetic snap: bir araçta MainResult: null
  const { timing, detail } = snap;
  const syncSnap = {
    timing: {
      ...timing,
      Results: {
        ...timing.Results,
        "null-main-result-id": {
          ...Object.values(timing.Results)[0],
          MainResult: null,
        },
      },
    },
    detail: {
      ...detail,
      Competitors: {
        ...detail.Competitors,
        "null-main-result-id": {
          ...Object.values(detail.Competitors)[0],
          Id: "null-main-result-id",
        },
      },
    },
  };
  // Bir araç takip et (var olan bir tane)
  const cars = swissBuildCars(snap);
  const trackedPid = cars[0].pid;
  // null MainResult'a rağmen uyarlamak çökmemeli
  const map = swissAdaptSnapshot(syncSnap, [trackedPid]);
  // Geçerli araç hala map'te olmalı
  assert.ok(map.has(trackedPid));
  const cs = map.get(trackedPid);
  assert.ok(cs);
  assert.equal(typeof cs.participantId, "number");
});
