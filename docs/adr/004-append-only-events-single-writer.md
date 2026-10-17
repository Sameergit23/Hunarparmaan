# 004. Append-only events; the API is the only database writer

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** FR-06, FR-10, FR-11, NFR-04; rules 3 and 4 in `CLAUDE.md`

## Context

Phones work offline for long periods and sync later. Scores and evidence must be auditable, and a
tampered or edited record must be detectable. Two-way sync of mutable rows would need conflict
resolution, which is hard to make correct and hard to audit.

## Decision

- Scores, evidence and audit entries are **events with UUIDv7 ids**. They are never updated or
  deleted; a correction is a new event (for example a score with `supersedes`).
- Every phone event is also an entry in the **per-device hash chain**: it carries `deviceId`,
  `seq` (from 1) and `prevHash`, and its `hash` is the SHA-256 of its RFC 8785 canonical JSON
  without `hash`. The schemas are in `packages/contracts/src/events.ts` and the chain code is in
  `packages/audit`.
- `POST /v1/sync/push` is idempotent by event id: a repeated event is acknowledged as `duplicate`
  (IT-01). The server verifies each batch as a continuation of the stored chain
  (`verifyChain(batch, { after })`) and rejects everything from the first bad entry.
- Only the API and its queue worker write to PostgreSQL. The AI service is stateless: it returns
  results and never touches the database.
- QP data is not synced as events: it is owned and versioned by the server as trade packs.

## Consequences

- No merge conflicts: devices only append to their own chain.
- An edited row fails verification at that row (IT-02). Rewriting the chain from that row on does
  not help once the entries have synced: they no longer match the server's stored copy.
- Current state (for example the latest score per criterion) is derived from events, so reads need
  a projection or a view.
- The database user for the API should have no `UPDATE` or `DELETE` grant on event tables.
