/**
 * Server-side API client. Every response is parsed with the shared contract
 * schema, so a drift between the API and the web app fails loudly here.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { ApiError } from '@hunarpramaan/contracts';
import type { z } from 'zod';
import { currentUser } from './session';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit & { auth?: boolean } = {}) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (init.auth !== false) {
    const user = await currentUser();
    if (!user) redirect('/login');
    headers.set('authorization', `Bearer ${user.token}`);
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' });
  if (res.status === 401 && init.auth !== false) redirect('/login');
  if (!res.ok) {
    const body = ApiError.safeParse(await res.json().catch(() => null));
    throw new ApiRequestError(
      res.status,
      body.success ? body.data.error.message : res.statusText,
      body.success ? (body.data.error.details ?? []) : [],
    );
  }
  return res;
}

export async function apiGet<S extends z.ZodType>(
  path: string,
  schema: S,
  options: { auth?: boolean } = {},
) {
  const res = await request(path, options);
  return schema.parse(await res.json()) as z.infer<S>;
}

export async function apiPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  options: { auth?: boolean } = {},
) {
  const res = await request(path, { method: 'POST', body: JSON.stringify(body), ...options });
  return schema.parse(await res.json()) as z.infer<S>;
}
