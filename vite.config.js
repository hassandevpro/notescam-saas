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
    alias: [
      // Dépendances OPTIONNELLES de jsPDF (méthode `jsPDF.html()`), jamais
      // appelées ici : l'application n'utilise que `addImage`. Sans ces alias,
      // Rollup construisait 366 Ko de morceaux (html2canvas 198 Ko, canvg
      // 147 Ko, dompurify 22 Ko) que le service worker précachait sur chaque
      // poste sans qu'une seule ligne ne s'exécute jamais.
      { find: 'html2canvas', replacement: resolve(__dirname, 'src/lib/jspdf-optional-stub.js') },
      { find: 'canvg',       replacement: resolve(__dirname, 'src/lib/jspdf-optional-stub.js') },
      { find: 'dompurify',   replacement: resolve(__dirname, 'src/lib/jspdf-optional-stub.js') },
      ...(isLan
        ? [
            // tout `./supabase` ou `../lib/supabase` -> adaptateur local
            { find: /^.*\/supabase$/, replacement: resolve(__dirname, 'src/lib/localClient.js') },
            // les clients secondaires `createClient(...)` (Teachers/staff) aussi
            { find: '@supabase/supabase-js', replacement: resolve(__dirname, 'src/lib/localClient.js') },
          ]
        : []),
    ],
  },
  plugins: [
    react(),
    // Carte d'identité du build, écrite dans dist/edition.json. Le serveur LAN
    // la lit au démarrage et REFUSE de servir un dist d'édition cloud : cette
    // SPA-là parle à Supabase et non à `/api/db`, donc sans Internet rien ne
    // s'enregistre (et avec Internet, l'école écrirait dans le cloud au lieu de
    // sa propre base). Un `npm run build` lancé par mégarde dans un dossier
    // d'école produisait exactement ce symptôme, en silence.
    {
      name: 'notescam-edition-stamp',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'edition.json',
          source: JSON.stringify({
            edition: isLan ? 'lan' : 'cloud',
            built_at: new Date().toISOString(),
          }, null, 2) + '\n',
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // Édition LAN : servie depuis un serveur local sur le réseau de l'école.
      // Le cache offline du service worker est inutile (le serveur EST le réseau)
      // et masque les mises à jour (l'ancien SW ressert l'ancien code après un
      // rebuild). `selfDestroying` génère un SW qui se désinscrit tout seul sur
      // chaque PC et vide son cache -> les mises à jour s'affichent toujours
      // après un simple rechargement. Le build cloud garde sa PWA complète.
      selfDestroying: isLan,
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
        // Le précache est téléchargé DÈS LA PREMIÈRE VISITE, quel que soit
        // l'écran ouvert : tout ce qui y figure annule le découpage en routes.
        // Les deux bibliothèques d'export (tableur, PDF) pèsent 768 Ko à elles
        // seules pour des fonctions ponctuelles. Elles sortent du précache et
        // passent en cache à la première utilisation (règle ci-dessous) : elles
        // restent donc disponibles hors ligne ensuite, mais ne ralentissent plus
        // la première ouverture de l'application.
        globIgnores: ['**/assets/xlsx-*.js', '**/assets/jspdf*.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Bibliothèques d'export : mises en cache au premier usage, puis
            // servies depuis le cache (y compris hors ligne).
            urlPattern: /\/assets\/(xlsx|jspdf)[^/]*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'nc-export-libs',
              expiration: { maxEntries: 8 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    // ÉCRAN BLANC EN DÉVELOPPEMENT — ce que ceci corrige.
    //
    // Le surveillant de fichiers de Vite (chokidar) n'ignore par défaut que
    // `node_modules` et `.git` : il NE LIT PAS `.gitignore`. Il surveillait donc
    // `packaging/_stage/`, `packaging/**/Output/`, `dist/`, `out/` et les bases
    // SQLite de `server/data*/` — tous produits ou verrouillés par d'autres
    // processus (build d'installeur, serveur LAN).
    //
    // Deux conséquences, la seconde fatale :
    //   · un build de paquet réécrit `packaging/_stage/app/dist/**` et Vite
    //     rechargeait la page en boucle, en plein travail ;
    //   · surtout, dès qu'un de ces fichiers est VERROUILLÉ par Windows, le
    //     surveillant émet un événement `error` que personne n'écoute et le
    //     processus Vite MEURT :
    //       Error: EBUSY: resource busy or locked,
    //         watch 'packaging\_stage\update-notescam.ps1'
    //     Le serveur disparaît alors sans que le navigateur en soit informé. Les
    //     pages sont chargées à la demande (`lazy` + `Suspense` dans App.jsx) :
    //     le module d'une page demandée après la mort du serveur n'arrive jamais,
    //     la promesse reste en attente, et `Suspense` affiche indéfiniment son
    //     repli — une page BLANCHE. Constaté sur /app/bulletins, mais aucune page
    //     n'est en cause : ce sont les plus lourdes qui se font prendre.
    //
    // On restreint donc la surveillance au code source. Ces chemins sont des
    // artefacts de construction et des données : les éditer ne doit jamais
    // déclencher de rechargement.
    watch: {
      ignored: [
        '**/packaging/**',
        '**/dist/**',
        '**/out/**',
        '**/server/data/**',
        '**/server/data-demo/**',
        '**/.vercel/**',
        '**/.print-tests/**',
      ],
    },
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
          // NE PAS y remettre les pages (Bulletins, Grades…). Une page nommée
          // dans `manualChunks` entre dans le graphe INITIAL : Vite lui ajoute
          // un <link rel="modulepreload"> dans index.html, et elle est donc
          // téléchargée avant l'écran de connexion — ce qui annule son `lazy()`.
          // Mesuré : les deux entrées retirées font passer le premier
          // chargement de 357 à 259 Ko gzip (npm run perf:bundle).
        },
      },
    },
    // Silence the 500 kB warning (vendor chunk + lazy pages stay under individually)
    chunkSizeWarningLimit: 600,
  },
  };
});
