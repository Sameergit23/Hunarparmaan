import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SessionUser } from '@hunarpramaan/contracts';

export const TOKEN_COOKIE = 'hp_token';

/** Roles that use this web app; field roles use the phone app. */
export const OFFICE_ROLES = new Set(['agency', 'awarding_body', 'ncvet']);

/**
 * The signed-in user, read from the token's payload. Only for display and
 * navigation: the API verifies the token on every request.
 */
export async function currentUser(): Promise<(SessionUser & { token: string }) | null> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  const [, payload] = token.split('.');
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    const user = SessionUser.safeParse({
      id: claims.sub,
      name: claims.name,
      role: claims.role,
      organisationId: claims.org,
    });
    return user.success ? { ...user.data, token } : null;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
