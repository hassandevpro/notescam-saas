// GROUPES DE MATIÈRES DU BULLETIN — ET QUI EN DÉCIDE
//
// ── LE DÉFAUT QUE CE MODULE FERME ──────────────────────────────────────────
//
// « Je crée une matière Espagnol, je choisis Langue, et sur le bulletin elle est
// dans AUTRES MATIÈRES. »
//
// L'école POSE un classement à la création (`subjects.category` : sciences,
// informatique, langues, litteraire, eps, autre). L'emploi du temps l'honore
// depuis toujours (`categoryForSubject`). Le bulletin, lui, ne l'a jamais lu :
// il rangeait les matières dans ses cinq groupes par une heuristique sur le NOM,
// et cette heuristique ignorait le choix de l'école. Le menu « Classement »
// n'avait donc aucun effet sur le document qui sort de l'établissement.
//
// Deux taxonomies vivaient ainsi côte à côte, avec deux tables de mots-clés
// différentes — et celle du bulletin connaissait « espagnol » mais pas
// « espanol » : « Español », écrit comme l'écrit un hispanophone, tombait en
// AUTRES. « Esp » aussi. Une école ne pouvait ni le comprendre ni le corriger.
//
// ── LA RÈGLE ───────────────────────────────────────────────────────────────
//
// Le classement CHOISI décide. Le nom n'est plus qu'un REPLI, pour les matières
// dont l'école n'a rien dit (`category` vide = l'option « auto » du menu).
//
// Ainsi « LMC », « EFPS », « Travaux Pratiques », une langue nationale ou
// « Español » se rangent où l'école l'a dit, quel que soit leur nom — ce qui est
// le seul moyen fiable, puisqu'aucune liste de mots-clés ne couvrira jamais les
// noms réels de 44 établissements.
//
// ── POURQUOI LE REPLI RESTE L'HEURISTIQUE DU BULLETIN, INCHANGÉE ───────────
//
// On aurait pu faire du repli un simple appel à `inferCategory` (la table de
// l'emploi du temps) et n'avoir qu'une table de mots-clés. On ne le fait PAS :
// les deux tables n'ont pas la même couverture. Le bulletin reconnaît « droit »,
// « juridique », « social », « humain », « plastique », « fine arts » — absents
// de la table de l'emploi du temps. Les unifier ferait silencieusement tomber
// ces matières-là en AUTRES sur des bulletins qui les classaient bien. Le repli
// est donc conservé mot pour mot, et seul `espanol` / `esp` y est ajouté.

import { CATEGORY_BY_ID } from '../config/timetableConfig.js';

// Les cinq groupes du bulletin classique / APC, dans leur ordre d'impression.
// Libellés bilingues « FR / EN » : l'appelant n'affiche que la moitié qui
// correspond au système de la classe.
export const APC_GROUPS = [
  { key: 'SCIENCES_EXACTES',  label: 'SCIENCES EXACTES / EXACT SCIENCES'  },
  { key: 'LANGUES',           label: 'LANGUES / LANGUAGES'                 },
  { key: 'SCIENCES_HUMAINES', label: 'SCIENCES HUMAINES / SOCIAL SCIENCES' },
  { key: 'ARTS_SPORTS',       label: 'ARTS ET SPORTS / ARTS & SPORTS'      },
  { key: 'AUTRES',            label: 'AUTRES MATIÈRES / OTHER SUBJECTS'    },
];

export const APC_GROUP_KEYS = APC_GROUPS.map((g) => g.key);

/**
 * Repli : groupe déduit du NOM. Table historique du bulletin, CONSERVÉE mot pour
 * mot, et complétée des manques relevés en passant tous les noms officiels du
 * référentiel MINESEC dedans : 20 des 56 tombaient en AUTRES.
 *
 * Ce qui a été ajouté, et pourquoi :
 *   • les SIGLES officiels — `PCT`, `ECM`, `EAC`, `ESF` : écrits en entier ils
 *     étaient reconnus, abrégés (comme les écrit toute école) ils ne l'étaient
 *     pas. Bornés par `\b`, pour ne pas mordre dans un autre mot ;
 *   • les LANGUES manquantes — grec, italien, chinois, portugais : la liste
 *     s'arrêtait à cinq langues, les autres tombaient en AUTRES. Plus
 *     `espanol` / `esp`, d'où vient le signalement : « Español », écrit comme
 *     l'écrit un hispanophone, n'était pas reconnu ;
 *   • « cultures nationales », qui n'était couvert que sous la forme
 *     « Langues et Cultures Nationales » (par le mot « langue ») ;
 *   • DEUX FAUTES D'ÉCRITURE : `manuelle?` voulait dire « manuel ou manuelle »
 *     mais exige deux `l` — « Travail manuel » n'a JAMAIS été reconnu ; et
 *     `morale` ne pouvait pas reconnaître l'anglais « Moral Education ».
 *     Corrigés en `manuell?e?` et `moral`.
 *
 * Rien n'a été retiré : toute matière déjà bien classée l'est encore.
 */
export function subjectGroupFromName(name) {
  const n = (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/math|physique|chimie|svt|bio|informatique|numerique|technologie|s\.p\.c|s\.v\.t|\bpct\b|physics|chemistry|biology|computer|science/.test(n)) return 'SCIENCES_EXACTES';
  if (/franc|anglais|espagnol|espanol|\besp\b|allemand|arabe|latin|grec|italien|chinois|portugais|langue|litterature|lecture|expression|communication|cultures?[ _]nat|english|french|spanish|german|arabic|greek|italian|chinese|portuguese|national (language|culture)/.test(n)) return 'LANGUES';
  if (/histoire|geo|economie|philo|moral|civique|social|humain|epsp|epm|droit|juridique|\becm\b|\besf\b|history|geography|economics|civic|philosophy/.test(n)) return 'SCIENCES_HUMAINES';
  if (/art|musique|eps|sport|dessin|plastique|manuell?e?|manual|\beac\b|physical education|fine arts|music/.test(n)) return 'ARTS_SPORTS';
  return 'AUTRES';
}

// Du classement de l'école vers le groupe du bulletin.
//
// `litteraire` est le seul cas AMBIGU : il réunit, dans l'emploi du temps,
// l'histoire-géo-philo ET les arts (ses mots-clés portent « art », « musique »,
// « dessin »), que le bulletin sépare en deux groupes. Pour celui-là seulement,
// on laisse le NOM trancher entre les deux, et on retient les sciences humaines
// par défaut.
const GROUPE_PAR_CLASSEMENT = {
  sciences:     'SCIENCES_EXACTES',
  informatique: 'SCIENCES_EXACTES',
  langues:      'LANGUES',
  eps:          'ARTS_SPORTS',
  autre:        'AUTRES',
};

/**
 * Groupe de bulletin d'une matière : son classement CHOISI d'abord, le nom
 * ensuite.
 *
 * Un classement inconnu (menu modifié depuis, donnée abîmée) retombe sur le
 * nom plutôt que sur AUTRES : mieux vaut un groupe deviné qu'un classement perdu
 * — même principe que `categoryForSubject`.
 *
 * @param {object} subject ligne `subjects` ({ name, category })
 */
export function subjectGroupKey(subject) {
  const choisi = subject?.category;
  if (choisi && CATEGORY_BY_ID[choisi]) {
    if (choisi === 'litteraire') {
      const parNom = subjectGroupFromName(subject?.name);
      return parNom === 'ARTS_SPORTS' ? 'ARTS_SPORTS' : 'SCIENCES_HUMAINES';
    }
    const direct = GROUPE_PAR_CLASSEMENT[choisi];
    if (direct) return direct;
  }
  return subjectGroupFromName(subject?.name);
}

/** Matières d'une classe réparties dans les cinq groupes, ordre d'impression. */
export function groupSubjects(subjects) {
  const out = {};
  for (const k of APC_GROUP_KEYS) out[k] = [];
  for (const sub of subjects || []) {
    if (!sub) continue;
    const k = subjectGroupKey(sub);
    (out[k] || out.AUTRES).push(sub);
  }
  return out;
}
