/**
 * Contract versions. Rule 9 in CLAUDE.md: any change to this package or the
 * trade-pack schema needs a version bump here and a note in the PR.
 * v1 is frozen at gate G1 (25 Oct 2026); until then it is a draft.
 */
export const CONTRACTS_VERSION = '1.0.0-draft.10';

/** `schemaVersion` written at the top of every trade pack. */
export const TRADE_PACK_SCHEMA_VERSION = '1.0';

/** Sent by phones on every sync push, so the server can refuse an outdated app. */
export const SYNC_PROTOCOL_VERSION = 1;
