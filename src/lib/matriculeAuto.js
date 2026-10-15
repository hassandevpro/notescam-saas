// MATRICULE AUTOMATIQUE — maternelle et primaire.
//
// Moteur PUR : aucun store, aucun réseau, aucune base. Il ne fait que lire
// l'effectif déjà connu et proposer le numéro suivant. C'est ce qui lui permet
// de fonctionner à l'identique en cloud et en édition LAN, Internet coupé.
//
// ── POURQUOI PAS UNE SÉQUENCE EN BASE ──────────────────────────────────────
// La solution « propre » côté serveur serait une séquence Postgres ou une table
// de compteurs. Elle est inapplicable ici : l'édition LAN doit inscrire des
// élèves sans Internet, et le cloud ne doit pas être l'arbitre d'un numéro que
// l'école attribue au guichet. On dérive donc le prochain numéro de ce qui est
// DÉJÀ enregistré — l'effectif est de toute façon chargé dans l'écran qui
// inscrit, et une école compte des centaines d'élèves, pas des millions.
//
// ── POURQUOI SEULEMENT MATERNELLE ET PRIMAIRE ──────────────────────────────
// Ce sont les sections où l'enfant arrive SANS numéro d'aucune sorte : le
// secondaire reçoit des élèves qui portent déjà un matricule d'examen ou celui
// de leur ancien établissement, et le réécrire romprait le lien avec leur
// dossier. En maternelle et au primaire, la secrétaire inventait un numéro à la
// main, d'où des trous, des doublons et des formats incohérents dans la même
// école. `sectionAutoMatricule` est la seule porte d'entrée : tout le reste du
// code demande une section, pas un booléen, pour qu'élargir le périmètre un
// jour soit une ligne ici et nulle part ailleurs.
//
// ── FORMAT ─────────────────────────────────────────────────────────────────
//     M250001   maternelle, année 2025-2026, 1er inscrit
//     P250042   primaire,   année 2025-2026, 42e inscrit
//
//   lettre de section + 2 chiffres de l'année d'ouverture + séquence sur 4.
//
// Le compteur est PAR SECTION ET PAR ANNÉE : il repart à 1 chaque rentrée, ce
// qui est la convention des registres scolaires et rend le numéro lisible (on
// sait d'un coup d'œil de quelle promotion vient l'élève). Deux élèves de deux
// années différentes ne peuvent pas collisionner, le préfixe les sépare.
//
// La séquence est sur 4 chiffres mais n'est PAS tronquée au-delà : la 10 000e
// inscription d'une même section donne `P2510000`. Mieux vaut un numéro plus
// long qu'un numéro réutilisé.

// Extension `.js` explicite : ce module est couvert par un test qui tourne sous
// Node (`_matriculeAuto.test.mjs`), et l'ESM de Node ne resout pas les imports
// sans extension, contrairement a Vite.
import { classSectionKey } from '../core/engineResolver.js';

// Sections dont les élèves reçoivent un matricule automatique, et leur lettre.
const LETTRE_PAR_SECTION = {
  maternelle: 'M',
  primaire:   'P',
};

/** Lettre de section, ou null si la section n'est pas concernée. */
export function sectionAutoMatricule(sectionKey) {
  return LETTRE_PAR_SECTION[sectionKey] || null;
}

/** Vrai si cette classe donne droit à un matricule automatique. */
export function classeAutoMatricule(cls) {
  return !!sectionAutoMatricule(classSectionKey(cls));
}

// Deux chiffres de l'année d'OUVERTURE : « 2025-2026 » -> « 25 ».
// Une année mal formée (ou absente) rend null : on préfère ne RIEN proposer
// qu'un matricule portant une année fausse, qui suivrait l'élève sur ses
// bulletins et son certificat de scolarité.
export function anneeCourte(annee) {
  const m = String(annee ?? '').match(/(\d{4})/);
  if (!m) return null;
  return m[1].slice(2);
}

/**
 * Préfixe complet d'une section pour une année donnée, ou null.
 * @param {string} sectionKey  'maternelle' | 'primaire' | …
 * @param {string} annee       « 2025-2026 »
 */
export function matriculePrefixe(sectionKey, annee) {
  const lettre = sectionAutoMatricule(sectionKey);
  const aa = anneeCourte(annee);
  if (!lettre || !aa) return null;
  return `${lettre}${aa}`;
}

// Tous les matricules déjà pris, normalisés pour la comparaison.
// On compare en MAJUSCULES sans espaces : « p250001 » et « P250001 » sont le
// même numéro, et une base qui contient les deux formes ne doit pas conduire à
// en attribuer un troisième identique.
function dejaPris(students) {
  const pris = new Set();
  for (const s of students || []) {
    const m = String(s?.matricule ?? '').trim().toUpperCase();
    if (m) pris.add(m);
  }
  return pris;
}

/**
 * Plus grande séquence déjà attribuée pour ce préfixe.
 *
 * Les matricules qui ne suivent PAS le format sont ignorés — une école qui
 * numérotait « 2025/014 » ou « YDE250086 » à la main garde ses anciens numéros
 * intacts, et la numérotation automatique démarre à côté sans les renommer.
 */
export function derniereSequence(students, prefixe) {
  if (!prefixe) return 0;
  const rx = new RegExp(`^${prefixe}(\\d+)$`);
  let max = 0;
  for (const s of students || []) {
    const m = String(s?.matricule ?? '').trim().toUpperCase().match(rx);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

const formate = (prefixe, n) => `${prefixe}${String(n).padStart(4, '0')}`;

/**
 * Prochain matricule libre pour une section et une année.
 *
 * @param {Array}  students   effectif connu de l'école (toutes sections)
 * @param {object} opts
 *   @param {string} opts.section  clé de section ('maternelle' | 'primaire')
 *   @param {string} opts.annee    « 2025-2026 »
 *   @param {Set}    [opts.reserves] matricules déjà attribués dans le LOT en
 *          cours mais pas encore enregistrés (import de plusieurs élèves).
 * @returns {string|null} le matricule, ou null si la section n'est pas concernée
 *          ou si l'année est inexploitable.
 */
export function prochainMatricule(students, { section, annee, reserves = null } = {}) {
  const prefixe = matriculePrefixe(section, annee);
  if (!prefixe) return null;

  const pris = dejaPris(students);
  if (reserves) for (const r of reserves) pris.add(String(r).trim().toUpperCase());

  // On part du plus grand numéro connu, puis on avance jusqu'à trouver un libre.
  // La boucle n'est pas décorative : si un numéro de la plage a été saisi à la
  // main (ou libéré par une suppression suivie d'une ressaisie), `max + 1` peut
  // être déjà pris. Elle garantit qu'on ne rend JAMAIS un matricule occupé.
  let n = derniereSequence(students, prefixe) + 1;
  let candidat = formate(prefixe, n);
  while (pris.has(candidat.toUpperCase())) {
    n += 1;
    candidat = formate(prefixe, n);
  }
  return candidat;
}

/**
 * Prochain matricule pour une CLASSE donnée (résout la section elle-même).
 * C'est la forme qu'utilise l'écran d'inscription : il connaît la classe
 * choisie, pas la section.
 */
export function prochainMatriculePourClasse(students, cls, annee, reserves = null) {
  return prochainMatricule(students, { section: classSectionKey(cls), annee, reserves });
}

/**
 * Attribue un matricule aux lignes d'un IMPORT qui n'en ont pas.
 *
 * Pourquoi ici et pas seulement dans le formulaire : une école importe sa liste
 * de maternelle depuis un tableur où la colonne matricule est vide — c'est même
 * le cas le plus fréquent, puisque c'est précisément le numéro qu'elle n'a pas
 * encore. Sans cette étape, l'import créait des centaines d'élèves sans numéro
 * qu'il fallait reprendre un par un.
 *
 * RÈGLES :
 *   • une ligne qui PORTE déjà un matricule n'est jamais touchée — le fichier
 *     de l'école fait foi, même si son format diffère ;
 *   • une ligne sans classe résolue n'en reçoit pas : la section est inconnue,
 *     donc la lettre aussi ;
 *   • les numéros attribués dans le lot sont réservés au fur et à mesure, pour
 *     que deux élèves du même lot ne reçoivent pas le même.
 *
 * @param {Array} rows        lignes d'import ({ matricule, class_id, … })
 * @param {object} opts
 *   @param {Array}    opts.students  effectif déjà en base
 *   @param {Array}    opts.classes   classes de l'école (pour résoudre la section)
 *   @param {string}   opts.annee     « 2025-2026 »
 * @returns {{ rows: Array, attribues: number }}
 */
export function attribuerMatriculesImport(rows, { students = [], classes = [], annee } = {}) {
  const classeParId = new Map((classes || []).filter(Boolean).map((c) => [c.id, c]));
  const reserves = new Set();
  let attribues = 0;

  const sorties = (rows || []).map((row) => {
    if (!row) return row;
    if (String(row.matricule ?? '').trim()) return row;      // déjà numéroté
    const cls = classeParId.get(row.class_id);
    if (!cls) return row;                                     // section inconnue
    const mat = prochainMatriculePourClasse(students, cls, annee, reserves);
    if (!mat) return row;                                     // section hors périmètre
    reserves.add(mat);
    attribues += 1;
    return { ...row, matricule: mat };
  });

  return { rows: sorties, attribues };
}

/**
 * RATTRAPAGE — élèves DÉJÀ INSCRITS de maternelle/primaire sans matricule.
 *
 * Pourquoi c'est nécessaire, et pourquoi c'est séparé du formulaire : le
 * remplissage automatique ne joue qu'à l'inscription et à l'import. Une école
 * qui installe cette version a donc son effectif EXISTANT inchangé — des
 * centaines d'élèves de primaire sans numéro, qu'il faudrait reprendre un par
 * un. Cette fonction calcule le lot d'un coup, sans rien écrire.
 *
 * Fonction PURE : elle ne décide pas, elle PROPOSE. L'écran affiche le plan,
 * l'utilisateur confirme, et c'est l'appelant qui écrit. Une attribution de
 * matricule en masse ne doit pas partir d'un clic involontaire.
 *
 * RÈGLES, identiques au reste du module :
 *   • seuls maternelle et primaire ;
 *   • un élève qui porte DÉJÀ un matricule n'est jamais touché, quel que soit
 *     son format ;
 *   • un élève sans classe est ignoré (section inconnue) ;
 *   • l'ordre est alphabétique par classe puis par nom, pour que les numéros
 *     suivent la liste d'appel au lieu de l'ordre d'insertion en base — c'est
 *     ce qu'attend un registre matricule.
 *
 * @param {Array}  students   effectif COMPLET de l'école (actifs + archivés)
 * @param {Array}  classes    classes de l'école
 * @param {string} annee      « 2025-2026 »
 * @returns {{ plan: Array<{id, name, classe, matricule}>, parSection: object }}
 */
export function planRattrapageMatricules(students, classes, annee) {
  const classeParId = new Map((classes || []).filter(Boolean).map((c) => [c.id, c]));

  const candidats = (students || []).filter((s) => {
    if (!s || String(s.matricule ?? '').trim()) return false;
    const cls = classeParId.get(s.class_id);
    return !!cls && !!sectionAutoMatricule(classSectionKey(cls));
  });

  // Ordre du registre : par classe, puis par nom.
  candidats.sort((a, b) => {
    const ca = classeParId.get(a.class_id)?.name || '';
    const cb = classeParId.get(b.class_id)?.name || '';
    return ca.localeCompare(cb, undefined, { numeric: true })
      || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });

  const reserves = new Set();
  const plan = [];
  const parSection = {};
  for (const s of candidats) {
    const cls = classeParId.get(s.class_id);
    const mat = prochainMatriculePourClasse(students, cls, annee, reserves);
    if (!mat) continue;
    reserves.add(mat);
    const section = classSectionKey(cls);
    parSection[section] = (parSection[section] || 0) + 1;
    plan.push({ id: s.id, name: s.name, classe: cls.name, matricule: mat });
  }
  return { plan, parSection };
}
