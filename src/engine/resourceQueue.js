// Shared network budget keeps distant texture work from starving landing DEM.
export class ResourceQueue {
  constructor(limit = 4) { this.limit = limit; this.active = 0; this.waiting = []; this.jobs = new Map(); }
  run(key, task, priority = 0) {
    const existing = this.jobs.get(key);
    if (existing) { existing.priority = Math.max(existing.priority, priority); return existing.promise; }
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const job = { key, task, priority, promise, resolve, reject };
    this.jobs.set(key, job); this.waiting.push(job); this.pump();
    return promise;
  }
  pump() {
    while (this.active < this.limit && this.waiting.length) {
      this.waiting.sort((a, b) => b.priority - a.priority);
      const job = this.waiting.shift(); this.active++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        this.active--; this.jobs.delete(job.key); this.pump();
      });
    }
  }
}
export const resourceQueue = new ResourceQueue(4);

/** Give input and rendering a turn before CPU decode / GPU upload work. */
export function whenIdle(timeout = 200) {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout });
    else setTimeout(resolve, 0);
  });
}
