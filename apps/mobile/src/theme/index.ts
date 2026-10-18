/**
 * Wire code for the phone app (docs/design/wire-code.md). Every colour, font
 * and size in apps/mobile comes from here, and everything here comes from
 * docs/design/tokens.json, so the phone, the web and the references agree.
 * A lint rule (eslint.config.mjs) refuses hex values anywhere else.
 */
import tokens from '../../../../docs/design/tokens.json';

export type ColorName = keyof typeof tokens.color;

/** The palette. Each colour has one job: see the table in wire-code.md. */
export const color: Readonly<Record<ColorName, string>> = tokens.color;

/** Colours by role, so code says why it uses a colour. */
export const role = {
  /** An AI hint or suggestion: always with a 2px black border and black text. */
  ai: color.phaseYellow,
  /** A person's action or decision: primary buttons, selections, scores. */
  person: color.ink,
  /** Done, verified, passed, synced: with white text. */
  verified: color.earthGreen,
  /** Errors and the recording dot. */
  error: color.phaseRed,
} as const;

/** The three 4px bands every screen starts with: red, yellow, blue. */
export const brandStripe: readonly string[] = tokens.role.brandStripe.map(
  (name) => color[name as ColorName],
);

/**
 * Font families as the root layout registers them. React Native picks a
 * weight by family name, not by fontWeight, so each weight is its own family.
 */
export const font = {
  /** Rajdhani 700: headings and big numbers. */
  heading: 'Rajdhani_700Bold',
  /** Rajdhani 600: card header strips and language buttons. */
  headingSemi: 'Rajdhani_600SemiBold',
  /** Hind 400: body text. */
  body: 'Hind_400Regular',
  /** Hind 500: quiet emphasis. */
  bodyMedium: 'Hind_500Medium',
  /** Hind 600: labels, buttons and titles inside cards. */
  bodySemi: 'Hind_600SemiBold',
} as const;
export type FontName = keyof typeof font;

/** The weights tokens.json asks for, by family; a test checks `font` covers them. */
export const fontWeights = {
  heading: tokens.font.heading.weights,
  body: tokens.font.body.weights,
} as const;

export const radius = tokens.radius;

export const border = {
  /** Active or important things. */
  strong: { width: tokens.border.strong.width, color: color.ink },
  /** Quiet cards and steps not done yet. */
  quiet: { width: tokens.border.quiet.width, color: color.line },
} as const;

export const size = tokens.size;

/** Type sizes: worker screens are bigger than staff (assessor and mobiliser) screens. */
export const type = {
  worker: tokens.type.worker,
  staff: tokens.type.assessor,
} as const;
export type Audience = keyof typeof type;

/** Small fixed values the references use again and again. */
export const space = {
  /** Gap between items in a row of chips or icons. */
  xs: 4,
  sm: 8,
  /** Gap between blocks on a screen (Wire code: 12–14px). */
  md: tokens.size.gap,
  lg: 14,
  xl: 22,
} as const;

export const theme = { color, role, brandStripe, font, radius, border, size, type, space } as const;
export type Theme = typeof theme;
