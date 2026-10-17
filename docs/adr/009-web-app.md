# 009. Web app: Next.js with server-side API calls and Wire code

- **Status:** Accepted
- **Date:** 2026-10-18
- **Requirements:** FR-12, FR-14, FR-17, NFR-06, NFR-09; rule 7 in `CLAUDE.md`

## Context

The web app serves the public (certificate checks and the project's story) and three office
roles: assessment agencies, awarding bodies and NCVET. It must follow the Wire code design
language, work on a phone, and show every string in Hindi and English.

## Decision

- **Next.js 16 (App Router)** in `apps/web`. Pages are server components; only interactive
  parts (sign-in, decisions, the chart, the chain check) are client components.
- **The browser never holds the API token.** Sign-in stores the JWT in an `httpOnly`, `SameSite=Lax`
  cookie, and the Next.js server calls the API with it. Responses are parsed with the shared
  zod contracts, so drift between the API and the web app fails loudly.
- **Roles:** agency (dashboard, sessions, flags), awarding body (dashboard, approvals,
  sessions) and NCVET (dashboard only, with aggregates only). Field roles are sent to the phone
  app. The API enforces the same rules; the web app only hides pages that would fail.
- **Wire code:** Tailwind's colour palette is replaced, not extended, by `docs/design/tokens.json`,
  so off-palette classes do not exist. The root layout also sets the tokens as `--color-*`
  variables. Rajdhani and Hind load through `next/font/google` with Devanagari.
- **Two languages:** `src/lib/i18n/en.ts` and `hi.ts`. The Hindi dictionary is typed against the
  English one, and a unit test checks that both have the same keys and placeholders. The
  language is a cookie; office screens default to English.
- **Tests:** Vitest for the dictionaries and message wording; Playwright (`pnpm e2e:web`) for
  sign-in, role-based navigation, approval to a verifiable certificate, the language switch, and
  no sideways scroll at phone width. CI runs Playwright against production builds.

## Consequences

- Pages are rendered on demand, so data is always fresh and nothing personal is cached.
- No client-side state library is needed.
- Server actions avoid `revalidatePath` where the current page must keep showing a result,
  because revalidating also refreshes the page that called the action.
