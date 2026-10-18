import { Router } from 'express';
import { eq } from 'drizzle-orm';
import {
  LoginRequest,
  OtpRequest,
  type LoginResponse,
  type OtpResponse,
} from '@hunarpramaan/contracts';
import { hashSecret, verifySecret } from '../auth/secrets';
import type { TokenIssuer } from '../auth/tokens';
import { otpChallenges, users } from '../db/schema';
import type { Deps } from '../domain/context';
import { HttpError, unauthorized } from '../http/errors';
import { parse } from '../http/validate';

const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const MOCK_OTP = '123456';

/** Store numbers in one form: the 10 digits without +91. */
export const normalisePhone = (phone: string) => phone.replace(/^\+91/, '');

export function authRoutes(deps: Deps, tokens: TokenIssuer) {
  const router = Router();

  router.post('/v1/auth/otp', async (req, res) => {
    const { phone } = parse(OtpRequest, req.body);
    // Real SMS delivery comes with the OTP integration; until then only the mock works.
    if (!deps.config.MOCK_INTEGRATIONS) {
      throw new HttpError(
        501,
        'not_configured',
        'SMS sending is not set up; run with MOCK_INTEGRATIONS=true',
      );
    }
    const code = MOCK_OTP;
    const id = deps.newId();
    const expiresAt = new Date(deps.now().getTime() + OTP_TTL_MS);
    // A challenge is created even for unknown numbers, so the answer reveals nothing.
    await deps.db.insert(otpChallenges).values({
      id,
      phone: normalisePhone(phone),
      codeHash: await hashSecret(code),
      expiresAt,
    });
    const body: OtpResponse = {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      mockCode: code,
    };
    res.status(201).json(body);
  });

  router.post('/v1/auth/login', async (req, res) => {
    const input = parse(LoginRequest, req.body);
    const wrong = unauthorized('Wrong code or PIN');
    const [challenge] = await deps.db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, input.challengeId));
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt < deps.now() ||
      challenge.attempts >= MAX_ATTEMPTS
    ) {
      throw unauthorized('This code has expired; ask for a new one');
    }
    await deps.db
      .update(otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(otpChallenges.id, challenge.id));
    if (!(await verifySecret(input.otp, challenge.codeHash))) throw wrong;

    const [user] = await deps.db.select().from(users).where(eq(users.phone, challenge.phone));
    if (!user || !(await verifySecret(input.pin, user.pinHash))) throw wrong;

    await deps.db
      .update(otpChallenges)
      .set({ usedAt: deps.now() })
      .where(eq(otpChallenges.id, challenge.id));
    const sessionUser = { id: user.id, name: user.name, role: user.role };
    const { token, expiresAt } = await tokens.issue(sessionUser);
    const body: LoginResponse = { token, expiresAt: expiresAt.toISOString(), user: sessionUser };
    res.json(body);
  });

  return router;
}
