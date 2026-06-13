// src/store.js
import { mkdirSync, appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const eventsPath = join(dir, "events.jsonl");
  const statePath = join(dir, "state.json");

  return {
    appendEvent(event) { appendFileSync(eventsPath, JSON.stringify(event) + "\n"); },
    readEvents() {
      if (!existsSync(eventsPath)) return [];
      return readFileSync(eventsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
    saveState(stateMap) { writeFileSync(statePath, JSON.stringify(stateMap)); },
    loadState() {
      if (!existsSync(statePath)) return {};
      return JSON.parse(readFileSync(statePath, "utf8"));
    },
  };
}
