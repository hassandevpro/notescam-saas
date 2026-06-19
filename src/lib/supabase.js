import { createClient } from '@supabase/supabase-js';

// Configuration depuis variables d'env Vite (.env.local)
// Fallback sur les valeurs en dur pour développement
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ltxopwoxvgslsgzixbpx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0eG9wd294dmdzbHNneml4YnB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDk5MDEsImV4cCI6MjA5NDE4NTkwMX0.Ti72TVBLtxET3Wmmg3-pzQ0bmXFtf0HvBf7Phl_Hb20';

// Offline-first : aucune requête réseau ne doit pouvoir bloquer l'app
// indéfiniment. supabase-js n'impose AUCUN timeout par défaut ; sur réseau
// capricieux (portail captif, wifi non authentifié, DNS lent, serveur
// injoignable), un fetch peut rester suspendu très longtemps — c'est ce qui
// gelait le démarrage (`authStore.init`) au lieu de retomber sur le cache local.
// On enveloppe fetch avec un AbortController : passé le délai, la requête est
// annulée -> la promesse REJETTE -> le code de repli (cache hors-ligne,
// syncQueue) prend le relais immédiatement.
const NETWORK_TIMEOUT_MS = 12000;

function fetchWithTimeout(input, init = {}) {
  // Respecte un éventuel signal fourni par l'appelant ; sinon, abandon au délai.
  if (init.signal) return fetch(input, init);
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithTimeout },
});
