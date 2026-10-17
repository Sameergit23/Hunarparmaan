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

  it('treats empty values from a .env file as unset', () => {
    const config = loadConfig({ S3_ENDPOINT: '', REDIS_URL: '', JWT_SECRET: '' });
    expect(config.S3_ENDPOINT).toBeUndefined();
    expect(config.REDIS_URL).toBeUndefined();
  });

  it('rejects a short signing key', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/32 characters/);
  });
});
