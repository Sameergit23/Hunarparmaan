// Expo's Metro config finds the pnpm workspace root by itself and watches it, so
// the shared packages, which export TypeScript source (ADR 001), compile here
// like app code.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are .sql files, inlined by babel-plugin-inline-import.
config.resolver.sourceExts.push('sql');

module.exports = config;
