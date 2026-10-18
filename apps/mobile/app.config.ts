/**
 * Expo config for the development build (ADR 002). `expo prebuild` turns this
 * into the android/ folder, which is generated and never committed.
 */
import type { ExpoConfig } from 'expo/config';
import voskModel from './scripts/vosk-model.json';

const config: ExpoConfig = {
  name: 'HunarPramaan',
  slug: 'hunarpramaan',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#E4E5E0',
  android: {
    package: 'in.hunarpramaan.app',
    // The microphone is for the voice interview; Vosk runs on the phone.
    permissions: ['android.permission.RECORD_AUDIO'],
    // The encrypted database must not leave the phone through Android backups.
    allowBackup: false,
  },
  plugins: [
    // ADR 003: SQLCipher is compiled into expo-sqlite; the key lives in secure storage.
    ['expo-sqlite', { useSQLCipher: true }],
    'expo-secure-store',
    // Bundles the model that `pnpm --filter @hunarpramaan/mobile model:download` unpacks.
    ['react-native-vosk', { models: [`assets/${voskModel.dir}`] }],
  ],
};

export default config;
