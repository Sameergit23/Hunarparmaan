# Architecture decision records

One file per decision, numbered in order: `NNN-short-title.md`. Copy `000-template.md` to start.
An accepted ADR is not edited later; a new ADR supersedes it.

| ADR | Decision | Status |
|---|---|---|
| [001](001-monorepo-pnpm-turborepo.md) | Monorepo with pnpm workspaces and Turborepo | Accepted |
| [002](002-expo-dev-build.md) | Expo dev build, not Expo Go | Accepted |
| [003](003-expo-sqlite-sqlcipher-outbox.md) | `expo-sqlite` + SQLCipher + an outbox, not WatermelonDB | Accepted |
| [004](004-append-only-events-single-writer.md) | Append-only events; the API is the only database writer | Accepted |
| [005](005-seaweedfs-object-store.md) | SeaweedFS as the S3 store | Accepted |
| [006](006-ai-output-is-a-suggestion.md) | AI output is a suggestion; only people decide | Accepted |
| [007](007-detector-licence.md) | Safety-gear detector licence | Accepted |
| [008](008-database-schema-and-tooling.md) | Database schema, append-only triggers and test databases | Accepted |
| [009](009-web-app.md) | Web app: Next.js with server-side API calls and Wire code | Accepted |
| [010](010-organisations-admin-roles-access-control.md) | Organisations, admin roles and access control | Accepted (design) |
| [011](011-personal-data-outside-the-hash-chain.md) | Personal data outside the hash chain | Accepted |
| [012](012-voice-sign-in.md) | Sign-up and sign-in by voice, in Hindi | Proposed |
