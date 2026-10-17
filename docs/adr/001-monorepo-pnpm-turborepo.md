# 001. Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** NFR-04 (one scoring implementation), rule 6 in `CLAUDE.md`

## Context

The phone, the API and the dashboard must share the same zod contracts, the same scoring maths
and the same hash-chain code. If these were copied between repos, the phone and the server could
disagree on a result or a hash. Six students also need one place to run every check.

## Decision

- One Git repo with pnpm workspaces: `apps/*`, `services/*`, `packages/*`.
- Turborepo runs `test` and `typecheck` across workspaces in dependency order, with caching.
- Shared packages are TypeScript-source packages: `exports` points at `src/index.ts`, and each
  consumer compiles them (Vitest, Metro, Next.js `transpilePackages`, and a bundler for the API
  build). No package has its own build step yet.
- TypeScript is pinned to 5.9 because `typescript-eslint` 8 supports TypeScript below 6.1.
- Root scripts are the interface: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm pack:build`.
- The Python AI service lives in `services/ai` with its own `uv` project; Turborepo calls it through
  a `package.json` script when it lands.

## Consequences

- A change to `packages/scoring` is checked against every consumer in the same PR.
- No publish step and no version drift between internal packages.
- Each consumer must be configured to compile workspace TypeScript; the API needs a bundler
  (for example tsup) before it can run on plain Node in production.
