/**
 * A phone, simulated: it builds sync events exactly as the app will, sealed
 * into the device's hash chain. Used by the tests and the demo seed, so both
 * go through the real sync path.
 */
import { v7 as uuidv7 } from 'uuid';
import { seal, sha256Hex, type ChainLink } from '@hunarpramaan/audit';
import {
  SYNC_PROTOCOL_VERSION,
  type Actor,
  type DeviceEventType,
  type EventPayload,
  type SyncEventOf,
  type SyncPushRequest,
} from '@hunarpramaan/contracts';

export class SimulatedPhone {
  private head: ChainLink | null = null;

  constructor(
    readonly deviceId: string,
    readonly actor: Actor,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Create the next event in this phone's chain. */
  event<T extends DeviceEventType>(
    type: T,
    payload: EventPayload<T>,
    options: { actor?: Actor; at?: Date } = {},
  ): SyncEventOf<T> {
    const body = {
      id: uuidv7(),
      deviceId: this.deviceId,
      occurredAt: (options.at ?? this.clock()).toISOString(),
      actor: options.actor ?? this.actor,
      type,
      payload,
    };
    const sealed = seal(this.head, body as never) as unknown as SyncEventOf<T>;
    this.head = sealed as unknown as ChainLink;
    return sealed;
  }

  push(events: readonly SyncEventOf<DeviceEventType>[], sentAt = this.clock()): SyncPushRequest {
    return {
      protocol: SYNC_PROTOCOL_VERSION,
      deviceId: this.deviceId,
      sentAt: sentAt.toISOString(),
      events: events as SyncPushRequest['events'],
    };
  }
}

/** Bytes standing in for a recorded clip, with their SHA-256. */
export function fakeClip(label: string): { bytes: Uint8Array; sha256: string } {
  const bytes = new TextEncoder().encode(`demo clip: ${label}`);
  return { bytes, sha256: sha256Hex(bytes) };
}
