import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('runs a fresh clone with local defaults: PGlite, mocks on, a development key', () => {
    const config = loadConfig({});
    expect(config.DATABASE_URL).toMatch(/^pglite:/);
    expect(config.MOCK_INTEGRATIONS).toBe(true);
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('refuses to run production without a signing key', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x/y' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('refuses to run production on PGlite', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(32) })).toThrow(
      /PostgreSQL/,
    );
  });

  it('keeps the mocks off in production unless asked', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(32),
      DATABASE_URL: 'postgres://x/y',
    });
    expect(config.MOCK_INTEGRATIONS).toBe(false);
  });

  it('keeps the sign-in limits on everywhere but development, unless set', () => {
    const production = { JWT_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://x/y' };
    expect(loadConfig({}).SIGN_IN_LIMITS).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test' }).SIGN_IN_LIMITS).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production', ...production }).SIGN_IN_LIMITS).toBe(true);
    expect(loadConfig({ SIGN_IN_LIMITS: 'true' }).SIGN_IN_LIMITS).toBe(true);
  });

  it('treats empty values from a .env file as unset', () => {
    const config = loadConfig({ S3_ENDPOINT: '', REDIS_URL: '', JWT_SECRET: '' });
    expect(config.S3_ENDPOINT).toBeUndefined();
    expect(config.REDIS_URL).toBeUndefined();
  });

  it('refuses the development key anywhere but localhost, even when NODE_ENV is forgotten', () => {
    expect(() => loadConfig({ PUBLIC_API_URL: 'https://staging.example.in' })).toThrow(
      /JWT_SECRET/,
    );
    expect(
      loadConfig({ PUBLIC_API_URL: 'https://staging.example.in', JWT_SECRET: 'y'.repeat(32) })
        .JWT_SECRET,
    ).toBe('y'.repeat(32));
  });

  it('rejects a short signing key', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/32 characters/);
  });
});
