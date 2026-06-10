import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `vite build --mode lan` -> édition hors-ligne : tout import de `./supabase`
// est redirigé vers l'adaptateur local. Le build par défaut (cloud) est
// strictement inchangé (alias vide, vendor-supabase conservé).
export default defineConfig(({ mode }) => {
  const isLan = mode === 'lan';
  return {
  // Expose l'édition au code client (le verrou de licence n'agit qu'en LAN).
  define: {
    'import.meta.env.VITE_EDITION': JSON.stringify(isLan ? 'lan' : 'cloud'),
  },
  resolve: {
    alias: isLan
      ? [
          // tout `./supabase` ou `../lib/supabase` -> adaptateur local
          { find: /^.*\/supabase$/, replacement: resolve(__dirname, 'src/lib/localClient.js') },
          // les clients secondaires `createClient(...)` (Teachers/staff) aussi
          { find: '@supabase/supabase-js', replacement: resolve(__dirname, 'src/lib/localClient.js') },
        ]
      : [],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'NotesCam — Gestion scolaire',
        short_name: 'NotesCam',
        description: 'Plateforme de gestion scolaire pour le Cameroun',
        theme_color: '#1d4ed8',
        background_color: '#f9fafb',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libs — rarely change, long-lived cache
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          // En LAN, supabase-js n'est plus dans le graphe (aliasé) -> on
          // n'en force pas le chunk pour éviter un chunk vide.
          ...(isLan ? {} : { 'vendor-supabase': ['@supabase/supabase-js'] }),
          'vendor-zustand':  ['zustand'],
          // Heavy pages lazy-loaded separately
          'page-bulletins': ['./src/pages/Bulletins.jsx'],
          'page-grades':    ['./src/pages/Grades.jsx'],
        },
      },
    },
    // Silence the 500 kB warning (vendor chunk + lazy pages stay under individually)
    chunkSizeWarningLimit: 600,
  },
  };
});
