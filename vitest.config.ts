import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'e2e/**', 'tests/e2e/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws at import time in non-server bundles. Vitest
      // hat keinen Bundler mit react-server condition — wir aliasieren
      // die leere Datei aus dem Package, damit server-only-markierte
      // Utility-Module (mfa-recovery.ts, ensure-tenant.ts) in Unit-Tests
      // importierbar bleiben. Der Bundler-Trip-Wire funktioniert weiter
      // im Prod-Build.
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
