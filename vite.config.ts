// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      {
        find: /^\/main.tsx$/,
        replacement: resolve(__dirname, 'src/main.tsx')
      },
      {
        find: /^\.\.\/src\/(.*)/,
        replacement: resolve(__dirname, 'src/$1')
      }
    ]
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100
    }
  }
});