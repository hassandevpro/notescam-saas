// FUSION BILINGUE — les matières d'une classe qui suit LES DEUX sous-systèmes.
//
// DEMANDE (THE GENIUS, 2026-10-19) : « Nous avons 4 salles de classes bilingues,
// il faudrait que les unités d'apprentissage des matières ANGLOPHONES se
// retrouvent sur les classes bilingues. Fusionne les classes anglophones avec
// les classes francophones de tous les systèmes, classique comme APC, et laisse
// le choix d'ajouter ou de retirer une matière pour faire la classe bilingue. »
//
// CE QUE DIT LA BASE DE PRODUCTION (relevé le 2026-10-19, lecture seule).
// Les quatre classes concernées sont `SIL BIL`, `CP BIL`, `CE1 BIL`, `CE2 BIL` :
// `system = 'FR'`, `cycle = 'primaire'`, et elles portent EXACTEMENT les onze
// matières francophones de leurs classes jumelles — pas une seule matière
// anglophone. Les classes anglophones de la même école (`Class 1 A`…`Class 6`)
// portent, elles, douze matières /100. Une classe bilingue n'avait donc aucun
// moyen de porter les deux programmes.
//
// POURQUOI CELA SUFFIT À FAIRE APPARAÎTRE LES UNITÉS D'APPRENTISSAGE. Le
// périmètre du référentiel national d'une classe se déduit de ses lignes
// `subjects` (`src/core/refClassScope.js`) : une compétence du référentiel ne
// s'affiche à la saisie et au bulletin que si la classe porte la matière
// correspondante. « Communicate in English » et les autres lignes anglophones
// restaient donc invisibles sur une classe qui ne portait que des libellés
// francophones. Poser les matières anglophones sur la classe fait entrer leurs
// compétences — et donc leurs UA — par le chemin qui existe déjà.
//
// BARÈMES — décision du responsable, 2026-10-19 : « pour le système classique
// /100, pour l'APC ministériel les barèmes du ministère ». Chaque côté garde
// donc le barème de son monde : /20 en francophone, /100 en anglophone. En APC
// (primaire, premier cycle, maternelle), `subjects.max` ne sert pas au calcul —
// les points viennent du référentiel (`points_max` par critère) — mais on écrit
// la même valeur que les classes existantes de l'école pour rester cohérent.
//
// CE MODULE EST PUR : aucun React, aucune base. Il dit QUELLES matières
// composent la classe bilingue ; l'écran décide ce qu'il en coche, et le magasin
// écrit. C'est voulu : la même réponse doit servir la création de classe, la
// saisie et le bulletin, sans être recalculée trois fois.

import { defaultClassicSubjects } from './classicSubjects.js';
// Les correspondances de niveau FR↔EN vivent déjà là : un seul slug pour
// « Class 3 » et « CE1 ». On ne les redéfinit pas, on les lit.
import {
  maternelleNiveauSlug, primaireNiveauSlug,
  firstCycleClasseSlug, secondCycleClasseSlug,
} from './engineResolver.js';

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const BAREME_FR = 20;
export const BAREME_EN = 100;

// ÉQUIVALENCES CURATÉES entre les deux sous-systèmes camerounais. Elles ne
// servent QU'À PRÉVENIR : « cette matière anglophone recouvre celle-ci ».
// Rien n'est retiré d'office — c'est l'école qui tranche, matière par matière,
// parce que la réponse dépend de son organisation réelle (une classe bilingue
// peut parfaitement enseigner les mathématiques dans les deux langues, et c'est
// même le cas à THE GENIUS).
//
// Chaque entrée : [libellés francophones, libellés anglophones]. Les libellés
// sont comparés normalisés (sans accents ni ponctuation), donc « Arts / Dessin »
// reconnaît « arts dessin ».
const EQUIVALENCES = [
  [['francais', 'francais langue'], ['french', 'french language']],
  [['anglais'], ['english', 'english language', 'english literature']],
  [['mathematiques'], ['mathematics', 'maths']],
  [['eveil scientifique svt', 'svt', 'sciences physiques'], ['science', 'biology', 'physics', 'chemistry']],
  [['histoire geographie', 'histoire', 'geographie'], ['social studies', 'history', 'geography']],
  [['ecm', 'education civique et morale'], ['citizenship']],
  [['tic', 'informatique'], ['computer studies', 'computer science']],
  [['arts dessin', 'arts'], ['arts', 'art']],
  [['musique'], ['music']],
  [['eps', 'education physique et sportive'], ['physical education', 'pe']],
  [['chinois'], ['chinese']],
  [['philosophie'], ['philosophy']],
  [['technologie'], ['technology']],
];

// Libellé anglophone → libellé francophone équivalent, et réciproquement.
function equivalentDe(nom, cote, autreCote) {
  const n = norm(nom);
  for (const [fr, en] of EQUIVALENCES) {
    const source = cote === 'FR' ? fr : en;
    const cible  = cote === 'FR' ? en : fr;
    if (!source.includes(n)) continue;
    const trouve = autreCote.find((m) => cible.includes(norm(m.name)));
    if (trouve) return trouve.name;
  }
  return null;
}

/**
 * Les deux troncs d'une classe bilingue, côte à côte.
 *
 * @param {object} cls  classe en cours de création ou existante (level, name, serie, system…)
 * @returns {Array<{ name, coef, max, cote: 'FR'|'EN', equivalent: string|null, retenue: boolean }>}
 *   `cote`       — sous-système d'origine de la matière ;
 *   `equivalent` — libellé de la matière de l'AUTRE côté qu'elle recouvre, s'il y en a une ;
 *   `retenue`    — proposition par défaut (tout est retenu : « fusionne les deux »).
 *   Liste vide si le niveau n'a pas de tronc classique (système ES, par exemple).
 */
export function bilingualSubjectChoices(cls) {
  if (!cls) return [];
  // La fusion bilingue est FR↔EN : c'est le programme camerounais. Une école de
  // Guinée équatoriale (système 'ES') a son propre cursus et aucun tronc
  // classique auto-configuré — on ne lui propose donc rien, comme
  // `defaultClassicSubjects` qui lui renvoie déjà une liste vide.
  if (String(cls.system || '').toUpperCase() === 'ES') return [];
  const fr = defaultClassicSubjects({ ...cls, system: 'FR' });
  const en = defaultClassicSubjects({ ...cls, system: 'EN' });
  if (!fr.length && !en.length) return [];

  const choix = [];
  const vus = new Set();                       // deux matières de MÊME libellé sont impossibles
  const pousser = (rows, cote, autre, max) => {
    for (const r of rows) {
      const n = norm(r.name);
      if (!n || vus.has(n)) continue;          // ex. « Arts » existe des deux côtés : une seule ligne
      vus.add(n);
      choix.push({
        name: r.name,
        coef: r.coef || 1,
        max,
        cote,
        equivalent: equivalentDe(r.name, cote, autre),
        retenue: true,
      });
    }
  };
  // Francophone d'abord : c'est l'ordre des bulletins de ces classes aujourd'hui.
  pousser(fr, 'FR', en, BAREME_FR);
  pousser(en, 'EN', fr, BAREME_EN);
  return choix;
}

/**
 * Enregistrements `subjects` d'une classe bilingue, prêts à écrire.
 *
 * @param {object}   p.cls        la classe (doit porter `id` et `school_id`)
 * @param {Function} p.makeId     fabrique d'identifiants (uuid côté app, séquence côté tests)
 * @param {Array}    [p.keep]     libellés retenus par l'école ; toutes les matières si omis
 * @param {Object}   [p.coefs]    surcharges de coefficient par libellé
 * @returns {Array} lignes `subjects` ordonnées (`position`), ou [] si rien à créer
 */
export function buildSubjectsForBilingualClass({ cls, makeId, keep = null, coefs = null }) {
  if (!cls?.id) return [];
  const voulu = keep ? new Set(keep.map(norm)) : null;
  return bilingualSubjectChoices(cls)
    .filter((c) => !voulu || voulu.has(norm(c.name)))
    .map((c, i) => ({
      id: makeId(),
      school_id: cls.school_id,
      class_id: cls.id,
      name: c.name,
      coef: Number(coefs?.[c.name] ?? c.coef) || 1,
      max: c.max,
      position: i,
    }));
}

// ════════════════════════════════════════════════════════════════════════════
// FUSION À PARTIR DE LA CLASSE JUMELLE RÉELLE — c'est le cas d'usage de l'école
// ════════════════════════════════════════════════════════════════════════════
//
// « CE1 BIL = fusion des matières de Class 1 + CE1 » (THE GENIUS, 2026-10-19).
// Autrement dit : pas un tronc type, mais les matières TELLES QUE L'ÉCOLE les a
// posées sur ses deux classes jumelles — avec leurs coefficients et leurs
// barèmes à elle, et jusqu'aux matières qui ne figurent à aucun référentiel
// (« Travaux Pratiques », « Chinois »… relevées en production).
//
// LA CORRESPONDANCE DES NIVEAUX N'EST PAS DEVINÉE. L'équivalence officielle
// camerounaise donne SIL↔Class 1, CP↔Class 2, CE1↔Class 3… mais THE GENIUS
// apparie CE1 avec Class 1. Les deux organisations sont légitimes, et se
// tromper poserait les mauvaises matières sur une classe d'enfants. On PROPOSE
// donc la liste des classes de l'autre sous-système et c'est l'école qui
// désigne la jumelle.

// LES CORRESPONDANCES DE NIVEAU SONT CELLES DU DÉPÔT, PAS DES MIENNES.
//
// `engineResolver` les porte déjà, parce que les référentiels nationaux en
// dépendent : `primaireNiveauSlug` rend le MÊME slug pour « Class 1 » et
// « SIL », « Class 3 » et « CE1 » (1→SIL, 2→CP, 3→CE1, 4→CE2, 5→CM1, 6→CM2) ;
// `maternelleNiveauSlug` aligne Nursery 1/2/3 sur PS/MS/GS ;
// `secondCycleClasseSlug` aligne Lower/Upper Sixth sur 1ère/Terminale. Deux
// classes jumelles ont donc, déjà, la même clé — et ces fonctions sont
// couvertes par les tests du dépôt.
//
// UNE SEULE équivalence manquait : le PREMIER CYCLE, où les deux sous-systèmes
// gardent volontairement des slugs distincts ('6e'…'3e' contre 'form1'…'form5')
// parce que leurs référentiels sont distincts. On la pose ici, et seulement ici.
// Form 5 (fin du O-Level) tombe en face de la Seconde, donc dans le second
// cycle : c'est l'équivalence usuelle au Cameroun, et c'est déjà celle que
// `secondCycleClasseSlug` applique à Lower/Upper Sixth.
const EQUIV_PREMIER_CYCLE = {
  form1: 'fc:6e', form2: 'fc:5e', form3: 'fc:4e', form4: 'fc:3e', form5: 'sc:2nde',
};

/**
 * Clé de niveau PARTAGÉE par les deux sous-systèmes : deux classes jumelles la
 * partagent, quelle que soit la langue de leur libellé. `null` si le niveau
 * n'est reconnu par aucun référentiel.
 */
export function niveauPartage(cls) {
  const level = cls?.level || '';
  const name = cls?.name || '';
  const mat = maternelleNiveauSlug(level, name);
  if (mat) return `mat:${mat}`;
  const prim = primaireNiveauSlug(level, name);
  if (prim) return `prim:${prim}`;
  const fc = firstCycleClasseSlug(level, name);
  if (fc) return EQUIV_PREMIER_CYCLE[fc] || `fc:${fc}`;
  const sc = secondCycleClasseSlug(level, name);
  if (sc) return `sc:${sc}`;
  return null;
}

/**
 * Les classes de l'AUTRE sous-système avec lesquelles `cls` peut fusionner —
 * **celles du niveau équivalent en tête**, les autres ensuite. Même cycle et
 * même année, la classe elle-même exclue.
 *
 * On ne réduit PAS la liste au niveau équivalent : une école peut apparier
 * autrement que le ministère (effectifs, classe unique, section spéciale), et
 * lui cacher les autres classes la bloquerait. Le choix reste le sien, mais le
 * niveau juste est proposé d'abord et `equivalent: true` le dit.
 *
 * @returns {Array} les classes candidates, chacune augmentée de `equivalent`
 */
export function siblingClassCandidates(cls, classes = []) {
  if (!cls) return [];
  const coteCls = String(cls.system || 'FR').toUpperCase() === 'EN' ? 'EN' : 'FR';
  const autre = coteCls === 'EN' ? 'FR' : 'EN';
  const cycle = cls.cycle || null;
  const annee = cls.current_year || null;
  const cle = niveauPartage(cls);
  return (classes || []).filter((c) => c
    && c.id && c.id !== cls.id
    && (String(c.system || 'FR').toUpperCase() === autre)
    && (!cycle || (c.cycle || 'secondaire') === cycle)
    && (!annee || !c.current_year || c.current_year === annee))
    .map((c) => ({ ...c, equivalent: !!cle && niveauPartage(c) === cle }))
    .sort((a, b) => (Number(b.equivalent) - Number(a.equivalent))
      || String(a.name || '').localeCompare(String(b.name || '')));
}

/**
 * La classe jumelle à proposer par défaut : celle du niveau équivalent. Si
 * l'école en a plusieurs au même niveau (Class 3 A et Class 3 B), la première
 * par ordre de nom — l'écran laisse changer. `null` si aucune ne correspond :
 * mieux vaut faire choisir que poser les matières d'un autre niveau.
 */
export function defaultSiblingClass(cls, classes = []) {
  return siblingClassCandidates(cls, classes).find((c) => c.equivalent) || null;
}

// Barème d'une matière de la jumelle : celui que l'école a posé. On ne le
// réécrit pas — un /100 reste un /100, et le bulletin le normalise déjà
// (bulletinEngine.calcFR). Faute de valeur, on retombe sur le côté.
const baremeOuDefaut = (sub, cote) => Number(sub?.max) || (cote === 'EN' ? BAREME_EN : BAREME_FR);

/**
 * La fusion réelle : les matières de la classe + celles de sa jumelle,
 * dédoublonnées par libellé (la classe garde les siennes).
 *
 * @param {object} p.cls
 * @param {Array}  p.classSubjects    matières de la classe
 * @param {object} p.sibling          la classe jumelle choisie par l'école
 * @param {Array}  p.siblingSubjects  ses matières
 * @returns {Array<{ name, coef, max, cote, origine: 'classe'|'jumelle', deja: boolean }>}
 */
export function mergeFromSiblingClass({ cls, classSubjects = [], sibling = null, siblingSubjects = [] }) {
  const coteCls = String(cls?.system || 'FR').toUpperCase() === 'EN' ? 'EN' : 'FR';
  const coteJum = String(sibling?.system || (coteCls === 'EN' ? 'FR' : 'EN')).toUpperCase() === 'EN' ? 'EN' : 'FR';
  const out = [];
  const vus = new Set();
  for (const s of classSubjects || []) {
    const n = norm(s?.name);
    if (!n || vus.has(n)) continue;
    vus.add(n);
    out.push({
      name: s.name, coef: Number(s.coef) || 1, max: baremeOuDefaut(s, coteCls),
      cote: coteCls, origine: 'classe', deja: true,
    });
  }
  for (const s of siblingSubjects || []) {
    const n = norm(s?.name);
    if (!n || vus.has(n)) continue;       // déjà portée : la classe fait foi
    vus.add(n);
    out.push({
      name: s.name, coef: Number(s.coef) || 1, max: baremeOuDefaut(s, coteJum),
      cote: coteJum, origine: 'jumelle', deja: false,
    });
  }
  return out;
}

/**
 * Les lignes `subjects` à créer pour que la classe porte aussi le programme de
 * sa jumelle. N'ajoute QUE ce qui manque : aucune matière en place n'est
 * touchée, donc aucune note existante n'est menacée, et rejouer le geste ne
 * double rien.
 *
 * @param {Array} [p.keep]  libellés retenus par l'école (tous si omis)
 */
export function missingFromSiblingClass({ cls, classSubjects = [], sibling = null, siblingSubjects = [], makeId, keep = null }) {
  if (!cls?.id) return [];
  const voulu = keep ? new Set(keep.map(norm)) : null;
  const base = (classSubjects || []).length;
  return mergeFromSiblingClass({ cls, classSubjects, sibling, siblingSubjects })
    .filter((c) => !c.deja && (!voulu || voulu.has(norm(c.name))))
    .map((c, i) => ({
      id: makeId(),
      school_id: cls.school_id,
      class_id: cls.id,
      name: c.name,
      coef: c.coef,
      max: c.max,
      position: base + i,
    }));
}

/**
 * Cette classe porte-t-elle DÉJÀ les deux programmes ? Sert à rouvrir l'écran
 * d'une classe bilingue dans l'état où l'école l'a laissée, sans avoir à poser
 * une colonne en base : la liste des matières EST la marque du bilinguisme.
 *
 * @param {object} cls
 * @param {Array}  classSubjects  lignes `subjects` de la classe
 */
export function isBilingualClass(cls, classSubjects = []) {
  const choix = bilingualSubjectChoices(cls);
  if (!choix.length || !classSubjects.length) return false;
  const portees = new Set(classSubjects.map((s) => norm(s?.name)));
  const cotePresente = (cote) => choix.some((c) => c.cote === cote && portees.has(norm(c.name)));
  return cotePresente('FR') && cotePresente('EN');
}

/**
 * Catalogue de matières proposé à une classe bilingue : celui de son propre
 * sous-système, PLUS celui de l'autre, chaque entrée avec le barème de son
 * monde. Les deux catalogues restent définis par l'écran (ils dépendent du
 * pays) ; ce qui est ici, c'est la règle de fusion — dédoublonnage par libellé
 * normalisé et barème par côté.
 *
 * @param {object} p.cls              la classe (son `system` dit quel côté est le sien)
 * @param {Array<string>} p.catalogueFr  libellés francophones proposables
 * @param {Array<string>} p.catalogueEn  libellés anglophones proposables
 * @returns {Array<{ name: string, max: number, cote: 'FR'|'EN' }>}
 */
export function mergeBilingualCatalog({ cls, catalogueFr = [], catalogueEn = [] }) {
  const classeEn = String(cls?.system || 'FR').toUpperCase() === 'EN';
  // Le côté de la classe d'abord : l'école retrouve ses matières habituelles en
  // haut de liste, les matières de l'autre programme viennent ensuite.
  const ordre = classeEn
    ? [['EN', catalogueEn, BAREME_EN], ['FR', catalogueFr, BAREME_FR]]
    : [['FR', catalogueFr, BAREME_FR], ['EN', catalogueEn, BAREME_EN]];
  const vus = new Set();
  const out = [];
  for (const [cote, noms, max] of ordre) {
    for (const name of noms || []) {
      const n = norm(name);
      if (!n || vus.has(n)) continue;
      vus.add(n);
      out.push({ name, max, cote });
    }
  }
  return out;
}

/**
 * Les matières à AJOUTER à une classe bilingue qui existe déjà — sans jamais
 * toucher à celles qu'elle porte. C'est le geste dont THE GENIUS a besoin : ses
 * quatre classes `… BIL` existent, avec leurs élèves et leurs notes, et il
 * manque seulement le côté anglophone.
 *
 * @param {object} p.cls       la classe
 * @param {Array}  p.existing  ses lignes `subjects` actuelles
 * @param {Array}  [p.keep]    libellés retenus par l'école
 * @returns {Array} lignes `subjects` à créer (celles déjà présentes sont ignorées)
 */
export function missingBilingualSubjects({ cls, existing = [], makeId, keep = null }) {
  const deja = new Set((existing || []).map((s) => norm(s.name)));
  const base = (existing || []).length;
  return buildSubjectsForBilingualClass({ cls, makeId, keep })
    .filter((r) => !deja.has(norm(r.name)))
    .map((r, i) => ({ ...r, position: base + i }));
}
