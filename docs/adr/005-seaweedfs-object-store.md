# 005. SeaweedFS as the S3 store

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** FR-06, FR-10

## Context

Evidence clips need an S3-compatible object store for development, staging and the
demo-in-a-box. The idea PPT named MinIO, but its community repository was archived on
25 April 2026 and no longer gets updates.

## Decision

Use SeaweedFS (Apache-2.0) through its S3 API on port 8333. Code talks only to the S3 API
(pre-signed multipart uploads), never to SeaweedFS-specific endpoints. Clips are stored under
their SHA-256 hash.

## Consequences

- A maintained, permissively licensed store for local and demo use.
- Production can switch to any S3 store, including MeghRaj/NIC object storage, through
  configuration only.
