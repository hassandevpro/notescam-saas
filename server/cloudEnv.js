// server/cloudEnv.js
// URL + clé anon du projet cloud, pour l'édition LAN (migration Cloud↔Local,
// pont d'identifiants, sync continue). La clé anon est PUBLIQUE par conception
// (mêmes valeurs que src/lib/supabase.js) — l'embarquer ici évite toute config
// d'env pour que l'assistant « Activer NotesCam Cloud » fonctionne d'emblée.
// `process.env` reste prioritaire : on peut pointer un autre projet sans recompiler.
export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20';

export const EDGE_BASE = SUPABASE_URL + '/functions/v1';
