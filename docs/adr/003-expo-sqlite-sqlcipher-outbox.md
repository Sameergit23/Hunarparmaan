# 003. `expo-sqlite` + SQLCipher + an outbox, not WatermelonDB

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** FR-10, NFR-01, NFR-04

## Context

Every worker and assessor step must work with no network, and data on the phone must be encrypted.
The idea PPT proposed WatermelonDB. `expo-sqlite` now has SQLCipher built in, and our sync model is
append-only events (ADR 004), so we do not need WatermelonDB's two-way record sync.

## Decision

- Local data lives in `expo-sqlite` with SQLCipher enabled, accessed through Drizzle ORM.
- Every write goes to its table and, in the same transaction, to an `outbox` table as a sync event
  (`packages/contracts`), sealed into the device's hash chain (`packages/audit`).
- The outbox pushes in order with back-off; clips upload separately in resumable parts.

## Consequences

- One local database, encrypted, with the outbox as the only sync path.
- The pending count shown to the assessor is the outbox's row count.
- We write our own small sync loop instead of using a framework.
