# 008. Database schema, append-only triggers and test databases

- **Status:** Accepted
- **Date:** 2026-10-18
- **Requirements:** FR-05, FR-11, FR-13, FR-17, NFR-04; rules 3 and 4 in `CLAUDE.md`

## Context

The README's data model listed ten tables. Building the API showed what it left out: accounts
and bound devices (FR-05), integrity flags and their reviews (FR-11), the blind re-score queue
(FR-13), and approvals and certificates (FR-17). We also need integration tests that run on any
laptop and in CI, and Docker is not always available.

## Decision

- **Schema:** 27 tables in `services/api/src/db/schema.ts`, described in
  [`docs/design/data-model.md`](../design/data-model.md). Drizzle ORM on PostgreSQL; migrations
  are SQL files in `services/api/migrations/`, generated with `pnpm --filter @hunarpramaan/api db:generate`.
- **`audit_entries` is the source of truth.** It stores every phone event exactly as synced and
  hash-chained. The other event tables are projections of those events (or of online actions),
  written in the same transaction.
- **Append-only in the database.** Migration 0001 adds a trigger to 19 tables that rejects
  `UPDATE`, `DELETE` and `TRUNCATE`. Accounts, devices and the current QP tables stay mutable.
- **Structured messages.** Flags and approval blockers carry a code plus values
  (`MessageParams`), and each app words them in Hindi or English (rule 7). The English text is
  kept in `detail` for logs and API clients.
- **Two database drivers.** `DATABASE_URL=postgres://…` uses node-postgres. `pglite:…` uses
  [PGlite](https://pglite.dev), a real PostgreSQL compiled to WebAssembly that runs in-process.
  It is the default for local runs and for tests; production refuses it.
- **Fast tests.** Vitest's global setup migrates one PGlite database, saves its data directory
  (cached by a hash of the migrations), and each test file loads a copy in about a second. CI
  also runs the same tests against a `pgvector/pgvector:0.8.7-pg17` service container.
- **Phones sync in any order.** A projection never fails a push. A rule or a database constraint that an event breaks becomes an `invalid_event` flag. A reference to something another phone creates, such as a session's worker, has no foreign key; approval waits for it instead (blocker `worker_unknown`).
- **Reads take no transaction.** PGlite has a single connection, so a read path that opened a
  transaction and then queried outside it would wait on itself. Read models use the database
  handle directly; writes use one transaction per request.

## Consequences

- A fresh clone runs the API, the seed and every test with no Docker.
- The append-only rule holds even against a bug in the API. Changing a stored event needs a
  database superuser, and the hash chain then exposes the change (IT-02).
- A real PostgreSQL behaves differently in some respects (locking, concurrency), so the CI job on
  PostgreSQL 17 stays required.
- QP tables hold only the current pack. Sessions keep their pack version and are always
  scored against the immutable `trade_packs` copy of that version.
