import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { splashPlugin } from './src/splash/vite-plugin.js';

// Single self-contained index.html (JS inlined) so the build runs from file:// or any static host.
// splashPlugin (after singleFile): launch trailer at the top of <body>, game script moved to the end (src/splash).
export default defineConfig({
  base: './',
  plugins: [viteSingleFile(), splashPlugin()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
