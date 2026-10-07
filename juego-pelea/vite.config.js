import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Sitio multipágina: el juego (index.html) y el panel de administración (admin.html).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
