/**
 * The phone's provisional match (README "Core logic", step 5): glossary terms
 * found in the declaration cover their criteria, and packages/scoring turns
 * that into coverage and a route. The server's full engine (claims and
 * embeddings) re-scores after sync. Either way it is only a suggestion: the
 * mobiliser decides the route (rule 1).
 */
import type { EventPayload, Qualification, Route, TradePack } from '@hunarpramaan/contracts';
import { atLeast, coverage, suggestRoute } from '@hunarpramaan/scoring';
import { isAcronym, skeleton, spellOut, transliterate, words } from './skeleton';

export interface GlossaryHit {
  criterionId: string;
  /** The glossary term that matched. */
  term: string;
  /** The words of the declaration it matched, as the worker said them. */
  heard: string;
  /** False when the spelling was off by one letter. */
  exact: boolean;
}

export interface QualificationMatch {
  nqrCode: string;
  nsqfLevel: number;
  /** Weighted by NOS weight and criterion marks, from 0 to 1. */
  coverage: number;
  coveredCriteria: string[];
  totalCriteria: number;
  /** NOS with at least one criterion not covered: the bridge module's topics. */
  gapNos: string[];
  /**
   * How sure the keyword match is of the criteria it found: 1 when every hit
   * was spelled exactly, lower with near misses, 0 with none.
   */
  confidence: number;
  route: Route;
  needsReview: boolean;
  hits: GlossaryHit[];
}

export interface MappingSuggestion {
  packVersion: string;
  engine: 'device_keyword';
  results: QualificationMatch[];
  suggestedNqrCode: string | null;
  suggestedRoute: Route;
  needsReview: boolean;
}

/** Fewer words than this is a short answer, which goes to the mobiliser for review. */
export const MIN_DECLARATION_WORDS = 8;

const NEAR_MISS_STRENGTH = 0.6;

interface Token {
  raw: string;
  key: string;
}

function tokenKey(raw: string): string {
  if (isAcronym(raw)) return skeleton(spellOut(raw));
  return words(raw).map(skeleton).join('');
}

function tokenize(text: string): Token[] {
  return text
    .normalize('NFC')
    .split(/[\s,.;:!?()"'“”‘’।॥/-]+/u)
    .filter(Boolean)
    .map((raw) => ({ raw, key: tokenKey(raw) }))
    .filter((t) => t.key !== '');
}

/** The keys a glossary term can be heard as: an acronym is said letter by letter, or read as a word. */
function termKeys(term: string): string[] {
  const parts = term.split(/\s+/).filter(Boolean);
  const spoken = parts.map((p) => tokenKey(p)).join('');
  const literal = parts.map((p) => words(p).map(skeleton).join('')).join('');
  return [...new Set([spoken, literal])].filter((k) => k.length >= 2);
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Find a glossary term in the declaration, across up to two extra words for split spellings. */
function findTerm(
  tokens: readonly Token[],
  term: string,
): { heard: string; exact: boolean } | null {
  const keys = termKeys(term);
  const termWords = term.split(/\s+/).length;
  const span = Math.min(termWords + 2, 6);
  let nearMiss: { heard: string; exact: boolean } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    let joined = '';
    for (let n = 1; n <= span && i + n <= tokens.length; n++) {
      joined += tokens[i + n - 1]!.key;
      for (const key of keys) {
        if (joined === key) {
          return { heard: phrase(tokens, i, n), exact: true };
        }
        // A one-letter slip counts only on longer keys and the same number of words:
        // otherwise short keys and joined-up words match by chance.
        if (!nearMiss && n === termWords && key.length >= 5 && editDistanceAtMostOne(joined, key)) {
          nearMiss = { heard: phrase(tokens, i, n), exact: false };
        }
      }
    }
  }
  return nearMiss;
}

const phrase = (tokens: readonly Token[], start: number, count: number) =>
  tokens
    .slice(start, start + count)
    .map((t) => t.raw)
    .join(' ');

/** Which criteria of one qualification the declaration covers, and why. */
export function matchQualification(
  qualification: Qualification,
  transcript: string,
): { coveredCriteria: string[]; hits: GlossaryHit[]; confidence: number } {
  const tokens = tokenize(transcript);
  const hits: GlossaryHit[] = [];
  for (const nos of qualification.nos) {
    for (const criterion of nos.criteria) {
      let best: GlossaryHit | null = null;
      for (const term of criterion.glossary) {
        const found = findTerm(tokens, term);
        if (found && (!best || (found.exact && !best.exact))) {
          best = { criterionId: criterion.id, term, ...found };
          if (found.exact) break;
        }
      }
      if (best) hits.push(best);
    }
  }
  const confidence =
    hits.length === 0
      ? 0
      : hits.reduce((sum, h) => sum + (h.exact ? 1 : NEAR_MISS_STRENGTH), 0) / hits.length;
  return { coveredCriteria: hits.map((h) => h.criterionId), hits, confidence };
}

/**
 * The provisional match for a declaration against every qualification in the
 * pack. The suggested QP is the highest NSQF level that reaches the routing
 * threshold; when none does, the one with the most coverage, through a bridge
 * module.
 */
export function suggestMapping(pack: TradePack, transcript: string): MappingSuggestion {
  const results = pack.qualifications.map((q): QualificationMatch => {
    const match = matchQualification(q, transcript);
    const cov = coverage(q, match.coveredCriteria);
    const route = suggestRoute(cov.value, pack.policy);
    return {
      nqrCode: q.nqrCode,
      nsqfLevel: q.nsqfLevel,
      coverage: cov.value,
      coveredCriteria: cov.covered,
      totalCriteria: cov.covered.length + cov.gaps.length,
      gapNos: cov.gapNos,
      confidence: match.confidence,
      route: route.route,
      needsReview: route.needsReview,
      hits: match.hits,
    };
  });

  const qualifying = results
    .filter((r) => atLeast(r.coverage, pack.policy.routingThreshold))
    .sort((a, b) => b.nsqfLevel - a.nsqfLevel);
  const best =
    qualifying[0] ??
    [...results].sort((a, b) => b.coverage - a.coverage || a.nsqfLevel - b.nsqfLevel)[0];
  const suggested = best && best.coverage > 0 ? best : null;
  const short = words(transliterate(transcript)).length < MIN_DECLARATION_WORDS;

  return {
    packVersion: pack.pack.version,
    engine: 'device_keyword',
    results,
    suggestedNqrCode: suggested?.nqrCode ?? null,
    suggestedRoute: suggested?.route ?? 'bridge_module',
    needsReview: !suggested || suggested.needsReview || short,
  };
}

/** The `mapping.suggested` payload, with only the fields the contract allows. */
export function mappingPayload(
  declarationId: string,
  suggestion: MappingSuggestion,
): EventPayload<'mapping.suggested'> {
  return {
    declarationId,
    packVersion: suggestion.packVersion,
    engine: suggestion.engine,
    results: suggestion.results.map((r) => ({
      nqrCode: r.nqrCode,
      coverage: Math.min(1, r.coverage),
      coveredCriteria: r.coveredCriteria,
      confidence: r.confidence,
    })),
    suggestedNqrCode: suggestion.suggestedNqrCode,
    suggestedRoute: suggestion.suggestedRoute,
    needsReview: suggestion.needsReview,
  };
}
