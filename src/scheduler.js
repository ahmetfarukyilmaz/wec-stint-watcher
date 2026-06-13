// src/scheduler.js
/** @param {number} intervalMs @param {() => (void|Promise<void>)} onTick */
export function createScheduler(intervalMs, onTick) {
  let handle = null;
  return {
    start() {
      if (handle) return;
      handle = setInterval(async () => { try { await onTick(); } catch (e) { console.error("[scheduler]", e); } }, intervalMs);
    },
    stop() { if (handle) { clearInterval(handle); handle = null; } },
  };
}
