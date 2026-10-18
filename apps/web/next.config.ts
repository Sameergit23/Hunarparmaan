import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source (ADR 001).
  transpilePackages: ['@hunarpramaan/contracts'],
  poweredByHeader: false,
  reactStrictMode: true,
  // The repo's agent guidance lives in CLAUDE.md; don't generate AGENTS.md.
  agentRules: false,
};

export default config;
