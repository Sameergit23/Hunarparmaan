import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminRole, SessionUser, type LoginResponse, type Role } from '@hunarpramaan/contracts';

export const TOKEN_COOKIE = 'hp_token';
/** When the sign-in before this one happened, for "Last sign-in" in the header. */
export const LAST_SIGN_IN_COOKIE = 'hp_last';
/** The 10-minute ticket between the SMS code and the invite code. Never seen by the browser's scripts. */
export const TICKET_COOKIE = 'hp_ticket';

/** Roles that use the office screens; field roles use the phone app. */
export const OFFICE_ROLES = new Set(['agency', 'awarding_body', 'ncvet']);

/** Roles that use the admin panel under /admin (ADR 010), and nothing else. */
export const ADMIN_ROLES = new Set<string>(AdminRole.options);
export const isAdminRole = (role: string) => ADMIN_ROLES.has(role);

/**
 * Where each role lands after signing in: the role decides, never a button.
 * Null for phone roles, which sign in on the phone app.
 */
export function homeFor(role: Role): string | null {
  if (ADMIN_ROLES.has(role)) return '/admin/people';
  return OFFICE_ROLES.has(role) ? '/dashboard' : null;
}

/**
 * Keep a sign-in: the token in an httpOnly cookie, as ADR 009 says, so the
 * browser never holds it. `rememberLast: false` keeps "Last sign-in" as it
 * is, for a new token that is not a new sign-in, such as after a PIN change.
 */
export async function keepSignIn(login: LoginResponse, options = { rememberLast: true }) {
  const jar = await cookies();
  const cookie = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(login.expiresAt),
  };
  jar.set(TOKEN_COOKIE, login.token, cookie);
  if (!options.rememberLast) return;
  if (login.previousSignInAt) jar.set(LAST_SIGN_IN_COOKIE, login.previousSignInAt, cookie);
  else jar.delete(LAST_SIGN_IN_COOKIE);
}

/** The time of the sign-in before this one, or null on someone's first. */
export async function lastSignIn(): Promise<string | null> {
  const value = (await cookies()).get(LAST_SIGN_IN_COOKIE)?.value;
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

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
