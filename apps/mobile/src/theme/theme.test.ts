import { describe, expect, it } from 'vitest';
import tokens from '../../../../docs/design/tokens.json';
import { border, brandStripe, color, font, fontWeights, role, size, type } from './index';

describe('theme (built from docs/design/tokens.json)', () => {
  it('uses exactly the token palette', () => {
    expect(color).toEqual(tokens.color);
    for (const hex of Object.values(color)) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('gives each role its Wire code colour', () => {
    expect(role).toEqual({
      ai: tokens.color.phaseYellow,
      person: tokens.color.ink,
      verified: tokens.color.earthGreen,
      error: tokens.color.phaseRed,
    });
    expect(brandStripe).toEqual([
      tokens.color.phaseRed,
      tokens.color.phaseYellow,
      tokens.color.phaseBlue,
    ]);
    expect(border.strong).toEqual({ width: 2, color: tokens.color.ink });
    expect(border.quiet).toEqual({ width: 1.5, color: tokens.color.line });
  });

  it('registers a font family for every weight the tokens ask for', () => {
    const weightOf = (family: string) => Number(/_(\d{3})/.exec(family)?.[1]);
    const rajdhani = Object.values(font).filter((f) => f.startsWith('Rajdhani_'));
    const hind = Object.values(font).filter((f) => f.startsWith('Hind_'));
    expect(rajdhani.map(weightOf).sort()).toEqual([...fontWeights.heading].sort());
    expect(hind.map(weightOf).sort()).toEqual([...fontWeights.body].sort());
    expect(tokens.font.heading.family).toBe('Rajdhani');
    expect(tokens.font.body.family).toBe('Hind');
  });

  it('keeps touch targets and worker buttons at their Wire code sizes', () => {
    expect(size.touchMin).toBeGreaterThanOrEqual(48);
    expect(size.workerButton).toBe(54);
    expect(type.worker.body).toBeGreaterThan(type.staff.body);
  });
});
