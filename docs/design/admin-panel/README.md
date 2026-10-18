# Admin panel

The admin panel lets each organisation in the pilot manage its own people and phones, and lets the HunarPramaan team set up organisations. Admins never score, sign, approve or edit a record (rule 1, [ADR 010](../../adr/010-organisations-admin-roles-access-control.md)).

| Document | What it answers |
|---|---|
| [prd.md](prd.md) | Why we need it, for whom, what's in each phase, product rules, metrics, risks and open questions |
| [trd.md](trd.md) | How it's built: data model, contracts, API, enforcement, effects on sync, web structure, security, tests and build order |
| [app-flow.md](app-flow.md) | Every screen, the confirmation dialog, the flows step by step, states, and the words on screen in English and Hindi |
| [requirements.md](requirements.md) | FR-19 to FR-39 and NFR-10 to NFR-16, with priorities, acceptance criteria and traceability to tests |

**Status (18 Oct 2026):** draft for team review. Nothing in this folder is built yet. The groundwork (admin roles, invites, the admin log, lockout) is on the auth branches, `feat/contracts-admin-roles` to `feat/web-auth`, which aren't merged.

**Decided on 18 Oct 2026:**

- Phase 1 for G2 is People, Devices and Audit log.
- It is built on real organisations.
- Master assessors sit with the awarding body.

**Still open:** the questions in [PRD section 13](prd.md#13-open-questions), and the decisions in [TRD section 12](trd.md#12-decisions), which become ADR 013 once the team accepts them.

The wider access design stays in [access-control.md](../access-control.md). The staff side of invites and sign-in is in `docs/design/workflows.md`, on the `docs/workflows-voice-sign-in` branch.
