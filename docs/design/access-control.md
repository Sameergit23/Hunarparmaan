# Access control and the admin panel

How HunarPramaan decides who may see and do what. The decisions are in [ADR 006](../adr/006-ai-output-is-a-suggestion.md) (AI only suggests), [ADR 010](../adr/010-organisations-admin-roles-access-control.md) (organisations and admin roles) and [ADR 011](../adr/011-personal-data-outside-the-hash-chain.md) (personal data). The code is the source of truth: `AUTHORITY` and `READ_ACCESS` in [`packages/contracts/src/authority.ts`](../../packages/contracts/src/authority.ts).

> [!NOTE]
> **Built today:** the seven roles below, with every write checked against `AUTHORITY` and every read against `READ_ACCESS`. **Planned (ADR 010):** organisations, the four admin roles, scoping by organisation, and the admin panel. Rows marked *planned* do not exist yet.

## The one rule

**Admins manage people, organisations and phones. They never score, sign, approve, review a flag or edit a record.** And nobody who decides can administer. Tests prove both: IT-03 today, IT-04 when the admin roles land.

## Organisations and roles

Every account belongs to one organisation and has one role, for good. A move means a new account.

| Organisation | Roles it can hold | Uses |
|---|---|---|
| Operator (the HunarPramaan team) | `platform_admin` *planned* | Web admin |
| Training partner (RPL centre) | `tp_admin` *planned*, `mobiliser` | Web admin, phone |
| Assessment agency | `agency_admin` *planned*, `agency`, `assessor` | Web admin, web, phone |
| Awarding body (CSDCI) | `ab_admin` *planned*, `awarding_body`, `master_assessor` | Web admin, web, phone |
| Regulator | `ncvet` | Web (aggregates only) |
| Automated components | `system` (not a login) | Mapping suggestions and server checks only |

Workers usually have no login; the mobiliser's phone acts with them.

## What each role sees

| Role | Sees | Never sees |
|---|---|---|
| mobiliser | Workers they registered | Sessions, scores, results |
| assessor | Their own sessions | Other assessors' sessions |
| master_assessor | Blind re-score tasks for the awarding body's QPs | The original score, or the assessor's name; their own sessions |
| agency | Their agency's declarations, sessions, flags and assessors | Other agencies' data |
| awarding_body | Declarations, sessions and approvals for the QPs it owns | Other awarding bodies' QPs |
| ncvet | National totals and rates | Any single worker, declaration, session or assessor |
| platform_admin *planned* | Organisations, accounts (phones masked), devices, the admin log | Worker data, transcripts, clips, scores |
| agency_admin, tp_admin, ab_admin *planned* | Their organisation's accounts, devices and admin log | Case data |

Today (Sprint 0) every agency and awarding-body account sees every session; scoping by organisation lands in Sprint 2. A record outside your scope will return "not found".

## What each role can do

| Action | Who | Status |
|---|---|---|
| Register a worker, record consent and a declaration | mobiliser (worker) | Built |
| Decide the route, overriding the AI's suggestion with a reason | mobiliser | Built |
| Start a session, capture evidence, score, sign | assessor | Built |
| Re-score a sampled clip blind | master_assessor | Built |
| Review a flag (a note, never a clear) | agency | Built |
| Approve or return a recommendation; export to SIDH | awarding_body | Built |
| Suggest a QP match; store server check results | system | Built |
| Create and suspend organisations; invite each organisation's first admin | platform_admin | *Planned* |
| Invite, deactivate, reactivate and unlock their own staff | agency_admin, tp_admin, ab_admin | *Planned* |
| Revoke a lost or retired phone | Each org admin for their own phones; platform_admin anywhere | *Planned* |
| Upload a trade-pack version | platform_admin | *Planned* |
| Release a trade-pack version for its QPs (never one they uploaded) | ab_admin | *Planned* |
| Accredit an assessor for a QP | ab_admin | *Planned* |
| Manage venues and their geofence | tp_admin | *Planned* |

## The admin panel

| Screen | For | What it does | When |
|---|---|---|---|
| People | All four admin roles | List accounts with masked phone, role, status and last sync; deactivate (reason required), reactivate, unlock; invite with a one-time code | S3 (invite S4) |
| Devices | All four admin roles | Each phone's owner, last sync and clips waiting; revoke as lost, retired or replaced | S3 |
| Audit log | All four admin roles; NCVET sees governance entries only | Every admin action, with a "Verify chain" button | S3 |
| Trade packs | platform_admin uploads, ab_admin releases | Two people per release | S4 |
| Accreditations | ab_admin | Grant and revoke per assessor and QP; outlier statistics as a yellow hint | S5 if time |
| Venues | tp_admin | Name, place and geofence radius | S5 if time |
| Settings | All admins (read-only) | Effective values with their floors, such as the 10% re-score minimum | S5 |

Admin screens follow Wire code: English first, every string also in Hindi, destructive actions as a secondary button with a confirmation and a required reason (never a red button), and status chips with an icon and a word.

## Separation of duties

- Nobody can both score and approve: sign, approve, review flags and re-score belong to four different roles.
- A master never re-scores their own session, and never sees the original score.
- The organisation that registers a worker never assesses them.
- A trade-pack release needs two people: the uploader cannot release it.
- Only the awarding body accredits assessors; an agency can never accredit its own.
- The operator cannot create a working assessor or approver; it creates only each organisation's first admin.
- Nobody acts on their own account, removes their organisation's last admin, or sees a PIN or code.
- A deactivation can be lifted only by whoever issued it, or by a higher authority.

## Never allowed

- An AI job or any admin performing a decision: route, score, sign, re-score, flag review, approval, SIDH export.
- Editing or deleting any append-only record: scores, evidence, audit entries, approvals, flags, admin events.
- Clearing a blocking flag or a blocker. The only way forward is new evidence and a new signed recommendation.
- A setting that weakens integrity: auto-approve, letting AI score, or a re-score rate below 10%.
- Personal data (names, phones, eKYC references, PINs, codes, tokens) in logs, admin events or AI prompts. Request logs already redact tokens and cookies.

## Phones that were offline

Phones sync days later, so admin actions must not destroy offline work:

- A **deactivated** account or a **retired** phone drains: recorded work still syncs and is flagged for review, and nothing new starts.
- A phone reported **lost** is refused from the time it was lost, and the sessions affected are listed for re-assessment.
- Checks that depend on other phones (worker synced, consent, accreditation) run at approval time, so the order phones sync in never matters. This already applies to the worker: approval waits with the blocker `worker_unknown`.

## Plan

| When | What |
|---|---|
| Before G1 (25 Oct) | Contracts: admin roles, organisation id, admin actions, grant rules, error codes. Confirm with CSDCI where master assessors belong. |
| Sprint 1 | Organisations, fixed accounts, the bootstrap command. Personal data outside the hash chain (ADR 011). Seed two agencies, a training partner, CSDCI and NCVET, with two admins each. |
| Sprint 2 | Scoping on every endpoint (IT-05). Account status checked on every request. SIDH exports recorded. |
| Sprint 3–4 | People, Devices and Audit log screens. Sign-in limits and lockout. Device revocation with draining. Invites. Trade-pack upload and release. Venues and accreditation, seeded. |
| Sprint 5 | Accreditation and venue screens if time; read-only settings; NCVET governance log. |
| After SIH | Agency empanelment, batches, editable settings, data-rights requests and erasure, break-glass access. |

## To confirm

- Where master assessors sit (awarding body recommended): CSDCI or the mentor, by 22 Oct.
- Blocking workers under 18 in the pilot, and one active account per phone number: recommended, decided with the contracts PR unless the team objects.
- Who the data fiduciary is, and the consent notice text: before the first real recording.
