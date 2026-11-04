import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API sits behind this server, so the browser sees one origin, as in production.
// That keeps cookies and redirects behaving the same in both.
// WEB_PORT and API_TARGET are for when something else on the machine already uses the default ports.
// APP_URL in the API's .env must match the web port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:4000' } },
  },
});
