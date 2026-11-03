// src/lib/syncStatus.js
// UNE règle pour dire « la synchro va bien / attend / a échoué », partagée par
// l'édition LAN et l'édition Cloud. Fonctions PURES : l'horloge est un paramètre,
// pour que la règle se teste sans attendre.
//
// Trois niveaux, que l'administrateur doit pouvoir lire d'un coup d'œil :
//
//   ok       — tout est parti et tout est arrivé, récemment.
//   attente  — rien n'est perdu, mais quelque chose n'est pas encore passé :
//              des lignes en file, un arbitrage à rendre, Internet coupé depuis
//              peu, un cycle en cours.
//   echec    — ça ne passera pas tout seul : le Cloud refuse des lignes (elles
//              sont en quarantaine), une erreur qui dure, des données divergentes,
//              ou plus aucun signe de vie depuis longtemps.
//
// `inactif` n'est pas un niveau de santé : la synchro n'est pas en service
// (école 100 % Cloud, ou LAN non relié). L'interface ne montre alors rien, ou
// un voyant gris — jamais un faux vert.
//
// Pourquoi « Internet coupé » est une ATTENTE d'abord : le travail local continue,
// la file est intacte et reprend toute seule. Ce n'est pas encore une panne.
// Passé SEUIL_ECHEC_MS sans aucun succès, ça le devient : personne n'a vu partir
// la moindre saisie depuis un moment, l'administrateur doit le savoir.

export const SEUIL_FRAIS_MS = 3 * 60 * 1000;        // « synchronisé » tant que le dernier succès a moins de 3 min
export const SEUIL_ECHEC_MS = 15 * 60 * 1000;       // au-delà sans succès : échec

export const NIVEAUX = Object.freeze({ OK: 'ok', ATTENTE: 'attente', ECHEC: 'echec', INACTIF: 'inactif' });

const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };

export function ilYA(iso, now = Date.now()) {
  const t = ms(iso);
  if (t == null) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

function verdict(niveau, libelle, details = []) {
  return { niveau, libelle, details: details.filter(Boolean) };
}

// ── Côté LAN : l'état vient du serveur de l'école (/api/hybrid/status) ───────────
// st = { enabled, migrated, mode, health, pending, quarantined, conflits:{aArbitrer} }
export function statutLan(st, now = Date.now()) {
  if (!st || !st.migrated) return verdict(NIVEAUX.INACTIF, 'Non relié au Cloud');
  if (!st.enabled) return verdict(NIVEAUX.INACTIF, 'Synchronisation désactivée');

  const h = st.health || {};
  const pending = st.pending ?? 0;
  const quarantined = st.quarantined ?? 0;
  const aArbitrer = st.conflits?.aArbitrer ?? 0;
  const dernier = ms(h.lastSuccessAt);
  // Depuis quand rien n'est passé ? Le dernier succès, sinon le DÉMARRAGE du serveur :
  // un serveur rallumé sans Internet n'est pas « en échec depuis toujours », mais s'il
  // tourne depuis des heures sans jamais avoir synchronisé, l'administrateur doit le voir.
  const reference = dernier ?? ms(h.startedAt) ?? now;
  const sansSucces = Math.max(0, now - reference);
  const dernierSucces = h.lastSuccessAt ? `Dernière synchro réussie ${ilYA(h.lastSuccessAt, now)}` : 'Aucune synchro réussie pour l’instant';

  // ── ÉCHEC : ça ne passera pas tout seul ──
  if (quarantined > 0) {
    return verdict(NIVEAUX.ECHEC, 'Échec : lignes refusées par le Cloud', [
      `${pluriel(quarantined, 'ligne mise', 'lignes mises')} de côté après des refus répétés — elles restent à l’école.`,
      dernierSucces,
    ]);
  }
  if (h.lastError && h.lastError.kind !== 'network') {
    return verdict(NIVEAUX.ECHEC, 'Échec de synchronisation', [h.lastError.message, dernierSucces,
      pending ? `${pluriel(pending, 'ligne attend', 'lignes attendent')} d’être envoyée${pending > 1 ? 's' : ''}.` : null]);
  }
  if (st.mode === 'HYBRIDE_MISMATCH' || h.divergenceAlert) {
    const t = h.lastMismatches || [];
    return verdict(NIVEAUX.ECHEC, 'Échec : données divergentes du Cloud', [
      t.length ? `Tables : ${t.join(', ')}` : null, dernierSucces]);
  }
  if (h.lastError && h.lastError.kind === 'network' && sansSucces > SEUIL_ECHEC_MS) {
    return verdict(NIVEAUX.ECHEC, 'Échec : hors ligne depuis longtemps', [
      'Internet indisponible — le travail local continue.', dernierSucces,
      pending ? `${pluriel(pending, 'ligne attend', 'lignes attendent')} le retour du réseau.` : null]);
  }
  if (sansSucces > SEUIL_ECHEC_MS && !h.inFlight) {
    return verdict(NIVEAUX.ECHEC, 'Échec : aucune synchro récente', [dernierSucces]);
  }

  // ── ATTENTE : rien de perdu, pas encore passé ──
  if (h.lastError && h.lastError.kind === 'network') {
    return verdict(NIVEAUX.ATTENTE, 'En attente : Internet indisponible', [
      'Le travail local continue, la synchro reprendra au retour du réseau.', dernierSucces,
      pending ? `${pluriel(pending, 'ligne en attente', 'lignes en attente')} d’envoi.` : null]);
  }
  if (aArbitrer > 0) {
    return verdict(NIVEAUX.ATTENTE, `En attente : ${pluriel(aArbitrer, 'désaccord', 'désaccords')} à trancher`, [
      'Une valeur a été modifiée à l’école et en ligne : à arbitrer dans « Synchronisation ».', dernierSucces]);
  }
  if (pending > 0) {
    return verdict(NIVEAUX.ATTENTE, `En attente : ${pluriel(pending, 'ligne', 'lignes')} à envoyer`, [dernierSucces]);
  }
  if (h.inFlight) return verdict(NIVEAUX.ATTENTE, 'Synchronisation en cours…', [dernierSucces]);
  if (dernier == null || sansSucces > SEUIL_FRAIS_MS) {
    return verdict(NIVEAUX.ATTENTE, dernier == null ? 'En attente du premier cycle' : 'En attente : synchro en retard', [dernierSucces]);
  }

  return verdict(NIVEAUX.OK, 'Synchronisé', [dernierSucces,
    `${h.lastPulled ?? 0} reçue(s) · ${h.lastPushed ?? 0} envoyée(s) au dernier cycle`]);
}

// ── Côté Cloud : l'administrateur ne voit pas le serveur de l'école, il voit ce que
// celui-ci a DIT au Cloud à son dernier appel (table sync_client_state, lue par la
// fonction sync_etat_ecole). Pas de ligne = l'école n'a jamais appelé : inactif.
// etat = { last_pull_at, lan_pending, lan_quarantined, lan_conflicts,
//          lan_last_error, lan_last_error_kind, lan_last_success_at, lan_version }
export function statutCloud(etat, now = Date.now()) {
  if (!etat || !etat.last_pull_at) return verdict(NIVEAUX.INACTIF, 'Pas de serveur d’école relié');

  const vu = ms(etat.last_pull_at);
  const silence = vu == null ? Infinity : now - vu;
  const pending = etat.lan_pending ?? 0;
  const quarantined = etat.lan_quarantined ?? 0;
  const aArbitrer = etat.lan_conflicts ?? 0;
  const signe = `Serveur de l’école vu ${ilYA(etat.last_pull_at, now)}`;
  const version = etat.lan_version ? `Version ${etat.lan_version}` : null;

  if (silence > SEUIL_ECHEC_MS) {
    return verdict(NIVEAUX.ECHEC, 'Échec : serveur de l’école injoignable', [signe,
      'Éteint, hors ligne, ou synchro bloquée. Les saisies faites là-bas arriveront au retour.', version]);
  }
  if (quarantined > 0) {
    return verdict(NIVEAUX.ECHEC, 'Échec : lignes refusées par le Cloud', [
      `${pluriel(quarantined, 'ligne de l’école est refusée', 'lignes de l’école sont refusées')} et ne montera pas sans intervention.`, signe, version]);
  }
  if (etat.lan_last_error && etat.lan_last_error_kind !== 'network') {
    return verdict(NIVEAUX.ECHEC, 'Échec de synchronisation côté école', [etat.lan_last_error, signe, version]);
  }
  if (etat.lan_last_error) {
    return verdict(NIVEAUX.ATTENTE, 'En attente : le serveur de l’école a des difficultés réseau', [etat.lan_last_error, signe,
      pending ? `${pluriel(pending, 'ligne', 'lignes')} en attente d’envoi à l’école.` : null, version]);
  }
  if (aArbitrer > 0) {
    return verdict(NIVEAUX.ATTENTE, `En attente : ${pluriel(aArbitrer, 'désaccord', 'désaccords')} à trancher à l’école`, [signe, version]);
  }
  if (pending > 0) {
    return verdict(NIVEAUX.ATTENTE, `En attente : ${pluriel(pending, 'ligne', 'lignes')} pas encore montée${pending > 1 ? 's' : ''} depuis l’école`, [signe, version]);
  }
  if (silence > SEUIL_FRAIS_MS) {
    return verdict(NIVEAUX.ATTENTE, 'En attente : serveur de l’école silencieux', [signe, version]);
  }
  return verdict(NIVEAUX.OK, 'Synchronisé', [signe, version]);
}
