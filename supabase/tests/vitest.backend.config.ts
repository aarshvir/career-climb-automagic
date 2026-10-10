import { defineConfig } from 'vitest/config';
// Backend tests require neither React/SWC nor frontend context mocks. This config
// also runs the real PostgreSQL fixture suite independently of browser native tooling.
export default defineConfig({ test: { environment: 'node', include: ['supabase/tests/**/*.test.ts'] } });
