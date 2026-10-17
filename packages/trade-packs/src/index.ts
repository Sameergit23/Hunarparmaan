import { TradePack } from '@hunarpramaan/contracts';
import { canonicalize, sha256Hex } from '@hunarpramaan/audit';

/** Trade packs in this repo, by folder name under `packs/`. */
export const PACK_NAMES = ['electrician'] as const;
export type PackName = (typeof PACK_NAMES)[number];

/** Calibration needs 3 reference clips before scoring (FR-07). */
export const MIN_CALIBRATION_CLIPS = 3;

export type PackValidation =
  { ok: true; pack: TradePack; warnings: string[] } | { ok: false; errors: string[] };

/**
 * Problems that keep a pack from being used in a real assessment. A `draft`
 * pack may have them (they are reported as warnings); a `released` pack may not.
 */
export function releaseProblems(pack: TradePack): string[] {
  const problems: string[] = [];
  if (pack.pack.status === 'draft') {
    problems.push('the pack is a draft: its data is a placeholder, not for real assessments');
  }
  for (const q of pack.qualifications) {
    const placeholders = q.nos.filter((n) => n.code.startsWith('DRAFT-')).map((n) => n.code);
    if (placeholders.length > 0) {
      problems.push(`${q.nqrCode} has placeholder NOS codes: ${placeholders.join(', ')}`);
    }
  }
  if (pack.calibrationClips.length < MIN_CALIBRATION_CLIPS) {
    problems.push(
      `FR-07 needs at least ${MIN_CALIBRATION_CLIPS} calibration clips, found ${pack.calibrationClips.length}`,
    );
  }
  return problems;
}

/** Check a parsed pack.json against the schema and, for released packs, release readiness. */
export function validatePack(json: unknown): PackValidation {
  const parsed = TradePack.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  }
  const problems = releaseProblems(parsed.data);
  if (parsed.data.pack.status === 'released' && problems.length > 0) {
    return { ok: false, errors: problems };
  }
  return { ok: true, pack: parsed.data, warnings: problems };
}

export interface PackagedPack {
  fileName: string;
  /** RFC 8785 canonical JSON, so the hash does not depend on formatting. */
  contents: string;
  /** SHA-256 of `contents`; phones check it after download. */
  sha256: string;
}

/** The file that ships to phones. */
export function packagePack(pack: TradePack): PackagedPack {
  const contents = canonicalize(pack);
  return {
    fileName: `${pack.pack.id}-${pack.pack.version}.json`,
    contents,
    sha256: sha256Hex(contents),
  };
}
