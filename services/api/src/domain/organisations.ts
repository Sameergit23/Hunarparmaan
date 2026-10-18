/**
 * Bridge until organisations exist (ADR 010). The token and `SessionUser`
 * already carry an organisation id, so every account belongs to this one pilot
 * organisation for now. Sprint 1 adds the `organisations` table and
 * `users.organisation_id` and removes this constant; nothing reads the id
 * until scoping lands in Sprint 2 (IT-05).
 */
export const PILOT_ORGANISATION_ID = '00000000-0000-4000-8000-000000000001';
