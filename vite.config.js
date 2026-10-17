import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isGitHubPages = mode === 'github-pages';
  const basePath = isGitHubPages ? '/Travel-Authority-Archive/' : '/';

  return {
    base: basePath,

    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'Travel Authority Archive',
          short_name: 'CTAA',
          start_url: basePath,
          scope: basePath,
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

          main: resolve(__dirname, 'index.html'),

          dashboard: resolve(__dirname, 'dashboard/dashboard.html'),

          admin: resolve(__dirname, 'admin/admin.html'),
        },
      },
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
      },
    },
  };
});
