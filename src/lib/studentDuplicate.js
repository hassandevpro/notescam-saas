// ════════════════════════════════════════════════════════════════════════════
// DOUBLONS D'ÉLÈVES — L'ADAPTATEUR DU CHEMIN DE SAISIE
// ════════════════════════════════════════════════════════════════════════════
// Le MOTEUR vit dans `src/core/doublonsEleves.js` : trois niveaux, lieu de
// naissance, renforts, fratrie, scan de toute la base. Ce fichier ne garde que
// ce que les écrans et le store appellent déjà, et le traduit.
//
// CE QUI A CHANGÉ ICI, ET POURQUOI. Les deux fonctions de ce fichier lisaient
// `candidat.birth_date` et `s.birth_date`. La colonne s'appelle
// `date_naissance` : il n'y a jamais eu de `birth_date` dans ce dépôt, ni en
// SQLite, ni en Postgres, ni dans les imports. Toutes les règles qui tenaient à
// la date de naissance étaient donc mortes, et il ne restait que :
//
//     « même nom + aucune date des deux côtés → BLOCK »
//
// — ce qui explique les deux symptômes rapportés le 2026-11-01 : la détection
// paraissait porter sur le nom seul, et deux VRAIS homonymes étaient refusés à
// l'inscription. Le banc d'essai du fichier ne l'a pas vu parce que ses jeux
// d'essai écrivaient `birth_date` eux aussi : le test validait la faute.
//
// `DUP` est conservé parce que `pages/Students.jsx` s'en sert, mais la
// correspondance a changé de sens :
//
//   DUP.BLOCK  n'est plus « très probablement le même enfant » : c'est « la
//              même SAISIE », au sens de `estMemeFiche` — même matricule, ou nom
//              identique au caractère près avec la même date et le même lieu.
//              Seul l'IMPORT s'en sert, pour ne pas recréer un élève à chaque
//              rejeu d'un fichier. À l'écran, la secrétaire tranche toujours :
//              « Alerte, jamais blocage » (consigne du 2026-11-01).
//
//   DUP.WARN   couvre les deux niveaux d'alerte du moteur (FORT et VERIFIER).
//              Les écrans qui veulent la nuance appellent le moteur.
export {
  normNom as normName,
  normTel as normPhone,
  normDate as normBirth,
  NIVEAU,
  comparerEleves,
  doublonsPourCandidat,
  detecterDoublons,
  phraseAlerte,
  marquerNonDoublon,
  lireNonDoublons,
  pairesNonDoublons,
  clePaire,
} from '../core/doublonsEleves';

import {
  NIVEAU, doublonsPourCandidat, estMemeFiche, phraseAlerte, nomsProches,
} from '../core/doublonsEleves';

export const DUP = Object.freeze({
  NONE:  'none',
  WARN:  'warn',
  BLOCK: 'block',
});

// Conservée pour l'ancien banc d'essai : « X JUNIOR » face à « X », prénoms
// inversés, un prénom en plus. Le moteur en dit plus (fautes de frappe, écart
// de mots), mais la question posée est la même.
export const isNameVariant = (a, b) => nomsProches(a, b).proche;

/**
 * Confronte un élève en cours de saisie au registre existant.
 *
 * @param {object} candidat  { id?, name, date_naissance?, lieu_naissance?,
 *                             matricule?, parent_phone?, adresse?, quartier?,
 *                             nom_pere?, nom_mere?, tuteur?, non_doublons? }
 * @param {Array}  registre  élèves déjà enregistrés (actifs ET archivés)
 * @returns {{ level: string, matches: Array, reason: string|null, niveau: string }}
 */
export function checkDuplicate(candidat, registre = []) {
  const r = doublonsPourCandidat(candidat, registre);
  if (!r.candidats.length) {
    return { level: DUP.NONE, matches: [], reason: null, niveau: NIVEAU.AUCUN, candidats: [] };
  }
  // `matches` garde la forme attendue par les écrans : { student, on }.
  const matches = r.candidats.map((c) => ({
    student: c.eleve,
    on: (c.raisons || []).join(', '),
    niveau: c.niveau,
    renforts: c.renforts,
  }));
  return {
    level: DUP.WARN,                      // jamais BLOCK : l'écran fait confirmer
    niveau: r.niveau,                     // 'fort' | 'verifier', pour nuancer le message
    matches,
    candidats: r.candidats,
    reason: phraseAlerte(r.candidats[0]),
  };
}

// ── GARDE DE CRÉATION — le même enfant ne doit pas naître deux fois ─────────
//
// CE QUE CECI FERME. L'écran de saisie prévenait avant d'enregistrer, mais
// l'IMPORT DE FICHIER, lui, ne passait par AUCUN contrôle : `ImportPanel` boucle
// `for (const row of rows) await onImport(row)` et `onImport` est `addStudent`.
// Réimporter le même fichier — ou un fichier qui répète une ligne — créait donc
// autant de dossiers que d'imports : deux pensions dues, deux bulletins, un
// effectif faux.
//
// Ce qu'il NE refuse PAS, volontairement :
//   • une ligne qui porte l'id d'un élève DÉJÀ présent : c'est une réécriture
//     (restauration depuis la corbeille, rejeu de synchro), pas une création ;
//   • tout ce qui n'est qu'une RESSEMBLANCE : nom proche, date à un chiffre
//     près, lieu absent. La secrétaire voit l'alerte et tranche — elle est la
//     seule à savoir si ce sont deux enfants. Deux jumeaux, deux homonymes et
//     une faute de frappe se ressemblent beaucoup, vus de la base.
//   • un appel qui porte `doublonConfirme` : la décision a DÉJÀ été prise à
//     l'écran, et la redemander ici reviendrait à bloquer ce qu'on vient
//     d'autoriser.
//
//   candidat : l'élève à créer      registre : élèves actifs ET archivés
export function peutCreerEleve(candidat, registre = [], options = {}) {
  const id = candidat?.id ?? null;
  if (options.doublonConfirme) return { ok: true, raison: null, existant: null };
  // Réécriture d'une ligne connue : jamais un doublon.
  if (id && registre.some((s) => s?.id === id)) return { ok: true, raison: null, existant: null };

  const jumeau = (registre || []).find((s) => estMemeFiche({ ...candidat, id }, s));
  if (!jumeau) return { ok: true, raison: null, existant: null };
  return {
    ok: false,
    raison: jumeau.matricule && candidat?.matricule
      ? 'Ce matricule est déjà attribué à un autre élève.'
      : 'Cet élève est déjà inscrit (même nom, même date et même lieu de naissance).',
    existant: jumeau,
  };
}
