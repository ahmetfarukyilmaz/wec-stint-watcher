// src/trackedStore.js
// İzlenen araç pid'lerini tutar; data/tracked.json'a yazıp restart'ta korur.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function createTrackedStore(dir, initialPids = []) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "tracked.json");

  let pids;
  if (existsSync(path)) {
    try { pids = JSON.parse(readFileSync(path, "utf8")).map(Number); } catch { pids = [...initialPids]; }
  } else {
    pids = [...initialPids];
    persist();
  }

  function persist() { writeFileSync(path, JSON.stringify(pids)); }

  return {
    list() { return [...pids]; },
    has(pid) { return pids.includes(Number(pid)); },
    add(pid) {
      pid = Number(pid);
      if (pids.includes(pid)) return false;
      pids.push(pid); persist(); return true;
    },
    remove(pid) {
      pid = Number(pid);
      const before = pids.length;
      pids = pids.filter((p) => p !== pid);
      if (pids.length === before) return false;
      persist(); return true;
    },
  };
}
