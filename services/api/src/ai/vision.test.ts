import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { VisionRejected, VisionUnavailable, createVisionClient } from './vision';

const REPORT = {
  engine: 'owlv2-base-patch16-ensemble@cfd3195+rules.1',
  media: { kind: 'photo', frames: 1, durationSec: null },
  results: [
    {
      check: 'ppe.gloves',
      status: 'raised',
      confidence: 0.81,
      reason: null,
      frames: [{ index: 0, timeSec: 0, score: 0.42, box: [0.1, 0.2, 0.3, 0.4] }],
    },
  ],
  unsupported: ['meter.reading'],
};

let server: Server;
let base: string;
let reply: { status: number; body: unknown } = { status: 200, body: REPORT };
let seen: {
  url: string;
  type: string | undefined;
  auth: string | undefined;
  bytes: number;
} | null = null;

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res) => {
    let bytes = 0;
    for await (const chunk of req) bytes += (chunk as Buffer).length;
    seen = {
      url: req.url ?? '',
      type: req.headers['content-type'],
      auth: req.headers.authorization,
      bytes,
    };
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const client = (extra: Record<string, string> = {}) =>
  createVisionClient(loadConfig({ NODE_ENV: 'test', AI_SERVICE_URL: base, ...extra }))!;

describe('the AI service client', () => {
  it('is off without AI_SERVICE_URL', () => {
    expect(createVisionClient(loadConfig({ NODE_ENV: 'test' }))).toBeNull();
  });

  it('sends the clip as the body with its type and the checks, and reads the report', async () => {
    reply = { status: 200, body: REPORT };
    const report = await client().check(new Uint8Array([1, 2, 3]), 'image/jpeg', [
      'ppe.gloves',
      'meter.reading',
    ]);
    expect(seen).toEqual({
      url: '/v1/vision/checks?checks=ppe.gloves%2Cmeter.reading',
      type: 'image/jpeg',
      auth: undefined,
      bytes: 3,
    });
    expect(report.results[0]).toMatchObject({ check: 'ppe.gloves', status: 'raised' });
  });

  it('sends the service token when one is set', async () => {
    reply = { status: 200, body: REPORT };
    await client({ AI_SERVICE_TOKEN: 'a-long-enough-service-token' }).check(
      new Uint8Array([1]),
      'video/mp4',
      ['ppe.gloves'],
    );
    expect(seen?.auth).toBe('Bearer a-long-enough-service-token');
  });

  it('tells a refused clip from an unavailable service', async () => {
    reply = { status: 422, body: { error: { code: 'unreadable_media', message: 'x' } } };
    await expect(client().check(new Uint8Array([1]), 'video/mp4', ['ppe.gloves'])).rejects.toThrow(
      VisionRejected,
    );
    for (const status of [500, 503, 401]) {
      reply = { status, body: { error: { code: 'x', message: 'x' } } };
      await expect(
        client().check(new Uint8Array([1]), 'video/mp4', ['ppe.gloves']),
      ).rejects.toThrow(VisionUnavailable);
    }
  });

  it('refuses an answer that does not match the contract', async () => {
    reply = { status: 200, body: { ...REPORT, results: [{ check: 'Not A Check' }] } };
    await expect(client().check(new Uint8Array([1]), 'image/jpeg', ['ppe.gloves'])).rejects.toThrow(
      VisionUnavailable,
    );
  });

  it('reports a service that is not running as unavailable', async () => {
    const off = createVisionClient(
      loadConfig({ NODE_ENV: 'test', AI_SERVICE_URL: 'http://127.0.0.1:9' }),
    )!;
    await expect(off.check(new Uint8Array([1]), 'image/jpeg', ['ppe.gloves'])).rejects.toThrow(
      VisionUnavailable,
    );
  });
});
