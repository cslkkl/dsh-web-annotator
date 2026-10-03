import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { webAnnotator } from '../../lib/vite.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [webAnnotator()],
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
});
