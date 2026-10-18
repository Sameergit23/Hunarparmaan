# Admin panel: product requirements (PRD)

- **Status:** Draft for team review, 18 Oct 2026
- **Owner:** Backend lead (API), Web developer (screens), Domain lead (product owner)
- **Requirements:** FR-19 to FR-39, NFR-10 to NFR-16 in [requirements.md](requirements.md)
- **Related:** [ADR 006](../../adr/006-ai-output-is-a-suggestion.md), [ADR 010](../../adr/010-organisations-admin-roles-access-control.md), [ADR 011](../../adr/011-personal-data-outside-the-hash-chain.md), [access-control.md](../access-control.md), [TRD](trd.md), [app flow](app-flow.md)

## 1. Summary

The admin panel lets each organisation in an RPL pilot manage its own people and phones, and lets the HunarPramaan team set up those organisations. It never touches an assessment decision. Admins invite staff, shut off leavers, unlock locked accounts and revoke lost phones, and every one of those actions is recorded in a hash-chained log that anyone with access can verify.

For the SIH demo (G2, 29 Nov) we commit to three screens: **People**, **Devices** and **Audit log**, built on real organisations. Trade packs, accreditation, venues, organisation management and settings are later phases.

## 2. Problem

Today every account comes from the seed (`pnpm db:seed`). There is no way to:

- add a new assessor or mobiliser without a developer;
- stop someone who has left an agency from signing in;
- deal with a lost or stolen phone that may still hold unsynced evidence;
- unlock a staff member who typed the wrong PIN five times on test day;
- show an inspector who changed what, and prove the record wasn't edited.

Real RPL involves five kinds of organisation. NCVET regulates; it recognises awarding bodies and assessment agencies and can suspend that recognition ([NCVET, recognition of AB and AA](https://ncvet.gov.in/?p=559)). The awarding body (CSDCI for our trade) owns the QPs, certifies assessors and approves results. Assessment agencies employ assessors. Training partners register workers. Each needs to run its own staff without seeing the others' data. The CAG's 2025 audit of PMKVY found weak identity controls (README "Why this exists"), so who holds an account, and who gave it to them, is part of what makes a certificate trustworthy.

## 3. Goals and non-goals

### Goals for G2

| # | Goal | Measured by |
|---|---|---|
| G-1 | An organisation onboards its own staff without the HunarPramaan team | Invite to first sign-in in under 3 minutes in the demo |
| G-2 | A leaver or a lost phone is shut off in minutes, and offline work is never destroyed by accident | Revoke a phone in under 2 minutes; IT-09 passes |
| G-3 | Every admin action can be proved | 100% of admin writes in the admin log; the chain verifies; IT-10 passes |
| G-4 | Organisations are kept apart | IT-05 passes: two seeded agencies cannot see each other's people, phones or sessions |
| G-5 | Admins never decide | IT-04 passes: no admin token can route, score, sign, re-score, review a flag, approve or export |

### Non-goals

- Admins never edit or delete records: scores, evidence, flags, approvals, audit entries or admin events (rule 4).
- No admin can clear a flag or a blocker. The only way forward is new evidence and a new signed recommendation.
- No editable settings, so no one can weaken integrity: no auto-approve, no AI scoring, no re-score rate below 10%.
- No agency empanelment, training batches, data-rights requests or break-glass access before SIH ends (ADR 010).
- No real SMS, SIDH or eKYC integration (mocked behind `MOCK_INTEGRATIONS`).
- No admin features on the phone app. Admins use the web, which also works at phone width.

## 4. Users

| Persona | Role | Organisation | What they need most | How often |
|---|---|---|---|---|
| **Operator** | `platform_admin` | HunarPramaan team (operator) | Set up organisations and their first admins; see the whole admin log; never see case data | At setup, then rarely |
| **RPL centre manager** | `tp_admin` | Training partner | Invite and remove mobilisers; handle a mobiliser's lost phone | Weekly |
| **Agency operations head** | `agency_admin` | Assessment agency | Onboard assessors quickly before a test drive; see whose phone hasn't synced; unlock an assessor at 7 am on test day; revoke a lost phone | Daily during drives |
| **Certification desk** | `ab_admin` | Awarding body (CSDCI) | Invite approvers and master assessors; later, accredit assessors and release trade packs | Weekly |
| **Regulator** | `ncvet` | NCVET | See that governance is happening, without seeing people's data | Monthly |
| **Staff member** | Any staff role | Any | Get an invite code, set a PIN, get unlocked or reset fast | Once, then rarely |

Workers have no admin. A mobiliser registers them, and the training partner's admin manages mobilisers, not workers.

Master assessors sit with the awarding body (team decision, 18 Oct 2026; ADR 010 point 5). Tell CSDCI and the mentor; if they disagree, the contracts tables change in one place.

## 5. What we learned

### From our own design and code

| Finding | Source | What it means for the panel |
|---|---|---|
| Who may do what is one table, `AUTHORITY`, and reads are `READ_ACCESS` | `packages/contracts/src/authority.ts` | Admin actions and admin read scopes go in the same tables. Handlers never compare roles |
| Admin roles, organisation kinds, grant rules and scope levels exist | `feat/contracts-admin-roles` (in review) | The panel builds on `ADMIN_ACTION_TYPES`, `GRANTABLE_ROLES`, `ROLES_BY_ORG_KIND` and `SCOPE_BY_ROLE` |
| Invites, the hash-chained admin log, lockout, token versions and renewal keys exist in the API | `feat/api-staff-invites`, `feat/api-auth-signin` (in review) | People and Devices mostly need read models, three or four new actions and the screens |
| Every account sits in one fixed pilot organisation | `services/api/src/domain/organisations.ts` (in review) | Real organisations are a prerequisite (team decision, 18 Oct 2026) |
| Phones sync days late; deactivating an account must not throw away offline work | ADR 010 point 8; `docs/design/workflows.md` section 10, on the `docs/workflows-voice-sign-in` branch | "Draining": recorded work still syncs and is flagged; only a lost phone is refused |
| Personal data in the hash chain can't be erased | ADR 011 | The admin log holds ids and reason codes only, never names or numbers |

### From the RPL system around us

| Finding | Source | What it means for the panel |
|---|---|---|
| NCVET recognises awarding bodies (standard and dual) and assessment agencies, and can suspend or cancel recognition | [NCVET](https://ncvet.gov.in/?p=559), [NCVET on assessment agencies](https://ncvet.gov.in/?p=2114) | Organisations carry a status, and the platform admin can suspend one (phase 2). A suspended organisation's accounts can't sign in |
| An agency may assess only in its allocated sector | [NCVET on assessment agencies](https://ncvet.gov.in/?p=2114) | Later: accreditation ties an assessor to the QPs they may assess |
| Assessors are certified by a recognised awarding body after training (ToA) | [NCVET ToA guidelines](https://nationalskillsnetwork.in/ncvet-unveils-guidelines-for-training-of-assessors-toa) | Accreditation belongs to `ab_admin`, never the agency (separation of duties) |
| SIDH gives each assessor one ID, linked to one Aadhaar | [NSDC trainer and assessor FAQ](https://stag-api.nsdcindia.org/system/files/2026-07/Trainer_Assessor%20FAQ%20English.pdf) | Later: store the SIDH assessor ID as a reference on accreditation (mocked), never the Aadhaar number |

### From law and security practice

| Finding | Source | What it means for the panel |
|---|---|---|
| DPDP Rule 6 asks for access controls, logging and monitoring, and logs kept for at least a year; it applies from 13 May 2027 | [DPDP Rules 2025 summary](https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/), [Rule 6 text](https://dpdp.myndsolution.com/wiki/rules/rule-6-reasonable-security-safeguards/) | Keep the admin log and sign-in log for at least a year, hosted in India. Masked phone numbers in admin lists |
| CERT-In directions: keep system logs 180 days in India; report incidents within 6 hours | [CERT-In directions summary](https://psalegal.com/new-cert-in-directions-overview-and-implications/) | Satisfied by the 1-year retention; the lost-phone flow feeds incident reporting |
| Admin interfaces need stronger authentication and segregation of duties | [OWASP ASVS 4.3](https://owasp-aasvs4.readthedocs.io/en/latest/V4.3.html) | The PIN again before every admin write (step-up), and admins who never decide |

The legal summaries above are secondary sources. Check the Gazette text (G.S.R. 846(E), 13 Nov 2025) and the CERT-In directions of 28 Apr 2022 before relying on them.

## 6. Scope

### Phase 1: for G2 (Must and Should)

| Area | What's included |
|---|---|
| Organisations (no screen yet) | Real `organisations` and `qp_owners` tables. The pilot is seeded: the operator, CSDCI, two assessment agencies, one training partner and NCVET, with two admins in each organisation that has an admin role. A command-line bootstrap creates the first platform admin |
| Admin sign-in | Admin roles sign in on the web with the code and PIN, and land on People. Every other role is kept out of `/admin` |
| People | List the organisation's accounts with masked phones, role, status, last sign-in and last sync. Invite, deactivate, reactivate, unlock and reset a PIN, each with a reason code and the PIN again |
| Devices | List the organisation's phones with owner, status, last sync and clips waiting. Revoke a phone as lost, retired or replaced. A lost phone lists the sessions that need re-assessment |
| Audit log | Every admin action in the organisation (the platform admin sees all), with a "Verify chain" button. NCVET sees governance entries only |
| Rules | Separation of duties (section 8), enforced in the API and proved by tests |

### Phase 2: after G2, if time (Could)

| Area | What's included |
|---|---|
| Organisations | Create and suspend organisations (platform admin) |
| Trade packs | Upload (platform admin); release by a different person (`ab_admin`) |
| Accreditation | Grant and revoke an assessor for a QP (`ab_admin`), with the SIDH assessor ID as a reference; checked live at approval |
| Venues | Name, place and geofence radius (`tp_admin`) |
| Settings | Read-only view of effective values and their floors |
| Extras | Change a staff member's mobile number; export the audit log for an inspection |

### Phase 3: after SIH (Won't, this round)

Agency empanelment, training batches, editable settings, data-rights requests and erasure screens, break-glass access, real SMS.

## 7. User stories

Each story is detailed with acceptance criteria in [requirements.md](requirements.md).

| ID | As a | I want to | So that | Requirement |
|---|---|---|---|---|
| US-A1 | Operator | Create the first platform admin from the command line, with a reason | The system has an accountable first admin and no default password | FR-19 |
| US-A2 | Operator | Invite the first admin of each organisation | Each organisation runs its own staff | FR-22 |
| US-A3 | Agency admin | Invite an assessor and hand them a one-time code | They can set a PIN and bind their phone | FR-22 |
| US-A4 | Agency admin | See all my agency's accounts, with status and last sync | I know who is active and whose phone is behind | FR-21 |
| US-A5 | Agency admin | Deactivate an assessor who left, with a reason | They can't start new work, and what they recorded offline still arrives | FR-23 |
| US-A6 | Agency admin | Unlock an assessor locked out on test day, after checking who they are | The test goes ahead | FR-25 |
| US-A7 | Agency admin | Give a staff member a one-time PIN reset code | They set a new PIN without me ever seeing it | FR-26 |
| US-A8 | Agency admin | Mark a phone lost | It can't send anything more, and the agency knows which sessions to re-assess | FR-28 |
| US-A9 | Training-partner admin | Retire a mobiliser's old phone when they get a new one | Its unsynced registrations still arrive | FR-28 |
| US-A10 | Any admin | See every admin action in my organisation and check the chain | I can show an inspector the record wasn't changed | FR-29 |
| US-A11 | NCVET | See that organisations are managing access | I can monitor governance without seeing anyone's data | FR-32 |
| US-A12 | Any admin | Be asked for my PIN before an admin action | Someone at my unlocked computer can't act as me | FR-30 |
| US-A13 | Awarding-body admin | Invite approvers and master assessors | CSDCI runs its own approvals and blind re-scoring | FR-22 |

## 8. Product rules

These come from ADR 010 and `docs/design/access-control.md`. The API enforces every one; the screens only hide what would fail.

1. **Admins manage people, organisations and phones. They never score, sign, approve, re-score, review a flag, export to SIDH or edit a record.** Nobody who decides can administer.
2. **One account, one organisation, one role, for good.** A move means deactivating the account and inviting a new one.
3. **Admins act only inside their own organisation.** The platform admin acts across organisations, but only on admins and NCVET accounts, and never sees case data.
4. **Grants follow the table.** `tp_admin` grants mobilisers and training-partner admins; `agency_admin` grants agency users, assessors and agency admins; `ab_admin` grants approvers, master assessors and awarding-body admins; the platform admin grants organisation admins and NCVET accounts. Nobody grants `worker`.
5. **Nobody acts on their own account**, and nobody deactivates their organisation's last active admin.
6. **A deactivation is lifted only by whoever issued it, or by the platform admin.**
7. **Every admin write asks for the admin's PIN again**, and a wrong PIN counts towards their own lockout.
8. **Every admin write is recorded in the admin log in the same transaction**, with a reason code, never free text.
9. **Deactivated accounts and retired phones drain.** Work recorded before the cut-off still syncs and is flagged for review. Nothing new can start. Only a phone reported lost is refused.
10. **Admins never see a PIN, an SMS code or a token.** Invite and reset codes are shown once, to the admin who created them.
11. **Phone numbers are masked** in every admin list, for example `XXXXXX3210`.

## 9. Experience principles

- **Wire code** ([wire-code.md](../wire-code.md)): admin actions are a person's decisions, so they are black. There are no AI hints on admin screens, except an outlier note from the statistics in phase 2, which stays yellow.
- **English first**, every string also in Hindi (rule 7).
- **Destructive actions** (deactivate, revoke) are a secondary button with a confirmation, a required reason and the PIN. Never a red button: red is only for errors.
- **Status chips** pair an icon with a word: "Active", "Invited", "Locked", "Draining", "Closed", "Lost".
- **Plain words.** "Deactivate" rather than "Disable user"; "Mark as lost" rather than "Revoke credential".
- **Works at phone width**, because agency heads often work from a phone.
- **No dead ends.** Every refusal says why, and what to do instead. For example: "You can't deactivate the last admin. Invite another admin first."

## 10. Success metrics

| Metric | Target | How we check |
|---|---|---|
| Invite to first sign-in | Under 3 minutes | Timed in the demo drill |
| Time to mark a phone lost | Under 2 minutes from opening the panel | Timed in the demo drill |
| Admin writes in the admin log | 100% | IT-10 and a check that every admin route appends an entry |
| Admin chain verifies | Always, until someone tampers | The "Verify chain" button; IT-10 edits a row and expects a failure |
| Organisations kept apart | 0 cross-organisation reads | IT-05 |
| Admins never decide | 0 decisions by an admin token | IT-04 |
| Usability | SUS of 68 or more with 3 people acting as admins (the mentor and two team members) | S4 usability test |

## 11. Dependencies

| Dependency | Status | Needed for |
|---|---|---|
| Auth stack merged: `feat/contracts-admin-roles`, `feat/api-auth-signin`, `feat/api-staff-invites`, `feat/web-auth` | Pushed, no PRs yet | Everything |
| Real organisations, replacing `PILOT_ORGANISATION_ID` | To build in S1 | Scoping, the seed, IT-05 |
| Scoping on every read model (IT-05) | Planned S2 | Kept-apart organisations |
| ADR 011: personal data outside the hash chain | Decision pending | Not blocking; masking and reason codes don't depend on it |
| Contracts version | v1 freezes 25 Oct | The admin read scopes and request shapes are additive, so they can land as v1.x after the freeze |

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The panel crowds out Must-have assessment work before G2 | Medium | High | Commit to the core three only; phase 2 is "if time" |
| An admin abuses their role, for example by inviting a fake assessor | Low | High | Admins can't decide; every action is logged with a reason; two admins per organisation; accreditation (phase 2) by the awarding body only |
| A phone marked lost by mistake blocks real evidence | Low | Medium | The confirmation spells out the effect; the evidence stays on the phone, encrypted; the agency re-assesses |
| Deactivating an assessor mid-drive loses their offline work | Medium | High | Draining, not deletion; the confirmation shows how many items are waiting to sync |
| Demo-mode SMS (`123456`) makes invites look insecure to judges | Medium | Low | Invite codes are separate from SMS codes and shown once to the admin (ADR 010 point 12) |
| Contract churn around the v1 freeze | Medium | Medium | Merge the auth stack before 25 Oct; admin read scopes are additive |

## 13. Open questions

| # | Question | Recommendation | Decide by |
|---|---|---|---|
| 1 | When does a draining account become closed? | Automatically after 30 days with no sync from any of its phones, or straight away if it has no phones. This matches the renewal-key limit | S2 |
| 2 | Is a lost phone refused for everything after the report, or only for events after the time it was lost? | Everything after the report. The phone's clock can't be trusted once it is in someone else's hands | S2 |
| 3 | Should an admin be told when an invite is accepted? | Yes, in the audit log and as "Active" on People; no SMS | S3 |
| 4 | Should a new-phone sign-in send an SMS alert (workflows.md rule 15)? | Yes, mocked; it helps catch SIM swaps | S4 |
| 5 | Can an admin change a staff member's mobile number? | Phase 2, with SMS confirmation of the new number and a new admin action | After G2 |
| 6 | Can a dual awarding body hold its own assessors? | Not in the pilot: CSDCI is treated as a standard awarding body. Revisit if a dual body joins | After SIH |
| 7 | How long are the admin log and sign-in log kept? | At least one year (DPDP Rule 6), in India, and for as long as any certificate they relate to is valid | Before the first real pilot |
| 8 | Should inviting a number that already has an account elsewhere say so? | No. Show "This number can't be invited. Ask the person to contact their current organisation", so nobody can probe which numbers have accounts | S3 |

## 14. Release plan

| Sprint | Work |
|---|---|
| Before G1 (by 25 Oct) | Merge the auth stack. Contracts v1 includes the admin roles and actions |
| S1 (26 Oct to 1 Nov) | Organisations and `qp_owners`; the bootstrap command; the seed with real organisations and two admins each |
| S2 (2 to 8 Nov) | Scoping on every read model (IT-05); account status and token version checked on every request; draining on sync |
| S3 (9 to 15 Nov) | People, Devices and Audit log screens; admin sign-in; step-up PIN; deactivate, unlock and revoke; IT-08, IT-09, IT-10 |
| S4 (16 to 22 Nov) | Reactivate, PIN reset, NCVET governance view; the usability test; polish |
| S5 (23 to 29 Nov) | G2: the admin drill in the demo script. Phase 2 items only if every Must is done |
