import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'json-summary', 'json'],
      reportsDirectory: 'reports/coverage/unit',
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100
      }
    },
    environment: 'jsdom',
    exclude: ['tests/visual/**', 'node_modules/**'],
    globals: true,
    maxWorkers: 1,
    setupFiles: ['tests/setup.ts']
  }
});
