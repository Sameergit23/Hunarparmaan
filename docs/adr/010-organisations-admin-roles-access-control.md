# 010. Organisations, admin roles and access control

- **Status:** Accepted (design). Built in Sprints 1–4; see [`docs/design/access-control.md`](../design/access-control.md).
- **Date:** 2026-10-18
- **Requirements:** FR-05, FR-11, FR-12, FR-13, FR-17, NFR-04, NFR-05; rules 1, 3, 4 and 8 in `CLAUDE.md`

## Context

Sprint 0 has seven roles and checks every write against `AUTHORITY` and every read against
`READ_ACCESS` (ADR 006). But it has no notion of organisations, so every agency user sees every
session, although the README promises that agencies see only their own centres. There is no admin
role, no way to deactivate an account or revoke a lost phone, and no record of admin actions.

Real RPL involves several organisations: NCVET regulates, the awarding body (CSDCI) owns the QPs
and approves results, assessment agencies employ assessors, and training partners register
workers. A design review from three angles (governance, operations, security), with an adversarial
critique, produced this decision.

## Decision

**Admins manage people, organisations and phones. They never score, sign, approve, review a flag
or edit a record.**

1. **Organisations are the boundary.** Five kinds: operator (the HunarPramaan team), training
   partner, assessment agency, awarding body and regulator.
2. **One account, one organisation, one role, for good.** Neither ever changes; a move means
   deactivating the account and creating a new one. Sync already requires an event's actor role to
   match the account's role, so a change in place would orphan a phone's unsynced events. One
   active account per phone number.
3. **Four admin roles:** `platform_admin` (operator), `tp_admin` (training partner),
   `agency_admin` (assessment agency) and `ab_admin` (awarding body). They hold only new admin
   actions (`ADMIN_ACTION_TYPES`). A unit test and integration test IT-04 prove that no admin role
   holds a decision and no deciding role holds an admin action.
4. **Who may hold which role** is a table in contracts (`ROLES_BY_ORG_KIND`), and who may grant
   which role is another (`GRANTABLE_ROLES`). A training partner can never hold assessors, so the
   organisation that registers a worker never assesses them.
5. **Master assessors belong to the awarding body** and blind re-score across all agencies for its
   QPs. To be confirmed with CSDCI or the mentor by 22 Oct; if masters are agency staff, they stay
   with the agency and are barred from their own agency's sessions.
6. **Scope is derived on the server**, never trusted from the phone. `SCOPE_BY_ROLE` gives each
   role a level: own work, own organisation, QPs the awarding body owns, aggregates (NCVET), or
   governance metadata (platform admin, no case data). Every read model takes the scope as a
   required parameter; a record outside it returns 404.
7. **Each QP's owner is a fixed record** (`qp_owners`), never read from pack content, and is copied
   onto each session. Uploading a pack cannot move approval rights.
8. **Accounts are checked on every request:** status and a token version. A deactivated account,
   or a phone retired or replaced, enters a **draining** state: work already recorded offline can
   still sync and is flagged for review, but nothing new starts. Only a phone reported lost is
   refused.
9. **Trust checks run live at approval** (worker synced, consent, accreditation, lost phone), like
   the evidence checks, so they never depend on which phone synced first.
10. **Admin actions are recorded** in `admin_events`, append-only and hash-chained with
    `@hunarpramaan/audit`, using reason codes rather than free text. Sign-ins go to an append-only
    `auth_events` log.
11. **Sign-in hardening:** per-phone and per-IP limits on codes, an account lockout capped at one
    hour, PIN step-up for approvals and admin actions, and two admins in every organisation used in
    the demo. The first platform admin is created by a command-line bootstrap that records a reason.
12. **Invites and PIN resets** use a one-time code shown to the inviting admin, never the mocked SMS
    code, which is always `123456` in demo mode.

## Consequences

- A contracts change before G1 (25 Oct): the admin roles, organisation id in the session user and
  the token, admin actions, grant rules and error codes.
- Every existing read model and the ownership checks on writes change in Sprint 2, with an
  integration test (IT-05) proving that two seeded agencies cannot see each other's data.
- New tables: `organisations`, `qp_owners`, `admin_events`, `auth_events`, and columns on `users`
  (organisation, status, token version, lockout).
- Admin screens for the demo: People, Devices and Audit log. Organisations, venues and
  accreditations are seeded first.
- Deferred until after SIH: agency empanelment, batches, editable settings, data-rights requests,
  break-glass access.
