# 011. Personal data outside the hash chain

- **Status:** Accepted. Built early in Sprint 1, before the first real worker is recorded.
- **Date:** 2026-10-18
- **Requirements:** NFR-05; rules 4, 5 and 8 in `CLAUDE.md`

## Context

Every phone event is stored exactly as synced in `audit_entries`, which is append-only and
hash-chained (ADR 004). Today `worker.registered` carries the worker's name and phone,
`session.started` the eKYC reference, and `declaration.recorded` the transcript. Once stored,
none of it can ever be corrected or erased without breaking the chain. The DPDP Act and Rules
expect erasure when consent is withdrawn and when the purpose ends.

## Decision

- Events carry **salted digests** instead of the values: HMAC-SHA256 with a random salt per
  worker for name, phone and eKYC reference, and SHA-256 of the transcript.
- The values travel **beside** the event in the same sync push, in an unhashed `pii` part, and are
  stored in ordinary tables that can be erased. The chain still proves the values were not
  changed: the server recomputes each digest when it stores them.
- Erasure clears those rows and the salt, and leaves a tombstone. The chain still verifies.
- Workers under 18 are blocked in the pilot: `worker.registered` carries an age attestation.
- This is a breaking contract change, so it lands together with its API, sync and seed changes
  early in Sprint 1, before any real recording. Until then, demo data only.

## Consequences

- Clips and start photos need the same treatment in the retention ADR that follows.
- Free-text fields (notes and reasons) must not hold names; admin logs use reason codes only.
- The data fiduciary and the consent notice text must be decided before the first real recording.
