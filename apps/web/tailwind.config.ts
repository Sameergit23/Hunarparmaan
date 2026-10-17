/**
 * Tailwind theme made from the Wire code tokens (docs/design/tokens.json).
 * `colors` replaces Tailwind's palette instead of extending it, so a class
 * like `bg-blue-500` does not exist: only the design's colours can be used.
 */
import type { Config } from 'tailwindcss';
import tokens from '../../docs/design/tokens.json';

const { color, radius } = tokens;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ...color,
    },
    borderRadius: {
      none: '0',
      chip: `${radius.chip}px`,
      DEFAULT: `${radius.card}px`,
      card: `${radius.card}px`,
      full: '9999px',
    },
    fontFamily: {
      heading: ['var(--font-rajdhani)', 'var(--font-hind)', 'sans-serif'],
      body: ['var(--font-hind)', 'Noto Sans Devanagari', 'sans-serif'],
    },
    extend: {
      borderWidth: { quiet: '1.5px' },
      minHeight: { touch: `${tokens.size.touchMin}px`, worker: `${tokens.size.workerButton}px` },
      minWidth: { touch: `${tokens.size.touchMin}px` },
    },
  },
} satisfies Config;
