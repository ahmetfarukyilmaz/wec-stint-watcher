// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(path = "config.json") {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  const provider = cfg.provider ?? "griiip";
  if (provider === "griiip") {
    if (!cfg.apiBase) throw new Error("config: apiBase zorunlu (griiip)");
    if (!cfg.sessionId) throw new Error("config: sessionId zorunlu (griiip)");
  }
  if (!Array.isArray(cfg.trackedParticipants)) throw new Error("config: trackedParticipants dizi olmalı");
  if (!cfg.pollIntervalSeconds || cfg.pollIntervalSeconds < 1) throw new Error("config: pollIntervalSeconds >= 1 olmalı");
  return cfg;
}
