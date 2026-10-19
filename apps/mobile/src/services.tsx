/** What the signed-in screens share: the local database, the trade pack, the session and sync. */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type {
  Actor,
  DeviceEventType,
  EventPayload,
  SyncEventOf,
  TradePack,
} from '@hunarpramaan/contracts';
import type { LocalDb } from './db/outbox';
import type { StoredSession } from './platform/session';
import type { SyncService, SyncSnapshot } from './platform/sync-service';

export interface Services {
  db: LocalDb;
  deviceId: string;
  pack: TradePack;
  session: StoredSession;
  sync: SyncService;
  /** Save one event: its table and the outbox, in one transaction, then nudge sync. */
  record: <T extends DeviceEventType>(
    type: T,
    payload: EventPayload<T>,
    options?: { actor?: Actor },
  ) => SyncEventOf<T>;
  newEntityId: () => string;
  signOut: () => Promise<void>;
}

const ServicesContext = createContext<Services | null>(null);

export const ServicesProvider = ServicesContext.Provider;

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices must be used inside ServicesProvider');
  return services;
}

export function useSync(): SyncSnapshot {
  const { sync } = useServices();
  return useSyncExternalStore(sync.subscribe, sync.getSnapshot);
}
