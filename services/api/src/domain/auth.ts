/**
 * Signing up and in (docs/design/workflows.md sections 4 and 5, ADR 012): SMS
 * codes with limits, tickets, the PIN rules and lockout, workers signing up on
 * their own phone, PIN change and reset, and renewal keys for phones. The
 * routes in `routes/auth.ts` stay HTTP only.
 *
 * Failures that must be remembered (a wrong PIN, a lockout, a reused renewal
 * key) are written with single atomic statements outside any transaction, so
 * throwing the error afterwards never rolls them back.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  canPerform,
  pinProblem,
  type AcceptInviteRequest,
  type AccountState,
  type ChangePinRequest,
  type CodeLoginRequest,
  type LoginResponse,
  type PinProblem,
  type RefreshRequest,
  type RefreshResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RenewalKeyResponse,
  type ResetPinRequest,
  type Role,
  type SessionUser,
  type TicketLoginRequest,
} from '@hunarpramaan/contracts';
import { hashSecret, verifySecret } from '../auth/secrets';
import type { TokenIssuer } from '../auth/tokens';
import type { Db, Tx } from '../db/client';
import {
  accountInvites,
  authEvents,
  devices,
  otpChallenges,
  renewalKeys,
  users,
  workers,
  type AuthEventType,
} from '../db/schema';
import { HttpError, forbidden, notFound, unauthorized } from '../http/errors';
import type { Deps } from './context';
import { PILOT_ORGANISATION_ID } from './organisations';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const CODE_TTL_MS = 5 * MINUTE;
export const CODE_TRIES = 5;
/** "Send the code again" unlocks after this long. */
export const RESEND_AFTER_MS = 30_000;
export const CODES_PER_NUMBER = { max: 3, windowMs: 15 * MINUTE };
export const CODES_PER_NUMBER_PER_DAY = { max: 10, windowMs: DAY };
export const CODES_PER_IP = { max: 30, windowMs: 15 * MINUTE };
export const TICKET_TTL_MS = 10 * MINUTE;
export const PIN_TRIES = 5;
/** Wrong invite codes allowed before the invite stops working. */
export const INVITE_TRIES = 5;
/** The first lockout; each one after doubles it, up to the cap (ADR 010). */
export const FIRST_LOCK_MS = 15 * MINUTE;
export const MAX_LOCK_MS = 60 * MINUTE;
export const RENEWAL_TTL_MS = 30 * DAY;

/** Real SMS comes with the OTP integration; until then every code is this one (demo mode). */
const MOCK_OTP = '123456';

/** Who may reset their own PIN with an SMS code. Staff PIN resets come from their admin (ADR 010). */
const SELF_RESET_ROLES: readonly Role[] = ['worker'];

const CODE_EXPIRED = 'This code has expired; ask for a new one';
const WRONG_CODE_OR_PIN = 'Wrong code or PIN';

type UserRow = typeof users.$inferSelect;
type Clock = Pick<Deps, 'db' | 'now' | 'newId'>;

/** Store numbers in one form: the 10 digits without +91. */
export const normalisePhone = (phone: string) => phone.replace(/^\+91/, '');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const randomKey = () => randomBytes(32).toString('base64url');

/** A keyed hash of an IP address: enough to count requests, useless for finding anyone. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('base64url');
}

const rateLimited = (waitMs: number) =>
  new HttpError(
    429,
    'rate_limited',
    'Too many codes asked for; wait before asking again',
    undefined,
    { 'Retry-After': String(Math.max(1, Math.ceil(waitMs / 1000))) },
  );

const locked = (until: Date, now: Date) =>
  new HttpError(
    401,
    'account_locked',
    'Too many wrong PINs; try again later',
    [`until:${until.toISOString()}`],
    { 'Retry-After': String(Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000))) },
  );

const pinRejected = (problem: PinProblem) =>
  new HttpError(400, 'pin_rejected', 'This PIN is not allowed', [problem]);

const signInEnded = () => new HttpError(401, 'token_revoked', 'This phone needs a fresh sign-in');

/** One account per mobile number (ADR 010). */
export const phoneInUse = () =>
  new HttpError(409, 'phone_in_use', 'This number already has an account');

const inviteInvalid = () =>
  new HttpError(400, 'invite_invalid', 'The invite code is wrong, used or expired');

async function logEvent(
  deps: Clock,
  userId: string,
  type: AuthEventType,
  deviceId: string | null = null,
  db: Db | Tx = deps.db,
) {
  await db
    .insert(authEvents)
    .values({ id: deps.newId(), userId, type, deviceId, occurredAt: deps.now() });
}

// --- SMS codes ---------------------------------------------------------------

/** Refuse a code when the number or the IP address has asked for too many (rule 11). */
async function checkCodeLimits(db: Db, phone: string, ipHash: string | null, now: Date) {
  const t = now.getTime();
  const recent = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.phone, phone),
        gt(otpChallenges.createdAt, new Date(t - CODES_PER_NUMBER_PER_DAY.windowMs)),
      ),
    )
    .orderBy(asc(otpChallenges.createdAt));
  const times = recent.map((r) => r.createdAt.getTime());
  const last = times.at(-1);
  if (last !== undefined && t - last < RESEND_AFTER_MS)
    throw rateLimited(last + RESEND_AFTER_MS - t);
  const window = times.filter((time) => time > t - CODES_PER_NUMBER.windowMs);
  if (window.length >= CODES_PER_NUMBER.max) {
    throw rateLimited((window[0] ?? t) + CODES_PER_NUMBER.windowMs - t);
  }
  if (times.length >= CODES_PER_NUMBER_PER_DAY.max) {
    throw rateLimited((times[0] ?? t) + CODES_PER_NUMBER_PER_DAY.windowMs - t);
  }
  if (ipHash) {
    const [fromIp] = await db
      .select({ n: count() })
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.ipHash, ipHash),
          gt(otpChallenges.createdAt, new Date(t - CODES_PER_IP.windowMs)),
        ),
      );
    if (Number(fromIp?.n ?? 0) >= CODES_PER_IP.max) throw rateLimited(CODES_PER_IP.windowMs);
  }
}

/**
 * Send a code (mocked). A challenge is made for any valid number, known or
 * not, so the answer reveals nothing (rule 3); the limits apply to all numbers.
 */
export async function requestCode(deps: Deps, phone: string, ip: string | null) {
  if (!deps.config.MOCK_INTEGRATIONS) {
    throw new HttpError(
      501,
      'not_configured',
      'SMS sending is not set up; run with MOCK_INTEGRATIONS=true',
    );
  }
  const now = deps.now();
  const number = normalisePhone(phone);
  const ipHash = ip ? hashIp(ip, deps.config.JWT_SECRET) : null;
  if (deps.config.SIGN_IN_LIMITS) await checkCodeLimits(deps.db, number, ipHash, now);
  const id = deps.newId();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await deps.db.insert(otpChallenges).values({
    id,
    phone: number,
    codeHash: await hashSecret(MOCK_OTP),
    expiresAt,
    ipHash,
    createdAt: now,
  });
  return { challengeId: id, expiresAt: expiresAt.toISOString(), mockCode: MOCK_OTP };
}

/** Spend one try on a code. Returns the challenge if the code is right, null if wrong. */
async function useCode(deps: Deps, challengeId: string, otp: string) {
  const [challenge] = await deps.db
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(
      and(
        eq(otpChallenges.id, challengeId),
        isNull(otpChallenges.usedAt),
        gt(otpChallenges.expiresAt, deps.now()),
        lt(otpChallenges.attempts, CODE_TRIES),
      ),
    )
    .returning();
  if (!challenge) throw unauthorized(CODE_EXPIRED);
  return (await verifySecret(otp, challenge.codeHash)) ? challenge : null;
}

/** Whether a number has an account. Only ever told after its code was right. */
export async function accountState(db: Db, phone: string, now: Date): Promise<AccountState> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (user) return 'existing';
  return (await pendingInvite(db, phone, now)) ? 'invited' : 'none';
}

/** The newest invite for a number that is still waiting: not accepted, replaced or expired. */
async function pendingInvite(db: Db | Tx, phone: string, now: Date) {
  const [invite] = await db
    .select()
    .from(accountInvites)
    .where(
      and(
        eq(accountInvites.phone, phone),
        isNull(accountInvites.acceptedAt),
        isNull(accountInvites.replacedAt),
        gt(accountInvites.expiresAt, now),
      ),
    )
    .orderBy(desc(accountInvites.createdAt))
    .limit(1);
  return invite ?? null;
}

/** POST /v1/auth/otp/verify: the code alone. A right code becomes a ticket for the next step. */
export async function verifyCode(deps: Deps, challengeId: string, otp: string) {
  const challenge = await useCode(deps, challengeId, otp);
  if (!challenge) throw unauthorized('Wrong code');
  const now = deps.now();
  const ticket = randomKey();
  const expiresAt = new Date(now.getTime() + TICKET_TTL_MS);
  await deps.db
    .update(otpChallenges)
    .set({ usedAt: now, ticketHash: sha256(ticket), ticketExpiresAt: expiresAt })
    .where(eq(otpChallenges.id, challenge.id));
  return {
    ticket,
    expiresAt: expiresAt.toISOString(),
    account: await accountState(deps.db, challenge.phone, now),
  };
}

/**
 * The challenge behind a ticket that is still good. A ticket works until it
 * signs someone in, signs them up or resets their PIN; wrong PINs don't spend
 * it, because the account lockout already limits guessing.
 */
async function ticketChallenge(db: Db | Tx, ticket: string, now: Date) {
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(eq(otpChallenges.ticketHash, sha256(ticket)));
  if (
    !challenge ||
    challenge.ticketUsedAt ||
    !challenge.ticketExpiresAt ||
    challenge.ticketExpiresAt <= now
  ) {
    throw unauthorized(CODE_EXPIRED);
  }
  return challenge;
}

async function spendTicket(db: Db | Tx, challengeId: string, now: Date) {
  const [spent] = await db
    .update(otpChallenges)
    .set({ ticketUsedAt: now })
    .where(and(eq(otpChallenges.id, challengeId), isNull(otpChallenges.ticketUsedAt)))
    .returning({ id: otpChallenges.id });
  if (!spent) throw unauthorized(CODE_EXPIRED);
}

// --- PINs and lockout --------------------------------------------------------

/** Until when wrong PINs keep the account locked, or null. Never locked with SIGN_IN_LIMITS off. */
const lockedUntil = (deps: Deps, user: UserRow, now: Date) =>
  deps.config.SIGN_IN_LIMITS && user.lockedUntil && user.lockedUntil > now
    ? user.lockedUntil
    : null;

/** Count a wrong PIN; the fifth in a row locks the account (15 min, doubling, at most 1 hour). */
async function recordWrongPin(deps: Deps, userId: string) {
  const now = deps.now();
  const [after] = await deps.db
    .update(users)
    .set({ failedPinAttempts: sql`${users.failedPinAttempts} + 1` })
    .where(eq(users.id, userId))
    .returning({ failed: users.failedPinAttempts, lockouts: users.lockouts });
  await logEvent(deps, userId, 'sign_in_failed');
  if (!deps.config.SIGN_IN_LIMITS || !after || after.failed < PIN_TRIES) return;
  const lockMs = Math.min(FIRST_LOCK_MS * 2 ** after.lockouts, MAX_LOCK_MS);
  const [lockedNow] = await deps.db
    .update(users)
    .set({
      lockedUntil: new Date(now.getTime() + lockMs),
      lockouts: sql`${users.lockouts} + 1`,
      failedPinAttempts: 0,
    })
    .where(and(eq(users.id, userId), gte(users.failedPinAttempts, PIN_TRIES)))
    .returning({ id: users.id });
  if (lockedNow) await logEvent(deps, userId, 'locked');
}

/**
 * Check the PIN of the account behind `phone`. `wrong` is the message for a
 * wrong PIN; `missing` is what to say when the number has no account.
 */
async function checkPin(
  deps: Deps,
  phone: string,
  pin: string,
  wrong: () => HttpError,
  missing: () => HttpError,
): Promise<UserRow> {
  const now = deps.now();
  const [user] = await deps.db.select().from(users).where(eq(users.phone, phone));
  if (!user) throw missing();
  const until = lockedUntil(deps, user, now);
  if (until) throw locked(until, now);
  if (await verifySecret(pin, user.pinHash)) return user;
  await recordWrongPin(deps, user.id);
  throw wrong();
}

export const toSessionUser = (user: UserRow): SessionUser => ({
  id: user.id,
  name: user.name,
  role: user.role,
  // ADR 010's bridge until organisations exist (Sprint 1).
  organisationId: PILOT_ORGANISATION_ID,
});

/**
 * A fresh token for `user`. With `signIn`, this is a sign-in: the lockout
 * counters reset and the sign-in is logged.
 */
async function issueSession(
  deps: Deps,
  tokens: TokenIssuer,
  user: UserRow,
  options: { signIn: boolean; deviceId?: string | null },
): Promise<LoginResponse> {
  const [previous] = await deps.db
    .select({ at: authEvents.occurredAt })
    .from(authEvents)
    .where(and(eq(authEvents.userId, user.id), eq(authEvents.type, 'signed_in')))
    .orderBy(desc(authEvents.occurredAt))
    .limit(1);
  if (options.signIn) {
    await deps.db
      .update(users)
      .set({ failedPinAttempts: 0, lockouts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await logEvent(deps, user.id, 'signed_in', options.deviceId ?? null);
  }
  const sessionUser = toSessionUser(user);
  const { token, expiresAt } = await tokens.issue(sessionUser, user.tokenVersion);
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    user: sessionUser,
    previousSignInAt: previous ? previous.at.toISOString() : null,
  };
}

// --- Signing in --------------------------------------------------------------

/** The web's one step: code and PIN together, with one message for either being wrong. */
export async function loginWithCode(deps: Deps, tokens: TokenIssuer, input: CodeLoginRequest) {
  const challenge = await useCode(deps, input.challengeId, input.otp);
  const wrong = () => unauthorized(WRONG_CODE_OR_PIN);
  if (!challenge) throw wrong();
  const user = await checkPin(deps, challenge.phone, input.pin, wrong, wrong);
  await deps.db
    .update(otpChallenges)
    .set({ usedAt: deps.now() })
    .where(eq(otpChallenges.id, challenge.id));
  return issueSession(deps, tokens, user, { signIn: true });
}

/** The phone's second step, after `otp/verify`. The code is proven, so messages can be plain. */
export async function loginWithTicket(deps: Deps, tokens: TokenIssuer, input: TicketLoginRequest) {
  const now = deps.now();
  const challenge = await ticketChallenge(deps.db, input.ticket, now);
  const user = await checkPin(
    deps,
    challenge.phone,
    input.pin,
    () => unauthorized('Wrong PIN'),
    () => notFound('Account'),
  );
  await spendTicket(deps.db, challenge.id, now);
  return issueSession(deps, tokens, user, { signIn: true });
}

// --- Signing up --------------------------------------------------------------

/**
 * A worker signs up on their own phone (ADR 012). If a mobiliser already
 * registered this number, the account claims that worker record; otherwise the
 * phone registers a new one with the returned `workerId`.
 */
export async function registerWorker(
  deps: Deps,
  tokens: TokenIssuer,
  input: RegisterRequest,
): Promise<RegisterResponse> {
  const problem = pinProblem(input.pin, 'worker');
  if (problem) throw pinRejected(problem);
  const now = deps.now();
  const pinHash = await hashSecret(input.pin);
  const created = await deps.db.transaction(async (tx) => {
    const challenge = await ticketChallenge(tx, input.ticket, now);
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, challenge.phone));
    if (existing) throw phoneInUse();
    // A mobiliser may have typed the number with +91.
    const n = challenge.phone;
    const [record] = await tx
      .select({ id: workers.id })
      .from(workers)
      .where(inArray(workers.phone, [n, `+91${n}`, `91${n}`]))
      .orderBy(desc(workers.createdAt))
      .limit(1);
    const id = uuidv4();
    const workerId = record?.id ?? uuidv4();
    await tx.insert(users).values({
      id,
      role: 'worker',
      name: input.name,
      phone: n,
      pinHash,
      workerId,
      createdAt: now,
    });
    await spendTicket(tx, challenge.id, now);
    await logEvent(deps, id, 'registered', null, tx);
    return { id, workerId, claimed: Boolean(record) };
  });
  const [user] = await deps.db.select().from(users).where(eq(users.id, created.id));
  if (!user) throw new Error('registered account not found');
  const session = await issueSession(deps, tokens, user, { signIn: true });
  return { ...session, workerId: created.workerId, claimed: created.claimed };
}

/**
 * POST /v1/auth/invite/accept: an invited staff member, after `otp/verify`
 * said `invited`, enters the invite code from their admin and a new PIN.
 * The PIN is checked first, so a typing slip doesn't use up an invite try.
 */
export async function acceptInvite(
  deps: Deps,
  tokens: TokenIssuer,
  input: AcceptInviteRequest,
): Promise<LoginResponse> {
  const now = deps.now();
  const challenge = await ticketChallenge(deps.db, input.ticket, now);
  const invite = await pendingInvite(deps.db, challenge.phone, now);
  if (!invite) throw inviteInvalid();
  const problem = pinProblem(input.pin, invite.role);
  if (problem) throw pinRejected(problem);
  const [tried] = await deps.db
    .update(accountInvites)
    .set({ attempts: sql`${accountInvites.attempts} + 1` })
    .where(and(eq(accountInvites.id, invite.id), lt(accountInvites.attempts, INVITE_TRIES)))
    .returning();
  if (!tried || !(await verifySecret(input.inviteCode, tried.codeHash))) throw inviteInvalid();

  const pinHash = await hashSecret(input.pin);
  const id = uuidv4();
  await deps.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, challenge.phone));
    if (existing) throw phoneInUse();
    const [accepted] = await tx
      .update(accountInvites)
      .set({ acceptedAt: now, acceptedUserId: id })
      .where(
        and(
          eq(accountInvites.id, invite.id),
          isNull(accountInvites.acceptedAt),
          isNull(accountInvites.replacedAt),
        ),
      )
      .returning({ id: accountInvites.id });
    if (!accepted) throw inviteInvalid();
    await tx.insert(users).values({
      id,
      role: invite.role,
      name: invite.name,
      phone: challenge.phone,
      pinHash,
      createdAt: now,
    });
    await spendTicket(tx, challenge.id, now);
    await logEvent(deps, id, 'invite_accepted', null, tx);
  });
  const [user] = await deps.db.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error('invited account not found');
  return issueSession(deps, tokens, user, { signIn: true });
}

// --- Changing and resetting the PIN ------------------------------------------

/** Set a new PIN: every older sign-in and renewal key ends (token version + 1). */
async function setPin(deps: Deps, user: UserRow, pin: string, type: 'pin_changed' | 'pin_reset') {
  const now = deps.now();
  const pinHash = await hashSecret(pin);
  return deps.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        pinHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        failedPinAttempts: 0,
        lockouts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, user.id))
      .returning();
    if (!updated) throw new Error('account not found');
    await tx
      .update(renewalKeys)
      .set({ revokedAt: now })
      .where(and(eq(renewalKeys.userId, user.id), isNull(renewalKeys.revokedAt)));
    await logEvent(deps, user.id, type, null, tx);
    return updated;
  });
}

/** POST /v1/auth/pin, signed in. Returns a fresh token, because the old one has ended. */
export async function changePin(
  deps: Deps,
  tokens: TokenIssuer,
  sessionUser: SessionUser,
  input: ChangePinRequest,
): Promise<LoginResponse> {
  const now = deps.now();
  const [user] = await deps.db.select().from(users).where(eq(users.id, sessionUser.id));
  if (!user) throw unauthorized();
  const until = lockedUntil(deps, user, now);
  if (until) throw locked(until, now);
  if (!(await verifySecret(input.currentPin, user.pinHash))) {
    await recordWrongPin(deps, user.id);
    throw new HttpError(403, 'wrong_pin', 'The current PIN is wrong');
  }
  const problem = pinProblem(input.newPin, user.role);
  if (problem) throw pinRejected(problem);
  const updated = await setPin(deps, user, input.newPin, 'pin_changed');
  return issueSession(deps, tokens, updated, { signIn: false });
}

/** POST /v1/auth/pin/reset: a worker who forgot their PIN, with a fresh code. */
export async function resetPin(
  deps: Deps,
  tokens: TokenIssuer,
  input: ResetPinRequest,
): Promise<LoginResponse> {
  const now = deps.now();
  const challenge = await ticketChallenge(deps.db, input.ticket, now);
  const [user] = await deps.db.select().from(users).where(eq(users.phone, challenge.phone));
  if (!user) throw notFound('Account');
  if (!SELF_RESET_ROLES.includes(user.role)) {
    throw new HttpError(403, 'pin_reset_by_admin', 'Ask your admin to reset your PIN');
  }
  const problem = pinProblem(input.newPin, user.role);
  if (problem) throw pinRejected(problem);
  await spendTicket(deps.db, challenge.id, now);
  const updated = await setPin(deps, user, input.newPin, 'pin_reset');
  return issueSession(deps, tokens, updated, { signIn: true });
}

// --- Staying signed in on a phone --------------------------------------------

/** POST /v1/auth/renewal-key: for a field role, on a phone bound to the account. */
export async function issueRenewalKey(
  deps: Deps,
  sessionUser: SessionUser,
  deviceId: string,
): Promise<RenewalKeyResponse> {
  const actor = { kind: 'user' as const, userId: sessionUser.id, role: sessionUser.role };
  if (!canPerform(actor, 'device.registered')) {
    throw forbidden(`${sessionUser.role} does not sign in on a phone`);
  }
  const [device] = await deps.db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device || device.userId !== sessionUser.id || device.revokedAt) {
    throw forbidden(`device ${deviceId} is not registered to you`);
  }
  const [user] = await deps.db.select().from(users).where(eq(users.id, sessionUser.id));
  if (!user) throw unauthorized();
  const now = deps.now();
  const key = randomKey();
  const expiresAt = new Date(now.getTime() + RENEWAL_TTL_MS);
  await deps.db.transaction(async (tx) => {
    // One key per phone: a new one replaces any older one.
    await tx
      .update(renewalKeys)
      .set({ revokedAt: now })
      .where(
        and(
          eq(renewalKeys.userId, user.id),
          eq(renewalKeys.deviceId, deviceId),
          isNull(renewalKeys.revokedAt),
        ),
      );
    await tx.insert(renewalKeys).values({
      id: deps.newId(),
      userId: user.id,
      deviceId,
      keyHash: sha256(key),
      tokenVersion: user.tokenVersion,
      createdAt: now,
      expiresAt,
    });
    await logEvent(deps, user.id, 'renewal_issued', deviceId, tx);
  });
  return { renewalKey: key, expiresAt: expiresAt.toISOString() };
}

/**
 * POST /v1/auth/refresh: a new sign-in for the phone, and a new key in place
 * of the old one. A key that was already replaced being used again means it
 * was copied, so every key on that phone ends.
 */
export async function refreshSignIn(
  deps: Deps,
  tokens: TokenIssuer,
  input: RefreshRequest,
): Promise<RefreshResponse> {
  const now = deps.now();
  const [row] = await deps.db
    .select()
    .from(renewalKeys)
    .where(eq(renewalKeys.keyHash, sha256(input.renewalKey)));
  if (!row || row.deviceId !== input.deviceId) throw signInEnded();
  if (row.revokedAt) {
    if (row.replacedBy) {
      await deps.db
        .update(renewalKeys)
        .set({ revokedAt: now })
        .where(
          and(
            eq(renewalKeys.userId, row.userId),
            eq(renewalKeys.deviceId, row.deviceId),
            isNull(renewalKeys.revokedAt),
          ),
        );
      await logEvent(deps, row.userId, 'renewal_reused', row.deviceId);
    }
    throw signInEnded();
  }
  if (row.expiresAt <= now) throw signInEnded();
  const [user] = await deps.db.select().from(users).where(eq(users.id, row.userId));
  const [device] = await deps.db.select().from(devices).where(eq(devices.id, row.deviceId));
  if (
    !user ||
    user.tokenVersion !== row.tokenVersion ||
    !device ||
    device.revokedAt ||
    device.userId !== user.id
  ) {
    throw signInEnded();
  }
  const key = randomKey();
  const expiresAt = new Date(now.getTime() + RENEWAL_TTL_MS);
  const nextId = deps.newId();
  const rotated = await deps.db.transaction(async (tx) => {
    const [old] = await tx
      .update(renewalKeys)
      .set({ revokedAt: now, replacedBy: nextId })
      .where(and(eq(renewalKeys.id, row.id), isNull(renewalKeys.revokedAt)))
      .returning({ id: renewalKeys.id });
    // Another refresh with the same key got there first.
    if (!old) return false;
    await tx.insert(renewalKeys).values({
      id: nextId,
      userId: user.id,
      deviceId: row.deviceId,
      keyHash: sha256(key),
      tokenVersion: user.tokenVersion,
      createdAt: now,
      expiresAt,
    });
    await logEvent(deps, user.id, 'renewed', row.deviceId, tx);
    return true;
  });
  if (!rotated) throw signInEnded();
  const session = await issueSession(deps, tokens, user, { signIn: false });
  return { ...session, renewal: { renewalKey: key, expiresAt: expiresAt.toISOString() } };
}
