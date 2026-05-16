import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages base path — matches the repository name
  base: '/Travel-Authority-Archive/',

  build: {
    rollupOptions: {
      input: {
        // Module 1: Login page
        main: resolve(__dirname, 'index.html'),
        // Module 2: Dashboard
        dashboard: resolve(__dirname, 'dashboard/dashboard.html'),
        // Module 3: Admin panel
        admin: resolve(__dirname, 'admin/admin.html'),
      },
    },
  },

  // Resolve aliases for cleaner imports
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
