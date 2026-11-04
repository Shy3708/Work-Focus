import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome122',
    rollupOptions: {
      input: {
        index: 'index.html',
        trayMenu: 'tray-menu.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
