import { SignJWT, jwtVerify } from 'jose';
import { EntityId, Role, type SessionUser } from '@hunarpramaan/contracts';

const ISSUER = 'hunarpramaan-api';

/** A token's user, and the account's token version when it was issued (the `tv` claim). */
export interface VerifiedToken {
  user: SessionUser;
  tokenVersion: number;
}

export interface TokenIssuer {
  /** `tokenVersion` is the account's current one: a PIN change or reset raises it. */
  issue(user: SessionUser, tokenVersion?: number): Promise<{ token: string; expiresAt: Date }>;
  verify(token: string): Promise<VerifiedToken | null>;
}

export function createTokenIssuer(
  secret: string,
  ttlHours: number,
  now = () => new Date(),
): TokenIssuer {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(user, tokenVersion = 0) {
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + ttlHours * 3_600_000);
      const token = await new SignJWT({
        role: user.role,
        name: user.name,
        org: user.organisationId,
        tv: tokenVersion,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.id)
        .setIssuer(ISSUER)
        .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(key);
      return { token, expiresAt };
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          algorithms: ['HS256'],
          currentDate: now(),
        });
        const role = Role.safeParse(payload.role);
        const org = EntityId.safeParse(payload.org);
        const tv = payload.tv;
        if (
          !payload.sub ||
          !role.success ||
          !org.success ||
          typeof payload.name !== 'string' ||
          typeof tv !== 'number' ||
          !Number.isInteger(tv) ||
          tv < 0
        ) {
          return null;
        }
        return {
          user: { id: payload.sub, role: role.data, name: payload.name, organisationId: org.data },
          tokenVersion: tv,
        };
      } catch {
        return null;
      }
    },
  };
}
