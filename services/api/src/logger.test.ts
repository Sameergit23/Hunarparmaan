import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  it('never writes tokens or session cookies to the log', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = createLogger({ NODE_ENV: 'development' }, sink);
    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer eyJhbGciOi.secret',
            cookie: 'hp_token=eyJ.secret',
            host: 'api',
          },
        },
        res: { headers: { 'set-cookie': 'hp_token=eyJ.secret' } },
      },
      'request',
    );
    const out = lines.join('');
    expect(out).not.toContain('secret');
    expect(out).toContain('[redacted]');
    expect(out).toContain('"host":"api"');
  });
});
