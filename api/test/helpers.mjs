/* Shared scaffolding for the api tests.
 *
 * Every module under coach/ resolves DATA_DIR at import time (the same way server.js does),
 * so a test that wants its own data directory has to set the variable before the first
 * import. Hence dynamic imports everywhere below, and one helper that does it in the right
 * order. node:test runs each file in its own process, so one directory per file is enough.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tempData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-test-'));
  fs.writeFileSync(path.join(dir, 'secret'), 'a'.repeat(64), { mode: 0o600 });
  process.env.DATA_DIR = dir;
  return dir;
}

export function writeState(dir, uid, S) {
  fs.writeFileSync(path.join(dir, 'state-' + uid + '.json'), JSON.stringify(S));
}

/** A profile that has consented and has some history — the usual starting point. */
export function sampleState(over = {}) {
  // Keep the default fixture within the rolling review window as the calendar advances.
  // Fixed historical dates made review tests fail when they passed the 12-week cutoff.
  const recent = new Date();
  recent.setUTCDate(recent.getUTCDate() - 3);
  const earlier = new Date(recent);
  earlier.setUTCDate(earlier.getUTCDate() - 19);
  const recentDay = recent.toISOString().slice(0, 10);
  const earlierDay = earlier.toISOString().slice(0, 10);
  return {
    unit: 'kg', lang: 'en', effort: 'rpe', targetW: 80,
    coach: { consent: { agreedAt: new Date().toISOString(), version: 1 }, profile: { goal: 'muscle', daysPerWeek: 3, equipment: ['dumbbell'] } },
    routines: [{
      id: 'r1', name: 'Full body A', emoji: '💪', prog: 'linear',
      ex: [
        { id: '0001', sets: 3, reps: 10, mode: 'reps', weight: 20, prog: 'linear' },
        { id: '0007', sets: 3, sec: 45, mode: 'time' }
      ]
    }],
    week: { 1: 'r1', 3: 'r1', 5: 'r1' },
    dayPlan: {},
    exWeights: { '0001': { w: 20 } },
    bodyweight: [{ d: earlierDay, w: 78 }, { d: recentDay, w: 78.5 }],
    customEx: [],
    workouts: [{
      id: 'w1', d: recentDay, name: 'Full body A', start: 1000, end: 1000 + 45 * 60000, vol: 600, prs: [],
      entries: [{
        id: '0001', target: { sets: 3, reps: 10, weight: 20 },
        sets: [{ w: 20, r: 10, done: true, rpe: 9.5 }, { w: 20, r: 9, done: true, rpe: 10 }, { w: 20, r: 8, done: true, rpe: 10 }]
      }]
    }],
    ...over
  };
}
