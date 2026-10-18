import { describe, expect, it } from 'vitest';
import { backoffDelay, SYNC_BACKOFF } from './backoff';
import type { PushOutcome } from './sync';
import { SyncLoop, type SyncState } from './sync-loop';

describe('backoffDelay', () => {
  it('doubles from the base up to the cap, half fixed and half random', () => {
    const low = () => 0;
    const high = () => 1;
    expect(backoffDelay(0, low)).toBe(0);
    expect([1, 2, 3, 4].map((n) => backoffDelay(n, high))).toEqual([2_000, 4_000, 8_000, 16_000]);
    expect([1, 2, 3].map((n) => backoffDelay(n, low))).toEqual([1_000, 2_000, 4_000]);
    expect(backoffDelay(30, high)).toBe(SYNC_BACKOFF.maxMs);
    expect(backoffDelay(30, low)).toBe(SYNC_BACKOFF.maxMs / 2);
  });
});

/** A loop with a fake clock and timers, and a queue of outcomes for its passes. */
function harness(outcomes: PushOutcome[], online = { value: true }) {
  const states: SyncState[] = [];
  const timers: { callback: () => void; ms: number }[] = [];
  let runs = 0;
  let release: (() => void) | null = null;
  let hold = false;
  const loop = new SyncLoop({
    run: async () => {
      runs += 1;
      if (hold) await new Promise<void>((resolve) => (release = resolve));
      return outcomes.shift() ?? { kind: 'done', delivered: 0 };
    },
    isOnline: () => online.value,
    onState: (state) => states.push(state),
    setTimer: (callback, ms) => {
      const timer = { callback, ms };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      const i = timers.indexOf(handle as (typeof timers)[number]);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => 0,
    random: () => 1,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    loop,
    states,
    timers,
    settle,
    runs: () => runs,
    holdNextRun: () => (hold = true),
    finishRun: async () => {
      hold = false;
      release?.();
      await settle();
    },
  };
}

const failed: PushOutcome = { kind: 'failed', delivered: 0, error: new Error('offline') };

describe('SyncLoop', () => {
  it('runs a pass when started and ends idle', async () => {
    const h = harness([{ kind: 'done', delivered: 3 }]);
    h.loop.start();
    await h.settle();
    expect(h.runs()).toBe(1);
    expect(h.states.map((s) => s.kind)).toEqual(['sending', 'idle']);
  });

  it('backs off after each failure and tries again when the timer fires', async () => {
    const h = harness([failed, failed, { kind: 'done', delivered: 1 }]);
    h.loop.start();
    await h.settle();
    expect(h.states.at(-1)).toEqual({ kind: 'waiting', retryAt: 2_000, failures: 1 });
    expect(h.timers.map((t) => t.ms)).toEqual([2_000]);

    h.timers.shift()!.callback();
    await h.settle();
    expect(h.states.at(-1)).toEqual({ kind: 'waiting', retryAt: 4_000, failures: 2 });

    h.timers.shift()!.callback();
    await h.settle();
    expect(h.states.at(-1)).toEqual({ kind: 'idle' });
    expect(h.runs()).toBe(3);
  });

  it('waits for the signal instead of trying while offline', async () => {
    const online = { value: false };
    const h = harness([{ kind: 'done', delivered: 2 }], online);
    h.loop.start();
    await h.settle();
    expect(h.runs()).toBe(0);
    expect(h.states).toEqual([{ kind: 'offline' }]);

    online.value = true;
    h.loop.nudge();
    await h.settle();
    expect(h.runs()).toBe(1);
  });

  it('a nudge skips the back-off wait, for example when the signal comes back', async () => {
    const h = harness([failed, { kind: 'done', delivered: 1 }]);
    h.loop.start();
    await h.settle();
    expect(h.timers).toHaveLength(1);
    h.loop.nudge();
    await h.settle();
    expect(h.timers).toHaveLength(0);
    expect(h.states.at(-1)).toEqual({ kind: 'idle' });
  });

  it('never runs two passes at once, and runs once more for a write made during a pass', async () => {
    const h = harness([
      { kind: 'done', delivered: 1 },
      { kind: 'done', delivered: 1 },
    ]);
    h.holdNextRun();
    h.loop.start();
    await h.settle();
    h.loop.nudge();
    h.loop.nudge();
    expect(h.runs()).toBe(1);
    await h.finishRun();
    expect(h.runs()).toBe(2);
  });

  it('stops on a rejected event or an expired sign-in until a person acts', async () => {
    const rejected = harness([
      {
        kind: 'rejected',
        delivered: 0,
        ack: { id: 'x', status: 'rejected', reason: 'chain broken' },
      },
    ]);
    rejected.loop.start();
    await rejected.settle();
    expect(rejected.states.at(-1)).toEqual({ kind: 'rejected', reason: 'chain broken' });
    expect(rejected.timers).toHaveLength(0);

    const expired = harness([{ kind: 'unauthorized', delivered: 0, status: 401 }]);
    expired.loop.start();
    await expired.settle();
    expect(expired.states.at(-1)).toEqual({ kind: 'signed_out' });
    expect(expired.timers).toHaveLength(0);
  });

  it('does nothing after stop', async () => {
    const h = harness([failed]);
    h.loop.start();
    await h.settle();
    h.loop.stop();
    expect(h.timers).toHaveLength(0);
    h.loop.nudge();
    await h.settle();
    expect(h.runs()).toBe(1);
  });
});
