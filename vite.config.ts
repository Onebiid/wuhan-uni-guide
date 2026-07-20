import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = normalizeBase(env.VITE_BASE_PATH || (command === 'build' ? '/wuhan-uni-guide/' : '/'));

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: '我们的武大',
          short_name: '我们的武大',
          description: '属于两个人的武大地点与回忆地图',
          lang: 'zh-CN',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#f7f8f7',
          background_color: '#f7f8f7',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          runtimeCaching: [],
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      target: 'es2022',
      sourcemap: true,
      cssCodeSplit: true,
    },
  };
});

function normalizeBase(value: string): string {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}
