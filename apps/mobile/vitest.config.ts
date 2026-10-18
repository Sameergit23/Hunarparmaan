import { defineConfig } from 'vitest/config';

// Only pure logic runs here: tests never import react-native or a native Expo module.
// Screens and components are checked by the type checker and the web export.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
