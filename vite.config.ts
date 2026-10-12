import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  server: { host: '127.0.0.1', port: 8080 },
  // Vite 8's bundled OXC handles TypeScript/automatic React JSX without the
  // additional SWC native cache, which is unavailable on restricted Windows.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { chunkSizeWarningLimit: 600 },
});
