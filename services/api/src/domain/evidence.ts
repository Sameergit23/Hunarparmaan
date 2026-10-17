/**
 * Evidence integrity on the server (rule 5, IT-02). The phone hashed each clip
 * at capture; the server hashes what was uploaded and compares. A mismatch is
 * recorded, flagged and blocks the recommendation.
 */
import { eq } from 'drizzle-orm';
import { createSha256, sha256Hex } from '@hunarpramaan/audit';
import type { SessionUser } from '@hunarpramaan/contracts';
import type { Tx } from '../db/client';
import { evidence, evidenceChecks, sessions } from '../db/schema';
import { forbidden, notFound } from '../http/errors';
import { clipKey } from '../storage/object-store';
import type { Deps } from './context';
import { raiseFlag } from './flags';

type Clip = typeof evidence.$inferSelect;

/** The clip, if it belongs to a session this assessor runs. */
export async function clipForAssessor(
  deps: Deps,
  user: SessionUser,
  evidenceId: string,
): Promise<Clip> {
  const [row] = await deps.db
    .select({ clip: evidence, assessorId: sessions.assessorId })
    .from(evidence)
    .innerJoin(sessions, eq(sessions.id, evidence.sessionId))
    .where(eq(evidence.id, evidenceId));
  if (!row) throw notFound('Evidence');
  if (row.assessorId !== user.id) throw forbidden('This clip belongs to another assessor');
  return row.clip;
}

async function recordCheck(tx: Tx, deps: Pick<Deps, 'newId'>, clip: Clip, actual: string) {
  const status = actual === clip.sha256 ? 'verified' : 'mismatch';
  await tx.insert(evidenceChecks).values({
    id: deps.newId(),
    evidenceId: clip.id,
    status,
    actualSha256: actual,
  });
  if (status === 'mismatch') {
    await raiseFlag(tx, {
      kind: 'hash_mismatch',
      sessionId: clip.sessionId,
      evidenceId: clip.id,
      deviceId: clip.deviceId,
      params: { criterionId: clip.criterionId },
    });
  }
  return status;
}

/**
 * Upload through the API (when there is no S3 store). A file whose hash does
 * not match is never stored under the clip's key, so it cannot replace a good one.
 */
export async function receiveUpload(deps: Deps, clip: Clip, bytes: Uint8Array) {
  const actual = sha256Hex(bytes);
  if (actual === clip.sha256) {
    await deps.store.put(clipKey(clip.sha256), bytes);
    return 'stored' as const;
  }
  await deps.db.transaction((tx) => recordCheck(tx, deps, clip, actual));
  return 'mismatch' as const;
}

/** Job `evidence.rehash`: read the stored clip, hash it and record the result. */
export async function rehashEvidence(
  deps: Deps,
  evidenceId: string,
): Promise<'verified' | 'mismatch' | 'missing'> {
  const [clip] = await deps.db.select().from(evidence).where(eq(evidence.id, evidenceId));
  if (!clip) return 'missing';
  const chunks = await deps.store.read(clipKey(clip.sha256));
  if (!chunks) return 'missing';
  const hasher = createSha256();
  for await (const chunk of chunks) hasher.update(chunk);
  const actual = hasher.digestHex();
  return deps.db.transaction((tx) => recordCheck(tx, deps, clip, actual));
}
