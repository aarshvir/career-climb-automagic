import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
// Isolate the review's pure/browser-storage cases from production React/SWC
// tooling and broad frontend auth mocks; no application configuration changes.
export default defineConfig({
  test: { environment: 'jsdom', include: ['src/__tests__/lib/check-draft.test.ts', 'src/__tests__/auth/check-auth-handoff.test.tsx', 'src/__tests__/adversarial/*.adversarial.test.ts'] },
  resolve: { alias: { '@': fileURLToPath(new URL('../../', import.meta.url)) } },
});
