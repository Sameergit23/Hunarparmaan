# 006. AI output is a suggestion; only people decide

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** FR-04, FR-08, FR-09, FR-17, NFR-07; rule 1 in `CLAUDE.md`

## Context

The problem statement asks for a clear line between where the tool supports assessor judgement
and where it would replace it. Certification integrity depends on people making every decision.

## Decision

- AI produces suggestions only: QP matches, a suggested route, flags with a confidence, and
  integrity checks. It never scores, signs or approves.
- Authority is one table, `AUTHORITY` in `packages/contracts/src/authority.ts`, listing who may
  perform each action. Automated components act as the `system` principal, which is allowed only
  `mapping.suggested` and `ai_result.stored`.
- `HUMAN_DECISIONS` lists route decisions, calibration scores, scores, re-scores, signing and
  approval. A unit test fails if any of them allows `system`.
- It is enforced twice: the sync event schema rejects an event whose actor may not create it,
  and the API checks the JWT role against the same table on every write (IT-03).
- Overriding a suggestion needs a reason: a route override (FR-04), or full marks despite a raised
  AI flag (FR-08). Both are schema rules, and every override is logged.
- Only an assessor account can sign, and only an awarding-body account can approve.

## Consequences

- The README decision table and the code share one source of truth.
- A new AI capability must add a new suggestion type, not reuse a decision action.
- Override rates become a quality signal for the models (README "How it improves").
