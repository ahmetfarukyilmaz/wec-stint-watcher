// Pollar arası tur/pit gözlemlerinden stint metrikleri biriktirir (durumsal).
export function createStintTracker() {
  const byPid = new Map(); // pid -> { stintStartLap, laps:[{lap,ms}], lastLap, lap, pitCount }

  function update(pid, obs) {
    const { lap, lastLapMs, pitCount } = obs || {};
    let st = byPid.get(pid);
    if (!st) {
      st = { stintStartLap: lap ?? 0, laps: [], lastLap: lap ?? 0, lap: lap ?? 0, pitCount: pitCount ?? 0 };
      byPid.set(pid, st);
      return;
    }
    if (pitCount != null && pitCount > st.pitCount) { st.laps = []; st.stintStartLap = lap ?? st.lap; }
    if (lap != null && lap > st.lastLap && lastLapMs != null) {
      st.laps.push({ lap, ms: lastLapMs });
      if (st.laps.length > 60) st.laps.shift();
    }
    if (lap != null) { st.lastLap = lap; st.lap = lap; }
    if (pitCount != null) st.pitCount = pitCount;
  }

  function get(pid) {
    const st = byPid.get(pid);
    if (!st) return null;
    const stintLaps = Math.max(0, (st.lap ?? 0) - st.stintStartLap);
    const times = st.laps.map((l) => l.ms).filter((m) => m > 0);
    let avgPaceMs = null;
    if (times.length) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const clean = times.filter((m) => m <= median * 1.07); // out/SC turlarını ele
      avgPaceMs = clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length) : null;
    }
    const degradationMsPerLap = st.laps.length >= 4 ? olsSlope(st.laps.map((l, i) => [i, l.ms])) : null;
    const avgStintLaps = st.pitCount > 0 ? st.lap / (st.pitCount + 1) : null;
    const predictedPitLap = avgStintLaps != null ? Math.round(st.stintStartLap + avgStintLaps) : null;
    const lapsToPit = predictedPitLap != null ? predictedPitLap - st.lap : null;
    return {
      stintLaps,
      avgPaceMs,
      degradationMsPerLap,
      avgStintLaps: avgStintLaps != null ? Math.round(avgStintLaps * 10) / 10 : null,
      predictedPitLap,
      lapsToPit,
    };
  }

  function all() { const o = {}; for (const pid of byPid.keys()) o[pid] = get(pid); return o; }
  function dump() { const o = {}; for (const [pid, st] of byPid) o[pid] = st; return o; }
  function load(data) { if (!data || typeof data !== "object") return; for (const [pid, st] of Object.entries(data)) byPid.set(Number(pid), st); }

  return { update, get, all, dump, load };
}

// Basit en-küçük-kareler eğimi (ms/tur).
function olsSlope(points) {
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const d = n * sxx - sx * sx;
  if (d === 0) return null;
  return Math.round((n * sxy - sx * sy) / d);
}
