/**
 * Words for the API's flag and blocker codes, in the viewer's language
 * (rule 7). The API sends a code plus values; this is where they become text.
 */
import type { Blocker, FlagKind, MessageParams } from '@hunarpramaan/contracts';
import { date, dateTime, percent } from './format';
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

/** The parts of an API error that sign-in pages word. */
export interface SignInError {
  status: number;
  code: string;
  message: string;
  details: string[];
}

/**
 * Words a sign-in or PIN error from its code (rule 7), never the API's English.
 * Null when the code isn't one of these, so the page can fall back to its own wording.
 */
export function signInErrorText(error: SignInError, m: Messages, lang: Lang): string | null {
  switch (error.code) {
    case 'rate_limited':
      return m.login.rateLimited;
    case 'account_locked': {
      const until = error.details.find((d) => d.startsWith('until:'))?.slice('until:'.length);
      return fill(m.login.locked, { time: until ? dateTime(until, lang) : '' });
    }
    case 'pin_rejected':
      return error.details.includes('easy') ? m.pin.easy : fill(m.pin.length, { n: 6 });
    case 'wrong_pin':
      return m.account.wrong;
    case 'invite_invalid':
      return m.invite.invalid;
    case 'phone_in_use':
      return m.invite.existing;
    default:
      return null;
  }
}
