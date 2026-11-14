import { defineConfig } from 'vite';

// Relative paths and fixed file names, so the build can be dropped anywhere (a phone wrapper, a static host).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
