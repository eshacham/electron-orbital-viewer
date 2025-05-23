// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public', // Your index.html is in the public folder
  build: {
    outDir: '../dist', // Output build files to a 'dist' folder at the project root
    emptyOutDir: true, // Clear the dist folder before building
  }
});