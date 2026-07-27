import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    modules: {
      localsConvention: 'camelCaseOnly'
    }
  },
  plugins: [react()]
});
