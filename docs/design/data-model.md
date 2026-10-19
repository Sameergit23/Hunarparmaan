# Data model

The schema lives in [`services/api/src/db/schema.ts`](../../services/api/src/db/schema.ts); this page explains it. Decisions are in [ADR 004](../adr/004-append-only-events-single-writer.md) and [ADR 008](../adr/008-database-schema-and-tooling.md).

**Append-only** tables accept `INSERT` only. A trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` (rule 4), and a correction is a new row.

## The event log

| Table | Append-only | What it holds |
|---|---|---|
| `audit_entries` | yes | Every phone event exactly as synced: device, seq, type, actor, payload, `prev_hash` and `hash`. Primary key `(device_id, seq)`. This is the source of truth; the tables below are built from it |

## Accounts and devices

| Table | Append-only | What it holds |
|---|---|---|
| `users` | no | Accounts for every role, with a PIN hash (scrypt). Workers who use a mobiliser's phone need no account |
| `devices` | no | A phone bound to one account (FR-05) |
| `otp_challenges` | no | One-time codes (hashed), with attempts and expiry |

## Trade packs and QPs

| Table | Append-only | What it holds |
|---|---|---|
| `trade_packs` | yes | Every published pack version as JSON, with its SHA-256. Sessions are scored against the version they used |
| `qualifications` · `nos` · `criteria` | no | The current pack's QPs, loaded relationally for queries and joins |

## Workers and declarations (M1)

| Table | Append-only | What it holds |
|---|---|---|
| `workers` | no | Name, phone, language and the eKYC reference, never an Aadhaar number (rule 8) |
| `consents` · `consent_withdrawals` | yes | Consent given and withdrawn, with the notice version and language |
| `declarations` | yes | What speech recognition heard and what the worker confirmed |
| `mapping_results` | yes | AI suggestions only: coverage per QP, suggested QP and route |
| `route_decisions` | yes | The mobiliser's decision, with the suggestion it followed or overrode and the reason |

## Assessment (M2 to M4)

| Table | Append-only | What it holds |
|---|---|---|
| `sessions` | yes | Worker, assessor, QP, pack version, eKYC reference, start photo hash, GPS, device. No foreign key to `workers`: the worker is registered on another phone, which may sync later, so approval waits for it (blocker `worker_unknown`) |
| `calibration_scores` | yes | Scores on the reference clips before a session (FR-07) |
| `evidence` | yes | One row per clip: criterion, SHA-256 at capture, size, time and GPS |
| `evidence_checks` | yes | The server's re-hash of each upload: verified or mismatch |
| `ai_results` | yes | AI suggestions only (`ai_result.stored`, [ADR 012](../adr/012-safety-gear-detector-owlv2.md)): the safety-gear and workmanship checks the queue worker ran on a verified clip, each raised, clear or unclear with a confidence and the frames behind it. One row per clip and engine (model, revision and rules version) |
| `scores` | yes | 0/1/2 with the AI flags the assessor saw, a reason when they disagreed, and `supersedes` for corrections |
| `recommendations` | yes | The signed result and the exact score events it covers |
| `approvals` | yes | The awarding body's single decision per recommendation |
| `certificates` | yes | The QR code id for each approved pass |

## Integrity and consistency (M5)

| Table | Append-only | What it holds |
|---|---|---|
| `flags` | yes | Integrity checks: a kind, the values for its message, and the English text |
| `flag_reviews` | yes | The agency's note on a flag |
| `rescore_tasks` | yes | Clips sampled for blind re-scoring: a random 10% plus every flagged clip, including full marks beside a raised server-side AI check (FR-13) |
| `rescores` | yes | The master assessor's blind score |
| `study_rounds` | no | Round A and Round B results from the rater study; seeded placeholders are marked `demo` |

## Flags

| Kind | Raised when | Blocks approval |
|---|---|---|
| `hash_mismatch` | An uploaded clip does not match the hash taken at capture | Yes |
| `chain_broken` | A pushed event does not continue the device's hash chain | Yes |
| `invalid_event` | A synced event cannot be applied, for example a score for an unknown session or data that breaks a database constraint. The push still succeeds, so the phone's later events are not held up | Yes |
| `result_mismatch` | A signed result does not match the scores, recomputed with `packages/scoring` | Yes |
| `geofence` | A clip was recorded more than `GEOFENCE_RADIUS_M` from where the session started | No, review |
| `mock_gps` | The phone reported a mock location | No, review |
| `reused_clip` | The exact same file was submitted before | No, review |
| `clock_drift` | The phone's clock is more than `CLOCK_DRIFT_LIMIT_S` from server time | No, review |

Approval is also blocked by a worker who has not synced yet, a missing clip, an unchecked clip, or a stored chain that no longer verifies.
