/**
 * English wording for flags and approval blockers. The API stores and sends a
 * code plus values (MessageParams); apps word them in Hindi or English (rule 7).
 * These English versions go in `detail`, logs and API error details.
 */
import type { Blocker, FlagKind, MessageParams } from '@hunarpramaan/contracts';

const fill = (template: string, params: MessageParams) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );

/** Why a signed result does not match the scores. */
export type MismatchParams =
  | { reason: 'scores' }
  | { reason: 'incomplete'; criteria: string }
  | { reason: 'outcome'; signed: string; actual: string }
  | { reason: 'aggregate'; signed: number; actual: number };

export function describeMismatch(params: MessageParams): string {
  switch (params.reason) {
    case 'scores':
      return 'the signed scores do not match the scores stored for this session';
    case 'incomplete':
      return fill('scores missing for {criteria}', params);
    case 'outcome':
      return fill('signed {signed}, but the scores give {actual}', params);
    default:
      return fill('signed aggregate {signed}, but the scores give {actual}', params);
  }
}

export function describeFlag(kind: FlagKind, params: MessageParams): string {
  switch (kind) {
    case 'chain_broken':
      return fill('hash chain broken at entry {seq} ({reason}); later events were refused', params);
    case 'clock_drift':
      return fill('device clock is {minutes} min away from server time', params);
    case 'mock_gps':
      return params.criterionId
        ? fill('mock location while recording {criterionId}', params)
        : 'the phone reported a mock location when the session started';
    case 'geofence':
      return fill(
        'clip for {criterionId} recorded {metres} m from where the session started',
        params,
      );
    case 'hash_mismatch':
      return fill(
        'uploaded file for {criterionId} does not match the hash taken at capture',
        params,
      );
    case 'reused_clip':
      return fill('same file as a clip for {criterionId} captured {date}', params);
    case 'result_mismatch':
      return describeMismatch(params);
    case 'invalid_event':
      return fill('{type} at entry {seq} could not be applied: {reason}', params);
    case 'drained_work':
      if (params.when === 'after') return describeStartedLate(params);
      return params.by === 'phone'
        ? fill('{type} at entry {seq} synced after the phone was retired', params)
        : fill('{type} at entry {seq} synced after the account was deactivated', params);
  }
}

function describeStartedLate(params: MessageParams): string {
  return params.by === 'phone'
    ? 'the session started on the phone after it was retired; nothing new may start'
    : 'the session started after the account was deactivated; nothing new may start';
}

export function describeBlocker({ code, params }: Blocker): string {
  switch (code) {
    case 'worker_unknown':
      return "the worker has not synced from the mobiliser's phone yet";
    case 'no_evidence':
      return fill('no evidence for {criterionId}', params);
    case 'clip_unchecked':
      return fill('clip for {criterionId} is not uploaded and checked yet', params);
    case 'clip_mismatch':
      return fill('clip for {criterionId} does not match its hash', params);
    case 'chain_broken':
      return `hash chain broken: ${describeFlag('chain_broken', params)}`;
    case 'invalid_event':
      return `invalid event: ${describeFlag('invalid_event', params)}`;
    case 'stored_chain':
      return fill('hash chain of {deviceId} fails at seq {seq} ({reason})', params);
    case 'result_mismatch':
      return `result mismatch: ${describeMismatch(params)}`;
    case 'missing_data':
      return 'the session or its qualification is missing';
    case 'started_after_deactivation':
      return describeStartedLate(params);
  }
}
