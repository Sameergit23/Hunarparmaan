import { desc, eq } from 'drizzle-orm';
import { TradePack, type Qualification } from '@hunarpramaan/contracts';
import { packagePack } from '@hunarpramaan/trade-packs';
import type { Db, Tx } from '../db/client';
import { criteria, nos, qualifications, tradePacks } from '../db/schema';

/**
 * Store a pack version (immutable) and make it the current one for queries.
 * Publishing the same version again is a no-op for the stored copy.
 */
export async function publishPack(db: Db, pack: TradePack): Promise<{ sha256: string }> {
  const { sha256 } = packagePack(pack);
  await db.transaction(async (tx) => {
    await tx
      .insert(tradePacks)
      .values({
        id: pack.pack.id,
        version: pack.pack.version,
        status: pack.pack.status,
        sha256,
        content: pack,
      })
      .onConflictDoNothing();
    for (const q of pack.qualifications) {
      await tx.delete(criteria).where(eq(criteria.nqrCode, q.nqrCode));
      await tx.delete(nos).where(eq(nos.nqrCode, q.nqrCode));
      const row = {
        packId: pack.pack.id,
        packVersion: pack.pack.version,
        title: q.title,
        nsqfLevel: q.nsqfLevel,
        awardingBody: q.awardingBody,
        passRule: q.passRule,
      };
      await tx
        .insert(qualifications)
        .values({ nqrCode: q.nqrCode, ...row })
        .onConflictDoUpdate({ target: qualifications.nqrCode, set: row });
      await tx.insert(nos).values(
        q.nos.map((n) => ({
          nqrCode: q.nqrCode,
          code: n.code,
          title: n.title,
          weight: n.weight,
        })),
      );
      await tx.insert(criteria).values(
        q.nos.flatMap((n) =>
          n.criteria.map((c) => ({
            nqrCode: q.nqrCode,
            id: c.id,
            nosCode: n.code,
            text: c.text,
            marks: c.marks,
            rubric: c.rubric,
            glossary: c.glossary,
          })),
        ),
      );
    }
  });
  return { sha256 };
}

/** The newest stored version of a pack. */
export async function latestPack(db: Db | Tx, id: string) {
  const [row] = await db
    .select()
    .from(tradePacks)
    .where(eq(tradePacks.id, id))
    .orderBy(desc(tradePacks.createdAt))
    .limit(1);
  return row ?? null;
}

export type QualificationLoader = (
  packVersion: string,
  nqrCode: string,
) => Promise<Qualification | null>;

/**
 * Looks up a QP exactly as it was in `packVersion`, so old sessions keep their
 * rules after a pack is revised. Results are cached for the loader's lifetime
 * (one request); pack versions never change once stored.
 */
export function qualificationLoader(db: Db | Tx): QualificationLoader {
  const cache = new Map<string, Promise<Qualification | null>>();
  return (packVersion, nqrCode) => {
    const key = `${packVersion}|${nqrCode}`;
    let found = cache.get(key);
    if (!found) {
      found = db
        .select({ content: tradePacks.content })
        .from(tradePacks)
        .where(eq(tradePacks.version, packVersion))
        .then((rows) => {
          for (const row of rows) {
            const q = TradePack.parse(row.content).qualifications.find(
              (x) => x.nqrCode === nqrCode,
            );
            if (q) return q;
          }
          return null;
        });
      cache.set(key, found);
    }
    return found;
  };
}
