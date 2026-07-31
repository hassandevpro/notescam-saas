// server/updateService.js
// FONDATIONS de la mise à jour automatique (OTA) des serveurs LAN. Cette passe livre :
//   • la VERSION courante (`/api/version`) ;
//   • la DÉTECTION d'une nouvelle version publiée côté Cloud (edge check-update) ;
//   • la GARDE DE PARITÉ : aucune mise à jour tant que Cloud ≠ LAN (réutilise parityGate) ;
//   • un `applyUpdate()` structuré en ÉTAPES ENFICHABLES (download / verifySignature /
//     install / restart) — aujourd'hui `mode:'manual'`, branchables plus tard SANS changer
//     l'API ni la logique de synchronisation.
//
// Rien ici ne télécharge/installe encore : c'est volontaire (packaging Windows signé =
// étape séparée). L'architecture est prête à recevoir la suite.

import { EDGE_BASE } from './cloudEnv.js';
import { appVersion } from './syncAudit.js';
import { parityStatus, assertParity } from './parityGate.js';
import { recordSyncAudit } from './syncAudit.js';

export function currentVersion() { return appVersion(); }

// Étapes du pipeline de mise à jour — points d'extension. Chacune renvoie son état ;
// `handler` sera fourni plus tard (téléchargement réel, vérif signature, etc.).
const STEPS = ['download', 'verifySignature', 'install', 'restart'];
const HANDLERS = {}; // { download: async(release)=>..., ... } — injecté ultérieurement
export function registerUpdateStep(name, handler) { if (STEPS.includes(name)) HANDLERS[name] = handler; }

// Interroge le Cloud pour la dernière version publiée. `edge` injectable (tests).
export async function checkUpdate({ channel = 'stable', edge } = {}) {
  const call = edge || (async (body) => {
    const res = await fetch(`${EDGE_BASE}/check-update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j) throw new Error(`check-update: HTTP ${res.status}`);
    return j;
  });
  return call({ version: currentVersion(), channel });
}

// État complet pour l'UI + le script de mise à jour : version, disponibilité, PARITÉ.
export async function updateStatus(opts = {}) {
  const parity = parityStatus();
  let remote = { available: false, latest: null };
  try { remote = await checkUpdate(opts); } catch (e) { remote = { available: false, latest: null, error: e.message }; }
  return {
    current: currentVersion(),
    latest: remote.latest?.version || null,
    available: !!remote.available,
    mandatory: !!remote.latest?.mandatory,
    stepRequired: !!remote.stepRequired,
    notes: remote.latest?.notes || null,
    // GARANTIE DE PARITÉ : la mise à jour n'est AUTORISÉE que si Cloud = LAN.
    parity,
    allowed: !remote.available ? false : parity.ok,
    error: remote.error || null,
  };
}

// Applique la mise à jour — BLOQUÉE si désynchro (garde de parité). Aujourd'hui, exécute
// les handlers enregistrés s'ils existent, sinon renvoie `mode:'manual'` (l'installeur
// externe prend le relais). Ne change JAMAIS l'API quand les handlers seront branchés.
export async function applyUpdate(opts = {}) {
  assertParity('Mise à jour'); // lève (409) avec le détail des tables si Cloud ≠ LAN
  const status = await updateStatus(opts);
  if (!status.available) return { ok: true, mode: 'up-to-date', current: status.current };

  const steps = {};
  let allManual = true;
  for (const name of STEPS) {
    if (HANDLERS[name]) { allManual = false; try { steps[name] = { ok: true, result: await HANDLERS[name](status.latest) }; } catch (e) { steps[name] = { ok: false, error: e.message }; recordSyncAudit({ kind: 'rollback', ok: false, detail: { stage: name, message: e.message, from: status.current, to: status.latest } }); return { ok: false, mode: 'auto', steps }; } }
    else steps[name] = { ok: null, pending: true }; // handler non branché
  }
  recordSyncAudit({ kind: allManual ? 'verify' : 'rollback', ok: true, detail: { update: true, from: status.current, to: status.latest, mode: allManual ? 'manual' : 'auto' } });
  return { ok: true, mode: allManual ? 'manual' : 'auto', from: status.current, to: status.latest, steps };
}
