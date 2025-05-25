// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'public', // Your index.html is in the public folder
  build: {
    outDir: '../dist', // Output build files to a 'dist' folder at the project root
    emptyOutDir: true, // Clear the dist folder before building
  },
  // Add resolve alias if you plan to use them later, e.g. for src folder
  resolve: {
    alias: {
      '@': '/../src', // Because root is 'public', src is one level up and then into src
    },
  },
});