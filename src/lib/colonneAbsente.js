// QUAND LE CLOUD N'A PAS ENCORE LA COLONNE — logique pure.
//
// ── L'INCIDENT, 2026-10-31 ──────────────────────────────────────────────────
//
//     fee_payments · insert
//     Could not find the 'method' column of 'fee_payments' in the schema cache
//
// `supabase_fee_payment_mode.sql` ajoute `method`, `payer_name` et `reference`
// à `fee_payments`. Le fichier était écrit, mais pas appliqué. L'écran, lui,
// envoyait déjà les trois colonnes. Or PostgREST ne RETIRE pas une colonne
// inconnue : il refuse **la ligne entière** (PGRST204). Conséquence exacte :
// la caissière encaisse 15 000, l'écran dit qu'il a enregistré, et il n'y a
// aucune ligne au Cloud. Ce n'est pas un défaut d'affichage, c'est une recette
// perdue.
//
// ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ─────────────────────────
//
// Il permet de réessayer l'écriture SANS les colonnes d'enrichissement que le
// Cloud ne connaît pas encore. Le versement part alors avec son montant, sa
// date, son élève et son échéance — c'est-à-dire tout ce qui compte pour la
// comptabilité — et le mode de paiement manque, ce que l'écran dit.
//
// Il ne RÉPARE PAS le retard de migration : il empêche seulement qu'un retard
// de migration coûte de l'argent. L'ordre reste celui du dépôt — **Cloud
// d'abord, paquet LAN ensuite** — et le message d'avertissement est volontaire,
// pour que le retard se voie.
//
// ── LA LISTE BLANCHE N'EST PAS UNE PRÉCAUTION DE STYLE ─────────────────────
//
// Seules des colonnes ACCESSOIRES peuvent être abandonnées. Si l'on acceptait
// de retirer n'importe quelle colonne refusée, une ligne finirait par partir
// sans `amount` ou sans `student_id` : un versement fantôme, pire que pas de
// versement. Tout nom hors liste fait donc échouer l'écriture, bruyamment.
//
// MODULE PUR : aucun réseau, aucun Supabase. Banc : `_colonneAbsente.test.mjs`.

// Le code PostgREST d'une colonne inconnue du cache de schéma.
export const CODE_COLONNE_ABSENTE = 'PGRST204';

// Colonnes qu'une écriture peut abandonner sans mentir sur ce qui s'est passé.
// Par table, et nommées une par une — jamais un motif large.
export const COLONNES_ABANDONNABLES = Object.freeze({
  fee_payments: ['method', 'payer_name', 'reference'],
});

// Le nom de la colonne qu'une erreur désigne, ou null.
//
// On lit le message et non un champ structuré : PostgREST met le nom dans
// `message`, et `details` est souvent vide. Les deux formulations rencontrées
// sont « Could not find the 'x' column of 'y' » et, plus ancienne,
// « column "x" of relation "y" does not exist ».
export function colonneManquante(error) {
  if (!error) return null;
  const txt = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  const code = error.code || '';
  // Le code seul ne suffit pas : d'autres erreurs 204 existent. On exige d'avoir
  // su LIRE un nom de colonne, sinon on ne touche à rien.
  const m = txt.match(/'([A-Za-z_][A-Za-z0-9_]*)' column/)
    || txt.match(/column "([A-Za-z_][A-Za-z0-9_]*)"/);
  if (!m) return null;
  if (code && code !== CODE_COLONNE_ABSENTE && !/does not exist|schema cache/i.test(txt)) return null;
  return m[1];
}

// Peut-on abandonner cette colonne sur cette table ?
export function estAbandonnable(table, colonne) {
  if (!table || !colonne) return false;
  return (COLONNES_ABANDONNABLES[table] || []).includes(colonne);
}

// Une copie de la ligne sans les colonnes nommées. La ligne d'origine n'est
// jamais modifiée : l'appelant garde la version complète pour la base locale,
// qui, elle, connaît les colonnes.
export function sansColonnes(ligne, noms = []) {
  const out = { ...(ligne || {}) };
  for (const n of noms) delete out[n];
  return out;
}

// LA DÉCISION, en une fonction : que faire d'une erreur d'écriture ?
//
// Renvoie :
//   { action: 'reessayer', colonne, abandons }  — réécrire sans ces colonnes
//   { action: 'echouer', colonne }              — la colonne compte, on s'arrête
//   { action: 'echouer', colonne: null }        — autre erreur, non traitée ici
//
// `dejaAbandonnees` évite la boucle : une colonne déjà retirée qui revient
// signifie que le serveur dit autre chose, et on s'arrête.
export function decisionEcriture({ table, error, dejaAbandonnees = [] }) {
  const colonne = colonneManquante(error);
  if (!colonne) return { action: 'echouer', colonne: null };
  if (dejaAbandonnees.includes(colonne)) return { action: 'echouer', colonne };
  if (!estAbandonnable(table, colonne)) return { action: 'echouer', colonne };
  return { action: 'reessayer', colonne, abandons: [...dejaAbandonnees, colonne] };
}
