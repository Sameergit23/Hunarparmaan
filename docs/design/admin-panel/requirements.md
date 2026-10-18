# Admin panel: requirements

- **Status:** Draft for team review, 18 Oct 2026. These extend the README's requirements baseline v1 (FR-01 to FR-18, NFR-01 to NFR-09)
- **Priority:** MoSCoW. Must and Should are phase 1, for G2 (29 Nov). Could is phase 2, if time. Won't is after SIH
- **Related:** [PRD](prd.md), [TRD](trd.md), [app flow](app-flow.md)

## 1. Functional requirements

| ID | Requirement | Priority | Phase | Story |
|---|---|---|---|---|
| FR-19 | Every account belongs to exactly one organisation of one of five kinds (operator, training partner, assessment agency, awarding body, regulator), with a role that kind may hold. A command-line bootstrap creates the first platform admin's invite, with a reason | Must | 1 | US-A1 |
| FR-20 | Admin roles sign in on the web with the SMS code and PIN and land in the admin area. Other roles can't open it, and admin roles can't open the office or phone screens | Must | 1 | US-A3 |
| FR-21 | An admin sees their own organisation's accounts and pending invites, with masked number, role, status, last sign-in and last sync, filtered by role and status and searchable. The platform admin sees every organisation's admin and NCVET accounts | Must | 1 | US-A4 |
| FR-22 | An admin invites a person into their organisation with a role from `GRANTABLE_ROLES`. The system shows an 8-digit, single-use code to the admin once, valid for 72 hours; inviting the same number again replaces it | Must | 1 | US-A2, US-A3, US-A13 |
| FR-23 | An admin deactivates an account with a reason code. The account drains: every sign-in ends at once, new work can't start, and work recorded before the cut-off still syncs and is flagged for review. It closes 30 days after its last sync | Must | 1 | US-A5 |
| FR-24 | The admin who deactivated an account, or the platform admin, reactivates it while it is draining, with a reason code | Should | 1 | US-A5 |
| FR-25 | An admin unlocks a locked account in their organisation, with a reason code that records how they checked identity | Must | 1 | US-A6 |
| FR-26 | An admin issues a one-time PIN reset code, valid 24 hours and shown once. It ends every sign-in the person has; the person sets a new PIN with the SMS code and the reset code | Should | 1 | US-A7 |
| FR-27 | An admin sees their organisation's phones, with owner, status, registered date, last sync and clips waiting, filtered by status and by "not synced for 3 days" | Must | 1 | US-A8 |
| FR-28 | An admin marks a phone lost, retired or replaced, with a reason code. A lost phone is refused on every later sync and its renewal keys stop working, and its page lists the sessions to re-assess. A retired or replaced phone drains as in FR-23 | Must | 1 | US-A8, US-A9 |
| FR-29 | An admin sees every admin action in their organisation (the platform admin, in every organisation), with who, what, whom, when and the reason, and can verify the admin log's hash chain | Must | 1 | US-A10 |
| FR-30 | Every admin write asks for the admin's PIN again. A wrong PIN is refused and counts towards the admin's own lockout | Must | 1 | US-A12 |
| FR-31 | The API enforces the separation-of-duties rules: no action on one's own account or phone; never deactivate an organisation's last active admin; grants only from `GRANTABLE_ROLES` and only roles the organisation kind may hold; admins hold no decision and deciders hold no admin action | Must | 1 | All |
| FR-32 | NCVET sees a governance view of the admin log: counts by organisation kind and action, and the chain check, with no person's name or number | Should | 1 | US-A11 |
| FR-33 | The platform admin creates organisations and suspends or restores them, with a reason. A suspended organisation's accounts can't sign in | Could | 2 | |
| FR-34 | The platform admin uploads a trade-pack version, validated as `pnpm pack:build` does, and a different person, an `ab_admin` of the QP's owner, releases it | Could | 2 | |
| FR-35 | An `ab_admin` grants and revokes an assessor's accreditation for a QP, recording the SIDH assessor ID as a reference. Approval is blocked for a session whose assessor wasn't accredited for its QP when it started | Could | 2 | |
| FR-36 | A `tp_admin` manages venues: name, place and geofence radius, at least 50 m | Could | 2 | |
| FR-37 | Every admin sees the effective settings and their floors, read-only | Could | 2 | |
| FR-38 | An admin changes a staff member's mobile number, confirmed by an SMS code to the new number | Could | 2 | |
| FR-39 | An admin exports their organisation's admin log as CSV for an inspection, with its chain-check result | Could | 2 | |
| | Agency empanelment, training batches, editable settings, data-rights requests, break-glass access | Won't | 3 | |

## 2. Non-functional requirements

| ID | Quality | Target |
|---|---|---|
| NFR-10 | Security | Every admin write needs the PIN again. A deactivation or PIN reset ends the account's sign-ins on its next request. An admin's reads and writes reach only their scope, and anything outside it answers "not found" |
| NFR-11 | Privacy | Admin responses carry masked numbers only (`XXXXXX` and the last 4 digits), including to the platform admin. The platform admin sees no case data. The admin log holds ids and reason codes, never names, numbers or free text |
| NFR-12 | Auditability | Every admin write appends exactly one admin-log entry in the same transaction. The log is append-only and hash-chained, and kept at least one year, hosted in India (DPDP Rule 6; CERT-In 180 days) |
| NFR-13 | Usability | Invite, deactivate, unlock and mark-as-lost each take at most 3 screens and under 2 minutes. SUS of 68 or more with 3 test admins. English first, every string in Hindi too (rule 7) |
| NFR-14 | Performance | Lists of 1,000 accounts or phones answer in under 500 ms at the API, and under 2 seconds end to end on 4G. Pages of 50 rows |
| NFR-15 | Offline safety | No admin action destroys work recorded offline, except marking a phone lost, and that one says so before it's confirmed |
| NFR-16 | Accessibility | WCAG 2.1 AA: 48 px touch targets, a visible focus ring, keyboard use for every action including the dialog, and no sideways scroll at 375 px (Wire code) |

## 3. Acceptance criteria

Given, When, Then, as the README's Definition of Ready asks.

### FR-19 Organisations and bootstrap

- **Given** an empty database, **when** the operator runs `admin:bootstrap` with a name, number and reason, **then** the operator organisation exists, a `platform_admin` invite exists, its code is printed once, and the admin log has one `account.invited` entry with reason `bootstrap`.
- **Given** an active platform admin exists, **when** the bootstrap runs without `--additional`, **then** it refuses and changes nothing.
- **Given** a `training_partner` organisation, **when** anyone tries to give an account in it the role `assessor`, **then** it is refused with `role_not_in_org`.

### FR-20 Admin sign-in

- **Given** an `agency_admin` account, **when** they sign in at `/login`, **then** they land on `/admin/people`.
- **Given** an `agency` account, **when** they open `/admin/people`, **then** they see "This page is not for your account", and the API refuses the data.
- **Given** an `agency_admin` token, **when** it calls `GET /v1/sessions`, **then** the API answers 403.

### FR-21 People list

- **Given** two agencies with accounts each, **when** the first agency's admin opens People, **then** only the first agency's accounts and invites appear, and every number is masked.
- **Given** a locked account, **when** the admin opens People, **then** its row shows "Locked" with the lock icon and the time it unlocks.

### FR-22 Invite

- **Given** an `agency_admin`, **when** they invite a number as `assessor` with a reason and their PIN, **then** an 8-digit code appears once, the invite shows as Pending, and the admin log has an `account.invited` entry.
- **Given** an `agency_admin`, **when** they try to invite an `awarding_body` user, **then** it is refused with `role_not_grantable`, and nothing is logged.
- **Given** a pending invite for a number, **when** the admin invites the same number again, **then** the old code stops working and the old invite shows as Replaced.
- **Given** a number that already has an account in another organisation, **when** an admin invites it, **then** they see the neutral "This number can't be invited" message, which never names the other organisation.

### FR-23 Deactivate

- **Given** an active assessor with a signed-in browser and 3 unsynced items on their phone, **when** their admin deactivates them with a reason and PIN, **then** the status becomes Draining, the browser's next request is refused, and the dialog mentioned the 3 items before confirming.
- **Given** a draining assessor, **when** their phone pushes events recorded before the cut-off, **then** the events are stored, each with a `drained_work` flag, and nothing blocks approval because of them.
- **Given** a draining assessor, **when** their phone pushes a `session.started` received after the cut-off, **then** it is stored and flagged, and approval of that session is blocked with `started_after_deactivation`.
- **Given** an organisation with one active admin, **when** that admin's account is the target, **then** the deactivation is refused with `last_admin`.
- **Given** a draining account with no sync for 30 days, **when** anyone reads it, **then** its status is Closed.

### FR-24 Reactivate

- **Given** an account deactivated by admin A, **when** admin B of the same organisation tries to reactivate it, **then** it is refused with `not_issuer`; **when** admin A or the platform admin does, **then** it becomes Active.

### FR-25 Unlock

- **Given** an account locked after 5 wrong PINs, **when** its admin unlocks it with the reason "identity checked by phone" and their PIN, **then** the person can sign in at once, and the admin log records the reason.

### FR-26 PIN reset

- **Given** an active assessor, **when** their admin resets the PIN, **then** a 24-hour code appears once, every sign-in the assessor has ends, and the assessor can set a new PIN with the SMS code and the reset code.
- **Given** a reset code, **when** it is used a second time, or after 24 hours, **then** it is refused with `invite_invalid`.

### FR-27 Phones list

- **Given** a phone that last synced 4 days ago, **when** the admin filters by "Not synced for 3 days or more", **then** it appears, with its last sync and clips waiting.

### FR-28 Revoke a phone

- **Given** an assessor's phone, **when** their admin marks it lost with a reason and PIN, **then** its next push is refused with `device_lost`, its renewal keys stop working, and its page lists every session started on it with no signed result or with clips waiting.
- **Given** a phone marked retired, **when** it pushes, **then** the push is accepted and each event is flagged `drained_work`.
- **Given** an admin, **when** they try to revoke their own phone, **then** it is refused with `self_action`.

### FR-29 Audit log

- **Given** a series of admin actions, **when** the admin opens the Audit log, **then** each action appears once with who, what, whom, when and the reason, newest first.
- **Given** an untouched log, **when** the admin presses "Verify chain", **then** it says "Verified" with the number of entries; **given** one entry edited in the database, **then** it says the chain breaks at that entry.

### FR-30 PIN on every admin write

- **Given** any admin write, **when** the PIN is missing or wrong, **then** nothing changes, nothing is logged, and the answer is `step_up_required`.
- **Given** an admin, **when** they enter a wrong PIN 5 times in admin dialogs, **then** their own account locks like any other.

### FR-31 Separation of duties

- **Given** any admin token, **when** it tries to decide a route, score, sign, re-score, review a flag, approve or export to SIDH, **then** it is refused (IT-04).
- **Given** any token of a deciding role, **when** it calls any admin write, **then** it is refused.

### FR-32 Governance view

- **Given** an NCVET account, **when** it opens `/governance`, **then** it sees counts by organisation kind and action and the chain check, and no response contains a name or a number.

## 4. Traceability

| Requirement | Screen or flow ([app flow](app-flow.md)) | API ([TRD](trd.md) section 5) | Test |
|---|---|---|---|
| FR-19 | F1 | `admin:bootstrap` | IT-08 (bootstrap cases), unit (`canHold`) |
| FR-20 | Section 1 | `/auth/login` | E2E-06 |
| FR-21 | P1 | `GET /admin/accounts`, `GET /admin/invites` | IT-05, E2E-06 |
| FR-22 | P3, F2 | `POST /admin/invites` | IT-08, E2E-06 |
| FR-23 | P2, F3 | `POST /admin/accounts/:id/deactivate` | IT-08, IT-09, E2E-06 |
| FR-24 | P2, F4 | `POST /admin/accounts/:id/reactivate` | IT-08 |
| FR-25 | P2, F5 | `POST /admin/accounts/:id/unlock` | IT-08 |
| FR-26 | P2, F6 | `POST /admin/accounts/:id/pin-reset`, `POST /auth/pin-reset/accept` | IT-08 |
| FR-27 | D1 | `GET /admin/devices` | IT-05 |
| FR-28 | D2, F7, F8 | `POST /admin/devices/:id/revoke` | IT-09 |
| FR-29 | A1, F9 | `GET /admin/log`, `GET /admin/log/verify` | IT-10, E2E-06 |
| FR-30 | Section 4 | Every admin write | IT-08 |
| FR-31 | Every flow | Every admin route | IT-04, IT-08, unit (`authority.test.ts`) |
| FR-32 | G1 | `GET /admin/log` with `governance_log.read` | IT-05 |
| NFR-10 | Section 4 | `authenticate`, step-up | IT-08 |
| NFR-11 | P1, P2 | Every admin read model | Unit (masking), IT-05 |
| NFR-12 | A1 | `appendAdminEvent` | IT-10 |
| NFR-13 | Every flow | | S4 usability test |
| NFR-14 | P1, D1 | List endpoints | A seeded load check before G2 |
| NFR-15 | F3, F7 | Sync | IT-09 |
| NFR-16 | Every screen | | E2E-07 |

## 5. Decisions recorded

| Date | Decision | By |
|---|---|---|
| 18 Oct 2026 | The PRD, TRD, app flow and requirements live in the repo, in `docs/design/admin-panel/` | Sameer Akhtar, for the team |
| 18 Oct 2026 | Phase 1 for G2 is People, Devices and Audit log. Trade packs, accreditation, venues, organisation screens and settings are phase 2 | Sameer Akhtar, for the team |
| 18 Oct 2026 | The panel is built on real organisations, not the single pilot organisation | Sameer Akhtar, for the team |
| 18 Oct 2026 | Master assessors sit with the awarding body (ADR 010 point 5). Tell CSDCI and the mentor | Sameer Akhtar, for the team |
