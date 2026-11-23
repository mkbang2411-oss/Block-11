import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite (5173) proxy /api và /media sang server (4000) để cookie cùng origin.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/media': 'http://localhost:4000' } },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
