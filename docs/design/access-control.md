# Access control and the admin panel

How HunarPramaan decides who may see and do what. The decisions are in [ADR 006](../adr/006-ai-output-is-a-suggestion.md) (AI only suggests), [ADR 010](../adr/010-organisations-admin-roles-access-control.md) (organisations and admin roles) and [ADR 011](../adr/011-personal-data-outside-the-hash-chain.md) (personal data). The code is the source of truth: `AUTHORITY`, `READ_ACCESS`, `ROLES_BY_ORG_KIND`, `GRANTABLE_ROLES` and `SCOPE_BY_ROLE` in [`packages/contracts/src/authority.ts`](../../packages/contracts/src/authority.ts), the roles and organisation kinds in [`roles.ts`](../../packages/contracts/src/roles.ts), and the admin error codes in [`api.ts`](../../packages/contracts/src/api.ts).

> [!NOTE]
> **Built today:** the seven working roles, with every write checked against `AUTHORITY` and every read against `READ_ACCESS`. In contracts: the four admin roles, the five organisation kinds, admin actions with their reason codes, grant rules, scope levels, the organisation id in the session user and the token, and admin error codes. In the API: real organisations (`organisations`, `qp_owners` and `users.organisation_id`; migration 0008 makes the pilot's five and places existing accounts by role), the bootstrap command for the first platform admin, admin accounts, and staff invites into an organisation whose kind holds the role, recorded in the hash-chained admin log. Account and phone status, checked on every request and on sync (below). The admin API: the admin read scopes and read models in each admin's scope, and deactivate, reactivate, unlock, PIN reset and revoke, each with a reason code and the admin's PIN again, logged in the same transaction. **Planned (ADR 010):** scoping of the case-data read models, and the admin screens ([docs/design/admin-panel](admin-panel/)). Rows marked *contracts* exist only as contract tables; rows marked *planned* don't exist yet.

## The one rule

**Admins manage people, organisations and phones. They never score, sign, approve, review a flag or edit a record.** And nobody who decides can administer. Tests prove both: IT-03 and the unit half of IT-04 (`authority.test.ts`) today, and the API half of IT-04 when admin accounts exist in Sprint 1.

## Organisations and roles

Every account belongs to one organisation and has one role, for good. A move means a new account.

| Organisation | Roles it can hold | Uses |
|---|---|---|
| Operator (the HunarPramaan team) | `platform_admin` *contracts* | Web admin |
| Training partner (RPL centre) | `tp_admin` *contracts*, `mobiliser`, `worker` | Web admin, phone |
| Assessment agency | `agency_admin` *contracts*, `agency`, `assessor` | Web admin, web, phone |
| Awarding body (CSDCI) | `ab_admin` *contracts*, `awarding_body`, `master_assessor` | Web admin, web, phone |
| Regulator | `ncvet` | Web (aggregates only) |
| Automated components | `system` (not a login) | Mapping suggestions and server checks only |

This table is `ROLES_BY_ORG_KIND`. Workers usually have no login; the mobiliser's phone acts with them. A worker belongs to the training partner whose mobiliser registered them, and is never invited.

Who may grant which role is `GRANTABLE_ROLES`. Each organisation admin grants their own organisation's roles, including another admin. The platform admin grants only the four admin roles, and `ncvet` because the regulator has no admin of its own. Nobody grants `worker`.

## What each role sees

| Role | Scope (`SCOPE_BY_ROLE`) | Sees | Never sees |
|---|---|---|---|
| worker | Own work | Their own record | Anyone else's |
| mobiliser | Own work | Workers they registered | Sessions, scores, results |
| assessor | Own work | Their own sessions | Other assessors' sessions |
| master_assessor | Owned QPs | Blind re-score tasks for the awarding body's QPs | The original score, or the assessor's name; their own sessions |
| agency | Own organisation | Their agency's sessions, flags and assessors | Other agencies' data |
| awarding_body | Owned QPs | Sessions and approvals for the QPs it owns | Other awarding bodies' QPs |
| ncvet | Aggregates | National totals and rates | Any single worker, session or assessor |
| platform_admin | Governance | Organisations, accounts (phones masked), devices, the admin log | Worker data, transcripts, clips, scores |
| agency_admin, tp_admin, ab_admin | Own organisation | Their organisation's accounts, devices and admin log | Case data, and worker accounts |

The scope column is in contracts. The admin read models take it (`accounts.read`, `devices.read`, `admin_log.read`, and `governance_log.read` for NCVET's counts); the case-data read models take it from Sprint 2.

Today (Sprint 0) every agency and awarding-body account sees every session; scoping by organisation lands in Sprint 2. A record outside your scope will return "not found".

## What each role can do

| Action | Who | Status |
|---|---|---|
| Register a worker, record consent and a declaration | mobiliser (worker) | Built |
| Sign up on their own phone, or claim the record a mobiliser made; change or reset their PIN | worker | Built in the API; phone app planned |
| Change their PIN; stay signed in on a registered phone with a renewal key | everyone (renewal: phone roles) | Built in the API |
| Decide the route, overriding the AI's suggestion with a reason | mobiliser | Built |
| Start a session, capture evidence, score, sign | assessor | Built |
| Re-score a sampled clip blind | master_assessor | Built |
| Review a flag (a note, never a clear) | agency | Built |
| Approve or return a recommendation; export to SIDH | awarding_body | Built |
| Suggest a QP match; store server check results | system | Built |
| Create and suspend organisations; invite each organisation's first admin | platform_admin | *Contracts* |
| Invite, deactivate, reactivate, unlock and reset the PIN of their own staff | agency_admin, tp_admin, ab_admin; platform_admin for admins and NCVET accounts | Built in the API (IT-08), each with a reason code and the PIN, recorded in the hash-chained admin log (IT-10) |
| Revoke a lost or retired phone | Each org admin for their own phones; platform_admin anywhere | Built in the API (IT-08, IT-09) |
| Upload a trade-pack version | platform_admin | *Contracts* |
| Release a trade-pack version for its QPs (never one they uploaded) | ab_admin | *Contracts* |
| Accredit an assessor for a QP | ab_admin | *Contracts* |
| Manage venues and their geofence | tp_admin | *Contracts* |

*Contracts* means the action is in `ADMIN_ACTION_TYPES` and `AUTHORITY`, but no endpoint performs it yet. The organisation, ownership and two-person checks come with each endpoint.

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

Phones sync days later, so admin actions must not destroy offline work. **Built** (IT-09):

- A **deactivated** account or a **retired** phone drains: recorded work still syncs and is flagged `drained_work` for review, and nothing new starts. A deactivated account's token works only for sync (push, pull and clip uploads), and its phones keep renewing with their renewal keys; it can't sign in. A session started after the cut-off, by the phone's clock, is stored, flagged and blocked at approval (`started_after_deactivation`).
- A draining account is read as **closed** 30 days after the last sync from its phones, or at once if it has none (no scheduler). A closed account's number can be invited again, as a new account.
- A phone reported **lost** is refused on every push after the report, whatever its events' times say (the phone's clock can't be trusted once someone else holds it), its renewal keys stop working, and it can't be registered again. The sessions affected are listed for re-assessment (with the admin panel).
- An organisation that is suspended can't sign in or make any request.
- Checks that depend on other phones (worker synced, consent, accreditation) run at approval time, so the order phones sync in never matters. This already applies to the worker: approval waits with the blocker `worker_unknown`.

## Plan

| When | What |
|---|---|
| Before G1 (25 Oct) | **Built** in contracts 1.0.0-draft.5: admin roles, organisation kinds, the organisation id in the session user and the token, admin actions, grant rules, scope levels, error codes, and the unit half of IT-04. Still to do: confirm with CSDCI where master assessors belong. |
| Sprint 1 | **Built:** organisations, fixed accounts, the bootstrap command, and the seed with two agencies, a training partner, CSDCI and NCVET, with two admins each. Still to do: personal data outside the hash chain (ADR 011). |
| Sprint 2 | **Built:** account status and token version checked on every request; draining and lost phones on sync (IT-09). Still to do: scoping on every endpoint (IT-05), SIDH exports recorded. |
| Sprint 3–4 | People, Devices and Audit log screens. Sign-in limits and lockout. Device revocation with draining. Invites. Trade-pack upload and release. Venues and accreditation, seeded. |
| Sprint 5 | Accreditation and venue screens if time; read-only settings; NCVET governance log. |
| After SIH | Agency empanelment, batches, editable settings, data-rights requests and erasure, break-glass access. |

## To confirm

- Where master assessors sit (awarding body recommended): CSDCI or the mentor, by 22 Oct.
- Blocking workers under 18 in the pilot, and one active account per phone number: recommended, decided with the contracts PR unless the team objects.
- Who the data fiduciary is, and the consent notice text: before the first real recording.
