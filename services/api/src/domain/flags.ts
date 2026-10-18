import { v7 as uuidv7 } from 'uuid';
import type { FlagKind, MessageParams } from '@hunarpramaan/contracts';
import type { Tx } from '../db/client';
import { flags } from '../db/schema';
import { describeFlag } from './messages';

export interface NewFlag {
  kind: FlagKind;
  /** Values for the message; the English `detail` is written from them. */
  params: MessageParams;
  sessionId?: string | null;
  evidenceId?: string | null;
  deviceId?: string | null;
}

/** Record an integrity flag. Flags are append-only; the agency reviews them. */
export async function raiseFlag(tx: Tx, flag: NewFlag): Promise<void> {
  await tx.insert(flags).values({
    id: uuidv7(),
    kind: flag.kind,
    params: flag.params,
    detail: describeFlag(flag.kind, flag.params),
    sessionId: flag.sessionId ?? null,
    evidenceId: flag.evidenceId ?? null,
    deviceId: flag.deviceId ?? null,
  });
}
