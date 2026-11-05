// CE QUE LE SERVEUR RENVOIE N'EFFACE PAS CE QUI N'EST PAS ENCORE PARTI — fonctions PURES.
//
// ── LE DÉFAUT, SIGNALÉ LE 2026-11-05 ──────────────────────────────────────
//
// « J'ajoute les notes ici, ça ne persiste pas. » Le chargement du primaire faisait
// `set({ primNotes: fresh })` : il REMPLAÇAIT toute la carte par ce que le serveur venait
// de rendre. Une note écrite localement mais pas encore ACCEPTÉE par le serveur — refus
// d'une contrainte, migration Cloud manquante, coupure réseau — est alors effacée de
// l'écran au rafraîchissement suivant. L'enseignante voit sa note s'afficher, puis
// disparaître, et rien ne lui dit pourquoi : elle la ressaisit, elle disparaît encore.
//
// La note n'était PAS perdue (elle attend dans la file d'envoi, et elle est en cache
// local), mais l'écran mentait, ce qui revient au même pour qui saisit.
//
// LA RÈGLE : une note qui attend son envoi gagne contre l'absence du serveur. Le serveur
// reste la référence pour tout le reste — c'est lui qui apporte les saisies des collègues.
//
// Rien ici ne supprime : `fusionnerNotesServeur` ne fait que CHOISIR, et
// `recordsAEcrireEnCache` ne fait qu'ÉCARTER du cache les lignes qui écraseraient une
// note en attente.

/**
 * La carte des notes à afficher, à partir de ce que le serveur rend et de ce que
 * l'appareil n'a pas encore réussi à envoyer.
 *
 * @param {object} serveur   { [nkey]: ligne } — ce que la lecture serveur a rendu.
 * @param {object} local     { [nkey]: ligne } — la carte en mémoire (saisies comprises).
 * @param {Set<string>|string[]} enAttente  les nkey encore dans la file d'envoi.
 * @returns {object} la carte fusionnée. Jamais la même référence qu'une des entrées.
 */
export function fusionnerNotesServeur(serveur, local, enAttente) {
  const attente = enAttente instanceof Set ? enAttente : new Set(enAttente || []);
  const out = { ...(serveur || {}) };
  if (!attente.size) return out;
  const vu = local || {};
  for (const nkey of attente) {
    const ligne = vu[nkey];
    if (ligne) out[nkey] = ligne;      // ce qui attend son envoi reste affiché
  }
  return out;
}

/**
 * Les lignes du serveur qu'on peut écrire dans le cache local sans écraser une note
 * en attente. Le cache est ce qui reste quand l'application redémarre hors ligne :
 * y recopier la version du serveur ferait perdre la saisie pour de bon.
 */
export function recordsAEcrireEnCache(records, enAttente) {
  const attente = enAttente instanceof Set ? enAttente : new Set(enAttente || []);
  if (!attente.size) return records || [];
  return (records || []).filter((r) => !attente.has(r?.nkey));
}

/**
 * Les nkey de `prim_notes` encore dans la file d'envoi, dans l'ordre d'arrivée.
 * `file` est le contenu brut de la file (syncQueueDB.getAll()).
 */
/**
 * Pose ou retire un nkey de la liste des notes non enregistrées, sans doublon.
 * Deux refus de suite sur la même note ne font pas « 2 notes en attente ».
 */
export function majAttenteNkeys(liste, nkey, enAttente) {
  const sansLui = (liste || []).filter((x) => x !== nkey);
  return enAttente ? [...sansLui, nkey] : sansLui;
}

export function nkeysEnAttente(file) {
  const out = [];
  const vus = new Set();
  for (const op of file || []) {
    if (op?.table !== 'prim_notes') continue;
    const k = op.nkey || op.payload?.nkey;
    if (!k || vus.has(k)) continue;
    vus.add(k);
    out.push(k);
  }
  return out;
}

/**
 * LA LIGNE QU'UN REJEU DE FILE DOIT ENVOYER — et surtout, ce qu'il ne doit PAS envoyer.
 *
 * LE DÉFAUT, relevé le 2026-11-05 sur deux captures de l'école (Ayden perd son 20, Bidjo
 * perd son 10, Djomo garde les deux) : régler un barème met en file une opération qui NE
 * PARLE PAS de la note — `sansNote: true` — mais dont la charge porte tout de même
 * `note: null`, parce qu'un record de note est toujours complet. Le chemin direct retire
 * la colonne (`upsertPrimNote`, `sansNote`). LE REJEU, LUI, NE LISAIT PAS `sansNote` :
 * `sansNote` n'apparaissait pas une seule fois dans tout `lib/sync.js`. Il renvoyait la
 * charge entière, l'upsert faisait `ON CONFLICT DO UPDATE SET note = NULL`, et la note
 * qu'une collègue avait saisie entre-temps disparaissait — sans erreur, sans trace : le
 * rejeu « réussissait », donc l'opération était retirée de la file.
 *
 * C'est le même raisonnement que `upsertPrimNote({ sansNote })`, à l'autre bout du
 * chemin. Les deux doivent rester d'accord : une écriture qui ne parle pas de la note ne
 * doit JAMAIS envoyer la colonne `note`, par quelque chemin qu'elle passe.
 */
export function ligneDeRejeu(op) {
  const { nkey, ...row } = op?.payload || {};
  if (op?.sansNote) delete row.note;
  return row;
}

/**
 * Un lot ne peut pas mélanger des lignes qui parlent de la note et des lignes qui n'en
 * parlent pas : un upsert groupé envoie UN jeu de colonnes pour toutes ses lignes, donc
 * la colonne `note` y serait soit imposée à celles qui doivent l'omettre, soit retirée à
 * celles qui doivent l'écrire. Dans les deux cas on perd une note. Le lot est alors
 * refusé, et le rejeu reprend élément par élément — plus lent, et juste.
 */
export function lotRejouableEnBloc(ops) {
  return !(ops || []).some((op) => op?.sansNote);
}
