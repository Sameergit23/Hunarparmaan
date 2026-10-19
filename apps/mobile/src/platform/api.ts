/**
 * The API, over the LAN during the spike. EXPO_PUBLIC_API_URL is read when the
 * app is bundled: put the laptop's LAN address in apps/mobile/.env, for
 * example http://192.168.1.20:4000. Without it the Android emulator's address
 * for the host computer is used.
 */
import { z } from 'zod';
import {
  ApiError,
  LoginResponse,
  OtpResponse,
  RegisterDeviceResponse,
  type LoginRequest,
  type RegisterDeviceRequest,
  type SyncPushRequest,
} from '@hunarpramaan/contracts';
import { HttpStatusError } from '../core/sync';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000').replace(
  /\/$/,
  '',
);

const TIMEOUT_MS = 20_000;

async function request<T>(
  path: string,
  options: { body: unknown; token?: string; schema: z.ZodType<T> },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = ApiError.safeParse(json);
    throw new HttpStatusError(
      response.status,
      error.success ? error.data.error.code : null,
      error.success ? error.data.error.message : `HTTP ${response.status}`,
    );
  }
  return options.schema.parse(json);
}

export const api = {
  requestOtp: (phone: string) =>
    request('/v1/auth/otp', { body: { phone }, schema: OtpResponse }),
  login: (body: LoginRequest) => request('/v1/auth/login', { body, schema: LoginResponse }),
  registerDevice: (token: string, body: RegisterDeviceRequest) =>
    request('/v1/devices', { body, token, schema: RegisterDeviceResponse }),
  /** The answer is checked by pushPending, which knows what to do with each ack. */
  push: (token: string, body: SyncPushRequest) =>
    request('/v1/sync/push', { body, token, schema: z.unknown() }),
};
