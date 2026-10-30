// L'ADRESSE ET LA CLÉ ANONYME DU CLOUD, ÉCRITES UNE SEULE FOIS.
//
// POURQUOI CE FICHIER EXISTE. Ces deux valeurs étaient recopiées dans quatre
// modules (`supabase.js`, `staffAccounts.js`, `parentAccounts.js` et
// `Teachers.jsx`). Trois copies portaient la clé de repli ; la quatrième —
// `parentAccounts.js` — s'était mise à `''`. Or `createClient()` est appelé au
// CHARGEMENT DU MODULE, et supabase-js lève `supabaseKey is required.` sur une
// clé vide : il suffisait donc d'ouvrir un écran qui importe ce module
// (`/app/students`) pour faire tomber l'application entière, avant même qu'une
// ligne de code métier ne s'exécute. Une copie qui dérive ne se voit pas ; une
// constante partagée, si.
//
// POURQUOI UN REPLI EN DUR, ET POURQUOI C'EST SANS DANGER. La clé `anon` est
// PUBLIQUE par construction : elle part dans le bundle, elle est visible par
// tout navigateur, et seules les policies RLS décident de ce qu'elle peut lire.
// Le repli évite qu'un poste sans `.env.local` complet ne démarre pas du tout.
// Rien de secret ne doit jamais rejoindre ce fichier — la clé `service_role`
// n'a rien à faire côté client.
//
// POURQUOI PAS DANS `supabase.js`. En édition LAN, `vite.config.js` redirige
// tout import se terminant par `/supabase` vers `src/lib/localClient.js` : une
// constante exportée de là serait introuvable hors ligne. Le nom de ce
// fichier-ci ne se termine pas par `/supabase`, l'alias ne le capture pas, et
// les trois clients secondaires peuvent l'importer dans les deux éditions.

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20';

// Les trois clients « anonymes » (personnel, parents, enseignants) partagent
// exactement ces options : créer un compte auth SANS déconnecter la personne
// déjà connectée au secrétariat.
export const ANON_CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
