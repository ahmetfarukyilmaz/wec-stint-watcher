// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(path = "config.json") {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (!cfg.apiBase) throw new Error("config: apiBase zorunlu");
  if (!cfg.sessionId) throw new Error("config: sessionId zorunlu");
  if (!Array.isArray(cfg.trackedParticipants) || cfg.trackedParticipants.length === 0) throw new Error("config: trackedParticipants boş olamaz");
  if (!cfg.pollIntervalSeconds || cfg.pollIntervalSeconds < 1) throw new Error("config: pollIntervalSeconds >= 1 olmalı");
  return cfg;
}
