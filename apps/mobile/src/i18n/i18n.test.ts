import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fill } from './fill';
import { hi } from './hi';
import { parseLang, resolveLang, speechLocale } from './resolve';

/** Every leaf path of a nested dictionary, e.g. `signIn.errors.wrong`. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

describe('language choice', () => {
  it('uses Hindi on worker screens and English on staff screens until the person chooses', () => {
    expect(resolveLang(null, 'worker')).toBe('hi');
    expect(resolveLang(null, 'staff')).toBe('en');
  });

  it('lets an explicit choice win on every screen', () => {
    expect(resolveLang('en', 'worker')).toBe('en');
    expect(resolveLang('hi', 'staff')).toBe('hi');
  });

  it('reads back only known languages', () => {
    expect(parseLang('hi')).toBe('hi');
    expect(parseLang('en')).toBe('en');
    expect(parseLang('fr')).toBeNull();
    expect(parseLang(undefined)).toBeNull();
  });

  it('speaks Indian Hindi or Indian English', () => {
    expect(speechLocale('hi')).toBe('hi-IN');
    expect(speechLocale('en')).toBe('en-IN');
  });
});

describe('dictionaries (rule 7)', () => {
  it('have the same keys in Hindi and English', () => {
    expect(leaves(hi).map(([path]) => path)).toEqual(leaves(en).map(([path]) => path));
  });

  it('have no empty strings and the same placeholders in both languages', () => {
    const hiByPath = new Map(leaves(hi));
    for (const [path, text] of leaves(en)) {
      const other = hiByPath.get(path);
      expect(typeof text, path).toBe('string');
      expect(String(text).trim(), path).not.toBe('');
      const names = (s: unknown) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(other), path).toEqual(names(text));
    }
  });

  it('follow the copy rules: no "·" separators and no arrows', () => {
    for (const [path, text] of [...leaves(en), ...leaves(hi)]) {
      expect(String(text), path).not.toMatch(/[·→←⟶➜]/);
    }
  });
});

describe('fill', () => {
  it('fills known names and leaves unknown ones visible', () => {
    expect(fill('{count} waiting, {missing}', { count: 3 })).toBe('3 waiting, {missing}');
  });
});
