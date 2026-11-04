import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API sits behind this server, so the browser sees one origin, as in production.
// That keeps cookies and redirects behaving the same in both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4000' } },
  },
});
