import { defineConfig } from 'vitest/config';

// Only the pure parts run here (src/core and the Drizzle schema on sql.js):
// anything that imports react-native or an Expo module needs the phone.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
