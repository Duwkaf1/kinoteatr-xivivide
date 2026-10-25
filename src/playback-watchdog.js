// A single no-progress deadline. Repeated waiting/playing/metadata events cannot
// extend it: only actual playback progress gets a new window. A seek updates the
// checkpoint without counting a metadata restore / playhead jump as playback.
export function playbackWatchdog({ timeoutMs, onTimeout, initialTime = 0, deadlineAt, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer; let running = false; let disposed = false; let lastTime = initialTime;
  let firstDeadline = Number.isFinite(deadlineAt) ? deadlineAt : null; let deadline = null;
  function cancel() { if (timer !== undefined) clearTimer(timer); timer = undefined; }
  function arm(until = now() + timeoutMs) {
    cancel();
    deadline = until;
    timer = setTimer(() => { timer = undefined; running = false; if (!disposed) onTimeout(); }, Math.max(0, until - now()));
  }
  return {
    get deadline() { return deadline; },
    start() { if (disposed || running) return; running = true; arm(firstDeadline ?? now() + timeoutMs); firstDeadline = null; },
    progress(time) {
      if (!running || disposed || !Number.isFinite(time) || time <= lastTime + 0.01) return;
      lastTime = time; arm();
    },
    seek(time) { if (disposed || !Number.isFinite(time)) return; lastTime = time; },
    pause() { running = false; firstDeadline = null; deadline = null; cancel(); },
    dispose() { disposed = true; running = false; cancel(); },
  };
}
