# CLAUDE.md

Context and rules for Claude Code in this repo. Read this first; `README.md` has the full design.

## The project

HunarPramaan ("proof of skill") is our Smart India Hackathon 2026 entry for the problem statement *AI-Assisted Skill Assessment Tool for Recognition of Prior Learning (RPL)*. The full text is in `docs/problem-statement.md`.

It certifies informally trained workers against NSQF qualification packs (QPs):

1. A worker describes their experience by voice in Hindi. AI maps it to QPs and routes the worker using the 70% coverage rule.
2. An assessor records one clip per criterion and scores 0/1/2 on anchored rubrics, with AI flags as hints.
3. A dashboard checks evidence integrity and shows that scoring is more consistent with the tool.

Pilot trade: Assistant Electrician (CSDCI, NSQF Level 3, `QG-03-CO-03951-2025-V2-CSDCI`), also mapped to Construction Electrician-LV (Level 4, `QG-04-CO-03952-2025-V2-CSDCI`).

## Status and dates

- Sprint 0 runs 19–25 Oct 2026. The pnpm workspace, CI and the four shared packages exist (`packages/contracts`, `scoring`, `audit`, `trade-packs`); `apps/` and `services/` do not yet. The layout in README "Repository layout" is the target, not the current state.
- Gates: G1 Sprint 0 exit (25 Oct) · G2 feature complete (29 Nov) · G3 demo-ready (6 Dec). The 36-hour Grand Finale is in December 2026.
- The sprint plan, requirements (FR-xx, NFR-xx) and test plan are in README "Development lifecycle (SDLC)".

## Rules that must never break

1. **AI suggests, people decide.** No AI job may write or change a score, sign a recommendation or approve a certificate. Enforce it in the API by role, and keep test IT-03 passing.
2. **Offline first.** Every worker and assessor step works with no network. Phone writes go to local SQLite (SQLCipher) plus an outbox. No screen may depend on the network without an offline path.
3. **One database writer.** Only the API and its queue worker write to PostgreSQL. The AI service is stateless: it returns results and never touches the database.
4. **Append-only.** Scores, evidence and audit entries are events with UUIDv7 ids. Never UPDATE or DELETE them; a correction is a new event.
5. **Evidence integrity.** Hash every evidence file (SHA-256) at capture and record it in the per-device hash chain (canonical JSON, RFC 8785).
6. **One scoring implementation.** Coverage, routing and result maths live only in `packages/scoring` and run the same on the phone and the server.
7. **Two languages.** Every user-facing string exists in Hindi and English.
8. **No personal data in Git or prompts.**
   - Never commit secrets, `.env`, recordings, names, phone numbers or Aadhaar numbers. Use seeded fixtures; media files are git-ignored on purpose.
   - Store only the eKYC reference, never the Aadhaar number.
   - Send only transcripts to outside AI services.
9. **Contracts change on purpose.** A change to `packages/contracts` or the trade-pack schema needs a version bump and a note in the PR.

## Stack

| Part | Tech |
|---|---|
| `apps/mobile` | React Native, Expo dev build (not Expo Go), TypeScript, expo-sqlite + SQLCipher, Drizzle ORM, react-native-vosk |
| `apps/web` | Next.js, Tailwind, Recharts |
| `services/api` | Node.js + Express (TypeScript), zod, JWT roles, BullMQ on Redis |
| `services/ai` | Python 3.12, FastAPI, uv, multilingual-e5-small, statsmodels, krippendorff |
| Data | PostgreSQL 17 + pgvector; SeaweedFS for clips (S3 API). Don't use MinIO: its community repo was archived in April 2026 |
| Shared | `packages/contracts` (zod + OpenAPI), `packages/scoring`, `packages/audit`, `packages/trade-packs` |

SIDH, Aadhaar eKYC, OTP and NQR are mocked behind `MOCK_INTEGRATIONS=true`.

## Commands

Node 22 or 24 and pnpm 10 (`corepack enable` picks the pinned version).

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm test` | Vitest in every workspace, through Turborepo |
| `pnpm typecheck` | `tsc` in every workspace |
| `pnpm lint` | ESLint, then a Prettier check (`pnpm format` fixes formatting) |
| `pnpm pack:build electrician` | Validate the trade pack and write `packages/trade-packs/dist/` |
| `pnpm --filter @hunarpramaan/<pkg> test` | One package only |

Run `pnpm lint && pnpm typecheck && pnpm test` before every push; CI runs the same plus gitleaks and `pnpm audit`.

Still planned (README "Getting started"): `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm e2e:*`, `pnpm eval:*`. Add them here when they exist.

**Code notes**

- Shared packages export TypeScript source (`"exports": "./src/index.ts"`); there is no build step (ADR 001).
- `@hunarpramaan/audit` hashes events as RFC 8785 canonical JSON. Don't hash `JSON.stringify` output anywhere else.
- Who may create which event or action is the `AUTHORITY` table in `packages/contracts/src/authority.ts` (ADR 006). Check it there; don't hard-code roles in handlers.

## How we work

- **Branches:** from `main`, named `feat/<module>-<short-name>`, `fix/<short-name>` or `docs/<short-name>`. Keep PRs small and squash-merge.
- **Commits:** Conventional Commits, for example `feat(mobile): record clip per criterion`.
- **Requirements:** link every change to a requirement ID (FR-xx / NFR-xx).
- **Definition of Done:**
  - tests come with the code, and CI is green;
  - phone features work in airplane mode;
  - strings exist in Hindi and English;
  - docs or an ADR are updated when a design decision changes.
- **Design decisions:** record them as ADRs in `docs/adr/NNN-title.md`. The seven planned for Sprint 0 are listed in the README.
- **Freezes:** after a feature freeze (G2, and hour 30 of the finale), only `fix:` changes go in.

## Domain terms

| Term | Meaning |
|---|---|
| RPL | Recognition of Prior Learning: certifying skills learned on the job |
| NCVET | National Council for Vocational Education and Training, the regulator |
| NSQF | National Skills Qualifications Framework, which sets the levels |
| QP | Qualification pack: the standard for one job role, made of NOS |
| NOS | National Occupational Standard: one unit of a QP, with a weight |
| PC | Performance criterion: one assessable item in a NOS, with marks |
| SSC / awarding body | Sector Skill Council that approves results (CSDCI for our trade) |
| NQR | National Qualifications Register, the source of QP files |
| SIDH | Skill India Digital Hub, where results are uploaded (mocked) |
| Bridge module | Short training on the gap NOS when coverage is below 70% |
| Mobiliser | Training-partner staff member who registers workers |
| Master assessor | Senior assessor who blind re-scores a 10% sample and flagged cases |
| Trade pack | Versioned JSON bundle per trade: criteria, rubrics, glossary, calibration clips and models |
