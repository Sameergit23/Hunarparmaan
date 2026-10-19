/**
 * Runs the sync loop on the phone: pushes when there is a network, when the
 * app comes back to the front and after every write, and keeps the pending
 * count up to date for the sync line on every screen.
 */
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { pendingCount, type LocalDb } from '../db/outbox';
import { pushPending } from '../core/sync';
import { SyncLoop, type SyncState } from '../core/sync-loop';
import { api } from './api';

export interface SyncSnapshot {
  state: SyncState;
  pending: number;
}

export interface SyncService {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SyncSnapshot;
  /** After a write, a sign-in or a tap on "Try again". */
  nudge: () => void;
  stop: () => void;
}

export function startSyncService(options: {
  db: LocalDb;
  deviceId: string;
  getToken: () => string | null;
}): SyncService {
  const { db, deviceId, getToken } = options;
  const listeners = new Set<() => void>();
  let snapshot: SyncSnapshot = { state: { kind: 'idle' }, pending: pendingCount(db) };
  // Only a link is needed: the API is on the venue's LAN, which may have no internet.
  let online = true;

  const publish = (state: SyncState = snapshot.state) => {
    snapshot = { state, pending: pendingCount(db) };
    listeners.forEach((listener) => listener());
  };

  const loop = new SyncLoop({
    run: async () => {
      const token = getToken();
      if (!token) return { kind: 'unauthorized', delivered: 0, status: 401 };
      return pushPending({
        db,
        deviceId,
        transport: (request) => api.push(token, request),
        now: () => new Date(),
      });
    },
    isOnline: () => online,
    onState: (state) => publish(state),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  });

  const applyNetwork = (state: Network.NetworkState) => {
    const wasOnline = online;
    online = state.isConnected !== false;
    if (online && !wasOnline) loop.nudge();
    if (!online && wasOnline) publish({ kind: 'offline' });
  };
  const network = Network.addNetworkStateListener(applyNetwork);
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') loop.nudge();
  });
  void Network.getNetworkStateAsync().then(applyNetwork, () => undefined);
  loop.start();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    nudge: () => {
      publish();
      loop.nudge();
    },
    stop: () => {
      loop.stop();
      network.remove();
      appState.remove();
    },
  };
}
