/** Signing up and in (FR-05, ADR 012). HTTP only: the rules are in `domain/auth.ts`. */
import { Router } from 'express';
import {
  AcceptInviteRequest,
  ChangePinRequest,
  LoginRequest,
  OtpRequest,
  OtpVerifyRequest,
  RefreshRequest,
  RegisterRequest,
  RenewalKeyRequest,
  ResetPinRequest,
  type LoginResponse,
  type OtpResponse,
  type OtpVerifyResponse,
  type RefreshResponse,
  type RegisterResponse,
  type RenewalKeyResponse,
} from '@hunarpramaan/contracts';
import type { TokenIssuer } from '../auth/tokens';
import type { Deps } from '../domain/context';
import {
  acceptInvite,
  changePin,
  issueRenewalKey,
  loginWithCode,
  loginWithTicket,
  refreshSignIn,
  registerWorker,
  requestCode,
  resetPin,
  verifyCode,
} from '../domain/auth';
import { currentUser } from '../http/auth';
import { parse } from '../http/validate';

/** Routes for people who aren't signed in yet. */
export function authRoutes(deps: Deps, tokens: TokenIssuer) {
  const router = Router();

  router.post('/v1/auth/otp', async (req, res) => {
    const { phone } = parse(OtpRequest, req.body);
    const body: OtpResponse = await requestCode(deps, phone, req.ip ?? null);
    res.status(201).json(body);
  });

  router.post('/v1/auth/otp/verify', async (req, res) => {
    const { challengeId, otp } = parse(OtpVerifyRequest, req.body);
    const body: OtpVerifyResponse = await verifyCode(deps, challengeId, otp);
    res.json(body);
  });

  router.post('/v1/auth/login', async (req, res) => {
    const input = parse(LoginRequest, req.body);
    const body: LoginResponse =
      'ticket' in input
        ? await loginWithTicket(deps, tokens, input)
        : await loginWithCode(deps, tokens, input);
    res.json(body);
  });

  router.post('/v1/auth/register', async (req, res) => {
    const body: RegisterResponse = await registerWorker(
      deps,
      tokens,
      parse(RegisterRequest, req.body),
    );
    res.status(201).json(body);
  });

  router.post('/v1/auth/invite/accept', async (req, res) => {
    const body: LoginResponse = await acceptInvite(
      deps,
      tokens,
      parse(AcceptInviteRequest, req.body),
    );
    res.status(201).json(body);
  });

  router.post('/v1/auth/pin/reset', async (req, res) => {
    const body: LoginResponse = await resetPin(deps, tokens, parse(ResetPinRequest, req.body));
    res.json(body);
  });

  router.post('/v1/auth/refresh', async (req, res) => {
    const body: RefreshResponse = await refreshSignIn(
      deps,
      tokens,
      parse(RefreshRequest, req.body),
    );
    res.json(body);
  });

  return router;
}

/** Routes for a signed-in account: changing the PIN and staying signed in on a phone. */
export function accountRoutes(deps: Deps, tokens: TokenIssuer) {
  const router = Router();

  router.post('/v1/auth/pin', async (req, res) => {
    const input = parse(ChangePinRequest, req.body);
    const body: LoginResponse = await changePin(deps, tokens, currentUser(res), input);
    res.json(body);
  });

  router.post('/v1/auth/renewal-key', async (req, res) => {
    const { deviceId } = parse(RenewalKeyRequest, req.body);
    const body: RenewalKeyResponse = await issueRenewalKey(deps, currentUser(res), deviceId);
    res.status(201).json(body);
  });

  return router;
}
