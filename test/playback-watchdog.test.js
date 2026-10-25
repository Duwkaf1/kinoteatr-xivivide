import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackWatchdog } from '../src/playback-watchdog.js';
function clock() {
  let current = 0; let serial = 0; const tasks = new Map();
  return {
    now: () => current,
    setTimer(fn, delay) { const id = ++serial; tasks.set(id, { fn, at: current + delay }); return id; },
    clearTimer: id => tasks.delete(id),
    advance(ms) {
      const target = current + ms;
      while (true) { const next = [...tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; tasks.delete(next[0]); current = next[1].at; next[1].fn(); }
      current = target;
    },
    pending: () => tasks.size,
  };
}
test('thirty seconds without media progress expire despite repeated readiness/waiting events', () => {
  const time = clock(); let failures = 0;
  const monitor = playbackWatchdog({ ...time, timeoutMs: 30000, initialTime: 90, onTimeout: () => failures++ });
  monitor.start();
  for (let i = 0; i < 29; i++) { time.advance(1000); monitor.start(); monitor.progress(90); monitor.progress(NaN); }
  assert.equal(failures, 0); time.advance(1000); assert.equal(failures, 1); assert.equal(time.pending(), 0);
});
test('only actual progress resets the deadline; paused time never triggers a switch', () => {
  const time = clock(); let failures = 0;
  const monitor = playbackWatchdog({ ...time, timeoutMs: 30000, onTimeout: () => failures++ });
  monitor.start(); time.advance(29000); monitor.progress(1); time.advance(29000); assert.equal(failures, 0);
  monitor.pause(); time.advance(120000); assert.equal(failures, 0); assert.equal(time.pending(), 0);
  monitor.start(); time.advance(29999); assert.equal(failures, 0); time.advance(1); assert.equal(failures, 1);
});
test('a quick retry inherits its remaining budget instead of another thirty seconds', () => {
  const time = clock(); let failures = 0;
  const first = playbackWatchdog({ ...time, timeoutMs: 30000, onTimeout: () => failures++ });
  first.start(); time.advance(29000); const deadlineAt = first.deadline; first.dispose();
  const retry = playbackWatchdog({ ...time, timeoutMs: 30000, deadlineAt, onTimeout: () => failures++ });
  retry.start(); time.advance(999); assert.equal(failures, 0); time.advance(1); assert.equal(failures, 1); assert.equal(time.pending(), 0);
});
test('seek resets the checkpoint without extending a stalled deadline; closing cancels pending work', () => {
  const time = clock(); let failures = 0;
  const monitor = playbackWatchdog({ ...time, timeoutMs: 30000, initialTime: 100, onTimeout: () => failures++ });
  monitor.start(); time.advance(29000); monitor.seek(10); monitor.progress(11); time.advance(29000);
  assert.equal(failures, 0); monitor.dispose(); monitor.start(); monitor.seek(1); monitor.progress(12); time.advance(60000);
  assert.equal(failures, 0); assert.equal(time.pending(), 0);
});
test('metadata-driven seeks and ready events alone cannot postpone a stalled source', () => {
  const time = clock(); let failures = 0;
  const monitor = playbackWatchdog({ ...time, timeoutMs: 30000, initialTime: 90, onTimeout: () => failures++ });
  monitor.start(); time.advance(29000); monitor.seek(90); monitor.start(); monitor.progress(90); time.advance(1000);
  assert.equal(failures, 1);
});
