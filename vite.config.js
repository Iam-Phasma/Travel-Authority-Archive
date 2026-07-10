import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages base path — matches the repository name
  base: '/Travel-Authority-Archive/',

  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Travel Authority Archive',
        short_name: 'CTAA',
        start_url: '/Travel-Authority-Archive/',
        scope: '/Travel-Authority-Archive/',
        display: 'standalone',
        background_color: '#f4f7f9',
        theme_color: '#1b4b60',
        icons: [
          {
            src: 'assets/CHED-Logo.webp',
            sizes: '192x192',
            type: 'image/webp',
          },
          {
            src: 'assets/CHED-Logo.webp',
            sizes: '512x512',
            type: 'image/webp',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

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
