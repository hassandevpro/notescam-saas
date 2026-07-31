// server/parityGate.js
// GARDE DE PARITÉ Cloud ↔ LAN. Tant que la parité n'est pas établie (désynchro CONNUE),
// on interdit les opérations dangereuses (mise à jour, changement de version) et on
// MARQUE les sauvegardes prises dans cet état. Aucun message générique « Erreur » : on
// dit toujours QUOI diverge.
//
// Source de vérité = le dernier contrôle d'intégrité publié (syncHealth.lastVerify*),
// alimenté automatiquement après chaque synchro. Non applicable si l'école n'est pas
// hybride (pur Cloud ou pur LAN) → aucune garde.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './db.js';
import { isCloudSyncEnabled } from './syncFlag.js';
import { syncHealth } from './syncHealth.js';

function migrated() { return existsSync(join(DATA_DIR, 'server-token.key')); }

// État de parité détaillé (jamais un simple booléen opaque).
export function parityStatus() {
  const applicable = isCloudSyncEnabled() && migrated();
  const h = syncHealth();
  const known = h.lastVerifyOk; // true | false | null(jamais contrôlé)
  const desync = applicable && known === false;
  return {
    applicable,
    ok: !desync,                 // bloquant seulement si désynchro CONNUE
    desync,
    checked: known != null,
    lastVerifyOk: known,
    lastVerifyAt: h.lastVerifyAt || null,
    mismatches: h.lastMismatches || [],
    report: h.lastReport || null,
  };
}

export function parityOk() { return parityStatus().ok; }

// Lève une erreur EXPLICITE (blocked+parity) si une opération sensible est tentée en
// désynchro. L'appelant HTTP renvoie 409 + le détail des tables divergentes.
export function assertParity(action) {
  const st = parityStatus();
  if (st.desync) {
    const e = new Error(`« ${action} » bloqué : Cloud et LAN ne sont pas identiques (${st.mismatches.length} table(s) : ${st.mismatches.join(', ') || '—'}). Réparez la synchronisation (auto-réparation) avant de continuer.`);
    e.blocked = true;
    e.parity = st;
    throw e;
  }
}
