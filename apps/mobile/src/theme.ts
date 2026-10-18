/**
 * The app's only theme file, made from the Wire code tokens
 * (docs/design/tokens.json). Components take colours, fonts and sizes from
 * here and never hard-code them.
 */
import { Hind_400Regular, Hind_500Medium, Hind_600SemiBold } from '@expo-google-fonts/hind';
import { Rajdhani_600SemiBold, Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import tokens from '../../../docs/design/tokens.json';

export const color = tokens.color;

/** One job per colour (Wire code): yellow is AI, black is a person, green is done, red is an error. */
export const role = {
  ai: color.phaseYellow,
  person: color.ink,
  verified: color.earthGreen,
  error: color.phaseRed,
  brandStripe: [color.phaseRed, color.phaseYellow, color.phaseBlue],
} as const;

/** Passed to expo-font's useFonts; the keys are the fontFamily names below. */
export const fontFiles = {
  Rajdhani_600SemiBold,
  Rajdhani_700Bold,
  Hind_400Regular,
  Hind_500Medium,
  Hind_600SemiBold,
};

/** React Native picks a font file per weight, so each weight is its own family. */
export const font = {
  heading: 'Rajdhani_700Bold',
  headingStrip: 'Rajdhani_600SemiBold',
  body: 'Hind_400Regular',
  bodyMedium: 'Hind_500Medium',
  bodySemiBold: 'Hind_600SemiBold',
} as const;

export const radius = tokens.radius;
export const border = {
  strong: { width: tokens.border.strong.width, color: color.ink },
  quiet: { width: tokens.border.quiet.width, color: color.line },
} as const;
export const size = tokens.size;
/** Worker screens: body 16 to 18, headings 30 to 34, big numbers 38 to 44. */
export const type = tokens.type.worker;
