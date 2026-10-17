import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CanonicalizationError, canonicalize } from './canonical';

const vector = (file: string) =>
  readFileSync(new URL(`../test-vectors/rfc8785/${file}`, import.meta.url), 'utf8');

describe('canonicalize (RFC 8785)', () => {
  it.each(['values', 'sorting'])('matches the RFC 8785 "%s" example byte for byte', (name) => {
    const input: unknown = JSON.parse(vector(`${name}-input.json`));
    expect(canonicalize(input)).toBe(vector(`${name}-output.json`));
  });

  it.each([
    [0, '0'],
    [-0, '0'],
    [5e-324, '5e-324'],
    [-5e-324, '-5e-324'],
    [1.7976931348623157e308, '1.7976931348623157e+308'],
    [9007199254740992, '9007199254740992'],
    [1e21, '1e+21'],
    [1e20, '100000000000000000000'],
    [1e23, '1e+23'],
    [0.000001, '0.000001'],
    [1e-7, '1e-7'],
    [-1.5, '-1.5'],
  ])('serialises the number %d as %s (RFC 8785 appendix B)', (value, expected) => {
    expect(canonicalize(value)).toBe(expected);
  });

  it('sorts nested objects and keeps array order', () => {
    expect(canonicalize({ b: [3, { z: 1, a: 2 }], a: 'x' })).toBe(
      '{"a":"x","b":[3,{"a":2,"z":1}]}',
    );
  });

  it('gives the same output whatever order the keys were written in', () => {
    expect(canonicalize({ seq: 1, deviceId: 'd1' })).toBe(canonicalize({ deviceId: 'd1', seq: 1 }));
  });

  it('keeps non-ASCII text as is, including Hindi', () => {
    expect(canonicalize({ text: 'अर्थिंग' })).toBe('{"text":"अर्थिंग"}');
  });

  it('drops undefined object members, as they vanish once sent as JSON', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined in an array', [1, undefined]],
    ['a top-level undefined', undefined],
    ['a bigint', 10n],
    ['a function', () => 1],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a lone surrogate', '\ud800'],
    ['a lone surrogate in a key', { '\udc00': 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });
});
