import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
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
      css: {
        include: [/.+\.module\.css$/],
        modules: {
          classNameStrategy: 'stable'
        }
      },
      environment: 'jsdom',
      exclude: ['tests/visual/**', 'node_modules/**'],
      globals: true,
      setupFiles: ['tests/setup.ts']
    }
  })
);
