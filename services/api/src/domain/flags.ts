import { v7 as uuidv7 } from 'uuid';
import type { FlagKind } from '@hunarpramaan/contracts';
import type { Tx } from '../db/client';
import { flags } from '../db/schema';

export interface NewFlag {
  kind: FlagKind;
  detail: string;
  sessionId?: string | null;
  evidenceId?: string | null;
  deviceId?: string | null;
}

/** Record an integrity flag. Flags are append-only; the agency reviews them. */
export async function raiseFlag(tx: Tx, flag: NewFlag): Promise<void> {
  await tx.insert(flags).values({
    id: uuidv7(),
    kind: flag.kind,
    detail: flag.detail,
    sessionId: flag.sessionId ?? null,
    evidenceId: flag.evidenceId ?? null,
    deviceId: flag.deviceId ?? null,
  });
}
