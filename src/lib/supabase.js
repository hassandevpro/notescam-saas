import { createClient } from '@supabase/supabase-js';

// Adresse et clé anonyme : source unique, cf. `supabaseEnv.js` (une copie
// divergente y avait mis `''` et faisait tomber /app/students).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseEnv';

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
