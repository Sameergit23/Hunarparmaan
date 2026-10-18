/**
 * The small sync loop of ADR 003. It runs a pass when nudged (after a write,
 * when the signal comes back, or when someone taps "Try again"), never two at
 * once, and backs off after a failure. Timers and the network check are passed
 * in, so the behaviour is tested without a phone.
 */
import { backoffDelay } from './backoff';
import type { PushOutcome } from './sync';

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'offline' }
  /** A push failed; the next try is at `retryAt`. */
  | { kind: 'waiting'; retryAt: number; failures: number }
  /** The server refused an event. Retrying sends the same events, so it waits for a person. */
  | { kind: 'rejected'; reason: string }
  /** The sign-in expired or the phone is not bound: sign in again, then nudge. */
  | { kind: 'signed_out' };

export interface SyncLoopDeps {
  run: () => Promise<PushOutcome>;
  isOnline: () => boolean;
  onState: (state: SyncState) => void;
  setTimer: (callback: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
  random?: () => number;
}

export class SyncLoop {
  private stopped = true;
  private running = false;
  private again = false;
  private failures = 0;
  private timer: unknown = null;

  constructor(private readonly deps: SyncLoopDeps) {}

  start(): void {
    this.stopped = false;
    this.nudge();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  /** Sync as soon as possible. Safe to call often: a pass in progress just runs once more. */
  nudge(): void {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.clearTimer();
    if (!this.deps.isOnline()) {
      this.deps.onState({ kind: 'offline' });
      return;
    }
    void this.pass();
  }

  private async pass(): Promise<void> {
    this.running = true;
    this.again = false;
    this.deps.onState({ kind: 'sending' });
    let outcome: PushOutcome;
    try {
      outcome = await this.deps.run();
    } catch (error) {
      outcome = { kind: 'failed', delivered: 0, error };
    }
    this.running = false;
    if (this.stopped) return;

    switch (outcome.kind) {
      case 'done':
        this.failures = 0;
        this.deps.onState({ kind: 'idle' });
        // Something was written while this pass ran.
        if (this.again) this.nudge();
        return;
      case 'rejected':
        this.failures = 0;
        this.deps.onState({ kind: 'rejected', reason: outcome.ack.reason ?? 'rejected' });
        return;
      case 'unauthorized':
        this.deps.onState({ kind: 'signed_out' });
        return;
      case 'failed': {
        this.failures += 1;
        if (!this.deps.isOnline()) {
          this.deps.onState({ kind: 'offline' });
          return;
        }
        const delay = backoffDelay(this.failures, this.deps.random);
        this.deps.onState({
          kind: 'waiting',
          retryAt: this.deps.now() + delay,
          failures: this.failures,
        });
        this.timer = this.deps.setTimer(() => {
          this.timer = null;
          this.nudge();
        }, delay);
        return;
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
