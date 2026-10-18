import { asc, eq } from 'drizzle-orm';
import { verifyChain, type ChainLink } from '@hunarpramaan/audit';
import type { Db, Tx } from '../db/client';
import { auditEntries } from '../db/schema';

export interface DeviceChainResult {
  deviceId: string;
  entries: number;
  ok: boolean;
  failedAtSeq: number | null;
  reason: string | null;
}

/** The devices that wrote events for a session. */
export async function sessionDevices(db: Db | Tx, sessionId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ deviceId: auditEntries.deviceId })
    .from(auditEntries)
    .where(eq(auditEntries.sessionId, sessionId));
  return rows.map((r) => r.deviceId);
}

/** Re-verify a device's whole stored chain, rebuilding each event exactly as the phone hashed it. */
export async function verifyDeviceChain(db: Db | Tx, deviceId: string): Promise<DeviceChainResult> {
  const rows = await db
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.deviceId, deviceId))
    .orderBy(asc(auditEntries.seq));
  const chain: ChainLink[] = rows.map((r) => ({
    id: r.id,
    deviceId: r.deviceId,
    seq: r.seq,
    prevHash: r.prevHash,
    hash: r.hash,
    occurredAt: r.occurredAt,
    actor: r.actor,
    type: r.type,
    payload: r.payload,
  }));
  const verdict = verifyChain(chain);
  return {
    deviceId,
    entries: rows.length,
    ok: verdict.ok,
    failedAtSeq: verdict.ok ? null : verdict.seq,
    reason: verdict.ok ? null : verdict.reason,
  };
}
