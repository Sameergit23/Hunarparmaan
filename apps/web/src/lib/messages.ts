/**
 * Words for the API's flag and blocker codes, in the viewer's language
 * (rule 7). The API sends a code plus values; this is where they become text.
 */
import type { AiCheckView, Blocker, FlagKind, MessageParams } from '@hunarpramaan/contracts';
import { clipTime, date, percent } from './format';
import { fill, type Lang, type Messages } from './i18n';

const str = (v: string | number | undefined) => (v === undefined ? '' : String(v));

function mismatchText(params: MessageParams, m: Messages, lang: Lang): string {
  const outcome = (v: string | number | undefined) =>
    v === 'pass' || v === 'fail' ? m.sessions.outcome[v] : str(v);
  switch (params.reason) {
    case 'incomplete':
      return fill(m.detail.mismatch_incomplete, { criteria: str(params.criteria) });
    case 'outcome':
      return fill(m.detail.mismatch_outcome, {
        signed: outcome(params.signed),
        actual: outcome(params.actual),
      });
    case 'aggregate':
      return fill(m.detail.mismatch_aggregate, {
        signed: percent(Number(params.signed), lang, 1),
        actual: percent(Number(params.actual), lang, 1),
      });
    default:
      return m.detail.mismatch_scores;
  }
}

export function flagText(
  flag: { kind: FlagKind; params: MessageParams },
  m: Messages,
  lang: Lang,
): string {
  const p = flag.params;
  switch (flag.kind) {
    case 'mock_gps':
      return p.criterionId ? fill(m.detail.mock_gps_clip, p) : m.detail.mock_gps_start;
    case 'reused_clip':
      return fill(m.detail.reused_clip, { ...p, date: p.date ? date(String(p.date), lang) : '' });
    case 'result_mismatch':
      return mismatchText(p, m, lang);
    default:
      return fill(m.detail[flag.kind], p);
  }
}

export function blockerText(blocker: Blocker, m: Messages, lang: Lang): string {
  switch (blocker.code) {
    case 'chain_broken':
    case 'invalid_event':
      return flagText({ kind: blocker.code, params: blocker.params }, m, lang);
    case 'result_mismatch':
      return mismatchText(blocker.params, m, lang);
    default:
      return fill(m.detail[blocker.code], blocker.params);
  }
}

/**
 * Words for one AI check run on the server after sync (`ai_result.stored`). The
 * page shows a raised check as a yellow hint beside the assessor's score.
 */
export function aiCheckText(c: AiCheckView, m: Messages): string {
  const name = m.aiChecks[c.check] ?? c.check;
  switch (c.status) {
    case 'raised':
      return `${m.aiServer.fault[c.check] ?? fill(m.aiServer.faultOther, { check: name })}, ${fill(
        m.aiServer.sure,
        { confidence: Math.round(c.confidence * 100) },
      )}`;
    case 'clear':
      return fill(m.session.flagClear, { check: name });
    case 'unclear':
      return fill(c.reason === 'no_hazard_seen' ? m.aiServer.noHazard : m.aiServer.notVisible, {
        check: name,
      });
  }
}

/** Where in the clip the check saw it: "Seen at 0:17, 0:31." Empty for a photo. */
export function aiSeenAt(c: AiCheckView, m: Messages): string {
  const times = c.frameTimes.filter((t) => t > 0);
  return times.length ? fill(m.aiServer.seenAt, { times: times.map(clipTime).join(', ') }) : '';
}
