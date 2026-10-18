import { SignJWT, jwtVerify } from 'jose';
import { EntityId, Role, type SessionUser } from '@hunarpramaan/contracts';

const ISSUER = 'hunarpramaan-api';

export interface TokenIssuer {
  issue(user: SessionUser): Promise<{ token: string; expiresAt: Date }>;
  verify(token: string): Promise<SessionUser | null>;
}

export function createTokenIssuer(
  secret: string,
  ttlHours: number,
  now = () => new Date(),
): TokenIssuer {
  const key = new TextEncoder().encode(secret);
  return {
    async issue(user) {
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + ttlHours * 3_600_000);
      const token = await new SignJWT({
        role: user.role,
        name: user.name,
        org: user.organisationId,
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
        if (!payload.sub || !role.success || !org.success || typeof payload.name !== 'string') {
          return null;
        }
        return { id: payload.sub, role: role.data, name: payload.name, organisationId: org.data };
      } catch {
        return null;
      }
    },
  };
}
