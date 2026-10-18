import { SignJWT, jwtVerify } from 'jose';
import { EntityId, Role, type SessionUser } from '@hunarpramaan/contracts';

const ISSUER = 'hunarpramaan-api';

/** What a valid token says. The account is still checked on every request (http/auth.ts). */
export interface TokenClaims {
  user: SessionUser;
  /** Must equal the account's token version, so a bump ends every older token. */
  tokenVersion: number;
}

export interface TokenIssuer {
  issue(user: SessionUser, tokenVersion: number): Promise<{ token: string; expiresAt: Date }>;
  verify(token: string): Promise<TokenClaims | null>;
}

export function createTokenIssuer(
  secret: string,
  ttlHours: number,
  now = () => new Date(),
): TokenIssuer {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(user, tokenVersion) {
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + ttlHours * 3_600_000);
      // The web app reads name, role and orgId from the payload for display only.
      const token = await new SignJWT({
        role: user.role,
        name: user.name,
        orgId: user.orgId,
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
        const orgId = EntityId.safeParse(payload.orgId);
        if (
          !payload.sub ||
          !role.success ||
          !orgId.success ||
          typeof payload.name !== 'string' ||
          !Number.isInteger(payload.tv)
        ) {
          return null;
        }
        return {
          user: { id: payload.sub, role: role.data, name: payload.name, orgId: orgId.data },
          tokenVersion: payload.tv as number,
        };
      } catch {
        return null;
      }
    },
  };
}
