// server/syncEtat.js
// Ce que le serveur de l'école SAIT de sa propre synchronisation, sous une forme
// que l'écran sait lire : combien de lignes attendent, combien le Cloud a refusées,
// combien de désaccords attendent un arbitrage.
//
// Deux consommateurs, une seule source :
//   · /api/hybrid/status  → le voyant de l'administrateur À L'ÉCOLE ;
//   · le corps de l'appel sync-pull → le voyant de l'administrateur EN LIGNE, qui
//     ne peut pas interroger le serveur de l'école (derrière un routeur) et ne
//     voit donc que ce que celui-ci lui a dit à son dernier appel.
//
// Best-effort absolu : un compteur illisible ne doit jamais faire échouer un
// cycle de synchronisation. On renvoie alors des zéros, jamais une exception.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { compterConflits } from './syncConflits.js';
import { syncHealth } from './syncHealth.js';

let VERSION = '?';
try { VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version || '?'; } catch { /* */ }

const n = (sql) => { try { return db.prepare(sql).get()?.n || 0; } catch { return 0; } };

export function compteursSynchro() {
  let aArbitrer = 0, total = 0;
  try { ({ aArbitrer, total } = compterConflits()); } catch { /* table absente (vieux schéma) */ }
  return {
    pending: n('SELECT COUNT(*) n FROM sync_outbox'),
    quarantined: n('SELECT COUNT(*) n FROM sync_outbox_quarantine'),
    conflits: { aArbitrer, total },
  };
}

// Charge utile jointe à l'appel sync-pull. Courte et sans donnée métier : des
// compteurs, un message d'erreur technique tronqué, une version.
export function etatPourCloud() {
  try {
    const c = compteursSynchro();
    const h = syncHealth();
    return {
      pending: c.pending,
      quarantined: c.quarantined,
      conflicts: c.conflits.aArbitrer,
      lastError: h.lastError?.message ? String(h.lastError.message).slice(0, 200) : null,
      lastErrorKind: h.lastError?.kind || null,
      lastSuccessAt: h.lastSuccessAt || null,
      version: VERSION,
    };
  } catch { return null; }
}
