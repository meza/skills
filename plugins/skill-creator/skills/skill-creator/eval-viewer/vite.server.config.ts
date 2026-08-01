import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist/server',
    rollupOptions: {
      output: {
        entryFileNames: 'main.js'
      }
    },
    ssr: 'src/server/main.ts'
  },
  ssr: {
    noExternal: true
  }
});
