/**
 * Expo reads app.json first and passes it in here. This file only adds the
 * colours, taken from the Wire code tokens so no hex value is written twice.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';
import tokens from '../../docs/design/tokens.json';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'HunarPramaan',
  slug: config.slug ?? 'hunarpramaan',
  backgroundColor: tokens.color.ground,
  android: { ...config.android, backgroundColor: tokens.color.ground },
  plugins: [
    ...(config.plugins ?? []),
    ['expo-splash-screen', { backgroundColor: tokens.color.ground }],
  ],
});
