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

- Sprint 0 runs 19–25 Oct 2026. These exist: the four shared packages (`packages/contracts`, `scoring`, `audit`, `trade-packs`), `services/api` and `apps/web`. Still to come: `apps/mobile`, `services/ai` and `evaluation/`. README "Repository layout" marks which folders are planned.
- The team develops on their own computers (Windows, macOS and Linux), with GitHub for PRs and CI. Keep every script cross-platform: Node APIs instead of `rm -rf`, `cp` or shell-only syntax in `package.json`, and paths built with `node:path`.
- The admin panel and organisation scoping are designed but not built: ADR 010, ADR 011 and `docs/design/access-control.md`. Organisations and personal data outside the hash chain come in Sprint 1, scoping (IT-05) in Sprint 2, admin screens in Sprints 3–5.
- Gates: G1 Sprint 0 exit (25 Oct) · G2 feature complete (29 Nov) · G3 demo-ready (6 Dec). The 36-hour Grand Finale is in December 2026.
- The sprint plan, requirements (FR-xx, NFR-xx) and test plan are in README "Development lifecycle (SDLC)".

## Rules that must never break

1. **AI suggests, people decide.** No AI job may write or change a score, sign a recommendation or approve a certificate. Enforce it in the API by role, and keep test IT-03 passing. Admin roles (ADR 010) never decide either: they manage people, organisations and phones, and IT-04 will prove it.
2. **Offline first.** Every worker and assessor step works with no network. Phone writes go to local SQLite (SQLCipher) plus an outbox. No screen may depend on the network without an offline path.
3. **One database writer.** Only the API and its queue worker write to PostgreSQL. The AI service is stateless: it returns results and never touches the database.
4. **Append-only.** Scores, evidence and audit entries are events with UUIDv7 ids. Never UPDATE or DELETE them; a correction is a new event.
5. **Evidence integrity.** Hash every evidence file (SHA-256) at capture and record it in the per-device hash chain (canonical JSON, RFC 8785).
6. **One scoring implementation.** Coverage, routing and result maths live only in `packages/scoring` and run the same on the phone and the server.
7. **Two languages.** Every user-facing string exists in Hindi and English.
8. **No personal data in Git, logs or prompts.**
   - Never commit secrets, `.env`, recordings, names, phone numbers or Aadhaar numbers. Use seeded fixtures; media files are git-ignored on purpose.
   - Store only the eKYC reference, never the Aadhaar number.
   - Send only transcripts to outside AI services.
   - Request logs redact tokens and cookies and never log bodies (`services/api/src/logger.ts`); keep it that way.
9. **Contracts change on purpose.** A change to `packages/contracts` or the trade-pack schema needs a version bump and a note in the PR.

## Stack

| Part | Tech |
|---|---|
| `apps/mobile` | React Native, Expo dev build (not Expo Go), TypeScript, expo-sqlite + SQLCipher, Drizzle ORM, react-native-vosk |
| `apps/web` | Next.js, Tailwind, Recharts |
| `services/api` | Node.js + Express (TypeScript), zod, JWT roles, BullMQ on Redis |
| `services/ai` | Python 3.12, FastAPI, uv, multilingual-e5-small, statsmodels, krippendorff |
| Data | PostgreSQL 17 + pgvector; SeaweedFS for clips (S3 API). Don't use MinIO: its community repo was archived in April 2026 |
| Shared | `packages/contracts` (zod; OpenAPI planned), `packages/scoring`, `packages/audit`, `packages/trade-packs` |

SIDH, Aadhaar eKYC, OTP and NQR are mocked behind `MOCK_INTEGRATIONS=true`.

## Design

Every screen uses Wire code, our design language built on the wiring colours Indian electricians know. Read `docs/design/wire-code.md` before building or changing a screen.

- **Values:** take colours, fonts and sizes from `docs/design/tokens.json` through one theme file per app. Don't hard-code hex values in components.
- **References:** `docs/design/screens/` has HTML references for landing, interview, match result, worker home and scoring. Match them closely, and build the other screens from the rules in `wire-code.md`.
- **Colour roles:** yellow `#F2B600` is an AI hint, black is a person's action or decision, green `#2E7D32` is done or verified, red `#C8102E` is errors and the recording dot, and blue `#1F4E9C` appears only in the brand stripe. No other colours, gradients or shadows, and colour never carries meaning alone: pair it with an icon and a word.
- **AI on screen:** show AI output as a yellow hint beside the person's choice, never as the choice itself. This is rule 1 in the UI.
- **Type and touch:** Rajdhani for headings and numbers, Hind for text. Touch targets are at least 48px, and worker buttons are 54px tall.
- **UI copy:** worker screens are Hindi first and assessor screens English first. No "·" separators, arrows on buttons or ALL CAPS labels.

## Commands

Node 22.18+ or 24.11+ (`.nvmrc` says 24) and pnpm 10 (`corepack enable` picks the pinned version; on Windows without admin rights, `npm install -g pnpm@10.28.0`). Run commands from the repo root. README "Getting started" has the setup per OS and a troubleshooting table.

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspaces |
| `pnpm dev` | API (:4000) and web (:3000) in watch mode; with no `DATABASE_URL` the API uses PGlite in `services/api/.data/` |
| `pnpm db:seed` · `pnpm db:migrate` | Demo pilot through the real sync path (PIN `1234`, OTP shown on screen) · migrations |
| `pnpm db:reset` | Delete the local PGlite database and clips; then `pnpm db:seed` again. Stop `pnpm dev` first |
| `pnpm check` | `pnpm lint`, `pnpm typecheck` and `pnpm test`: run before every push |
| `pnpm test` | Vitest in every workspace, through Turborepo |
| `pnpm typecheck` · `pnpm build` | `tsc` and production builds in every workspace |
| `pnpm lint` | ESLint, then a Prettier check (`pnpm format` fixes formatting) |
| `pnpm e2e:install` · `pnpm e2e:web` | Download Chromium once · Playwright against a running `pnpm dev` on fresh demo data (`pnpm db:reset && pnpm db:seed`; the approval tests skip once the demo recommendation is approved). `PLAYWRIGHT_CHROMIUM_PATH` uses an installed Chromium instead |
| `pnpm pack:build electrician` | Validate the trade pack and write `packages/trade-packs/dist/` |
| `pnpm --filter @hunarpramaan/<pkg> test` | One workspace only |
| `pnpm --filter @hunarpramaan/api db:generate` | New migration from `services/api/src/db/schema.ts` |

Run `pnpm check` before every push. CI runs the same, plus a build, the API tests on PostgreSQL 17, Playwright, gitleaks and `pnpm audit`. Locally, the API tests run on PostgreSQL with `TEST_DATABASE_URL=postgres://hp:hp@localhost:5432/hp_test` (the Docker setup creates `hp_test`; the tests refuse a database without "test" in its name, because they empty it).

Still planned: `pnpm e2e:mobile`, `pnpm eval:*`. Add them here when they exist.

**Code notes**

- Shared packages export TypeScript source (`"exports": "./src/index.ts"`); there is no build step (ADR 001).
- Settings: the API reads the root `.env` and `services/api/.env` (`src/config.ts`, validated by zod); the web app reads only `apps/web/.env`. Turborepo strips shell variables it does not know, so add every new API or web setting to `globalPassThroughEnv` in `turbo.json`, and to `.env.example`.
- PGlite allows one process per data folder: the API holds `services/api/.data/pglite.lock` (`src/db/pglite-lock.ts`), and seed, migrate and reset stop while `pnpm dev` runs.
- `@hunarpramaan/audit` hashes events as RFC 8785 canonical JSON. Don't hash `JSON.stringify` output anywhere else.
- Who may create which event or action is the `AUTHORITY` table in `packages/contracts/src/authority.ts` (ADR 006), and reads are `READ_ACCESS`. Check them there; don't hard-code roles in handlers. New admin actions follow the same tables (ADR 010 and `docs/design/access-control.md`).
- API code layout: `src/routes` (HTTP only) → `src/domain` (rules and queries) → `src/db`. Read models take no transaction (ADR 008).
- Schema changes: edit `schema.ts` and run `db:generate`. If a new table holds events, add it to `APPEND_ONLY_TABLES` and write a new migration with its `_append_only` and `_no_truncate` triggers (`pnpm --filter @hunarpramaan/api exec drizzle-kit generate --custom --name <table>_append_only`), copying the pattern in `0001_append_only.sql`. Never edit a migration that has been applied: databases that ran it would not get the change.
- Flags and approval blockers are codes plus values; word them in `apps/web/src/lib/messages.ts` and both dictionaries, never as English from the API.
- Web strings live in `apps/web/src/lib/i18n/en.ts` and `hi.ts`; the Hindi file is typed against the English one.

## How we work

- **Branches:** from an up-to-date `main`, named `feat/<module>-<short-name>`, `fix/<short-name>` or `docs/<short-name>`. Keep PRs small and squash-merge.
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
