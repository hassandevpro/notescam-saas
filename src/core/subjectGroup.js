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

// ── UNE MATIÈRE MAISON GARDE SON CLASSEMENT, MÊME SUR UN BULLETIN OFFICIEL ──
//
// Demande du responsable : « on doit pouvoir être libre de créer une matière
// même si ça ne fait pas partie du référentiel, et ça doit s'afficher sur le
// bulletin dans sa vraie catégorie de classement, pas aller automatiquement sur
// Autres matières. »
//
// Le bulletin du PROGRAMME BILINGUE range par DOMAINE D'APPRENTISSAGE, et ces
// domaines sont THÉMATIQUES — « Langues et littératures », « Sciences
// humaines », « Sciences et technologies », « Arts et cultures nationales »,
// « Développement personnel ». Ils recouvrent donc exactement les cinq familles
// du classement de l'école, et y ranger une matière maison a un sens précis.
//
// C'est un revirement assumé par rapport à D12, qui refusait que `category`
// touche aux bulletins officiels. La raison de D12 tenait pour le SECOND CYCLE,
// dont les GROUPE 1 / GROUPE 2 sont une répartition réglementaire sans contenu
// thématique : y ranger « Zumba » parce qu'elle est classée « EPS » n'aurait
// aucun sens, et le levier y reste le menu « Groupe » (décision D13). Elle ne
// tient PAS pour les domaines bilingues, qui sont des familles de matières.
//
// Ce qui est repris du domaine : le NOM et l'ORDRE, rien d'autre. Le
// coefficient et la charge horaire restent ceux que l'école a saisis — la
// matière n'est pas dans l'arrêté, il n'y a aucun chiffre officiel à lui
// appliquer.

// Du groupe vers le domaine, par motifs sur le LIBELLÉ : les ids de domaines
// diffèrent entre sous-système francophone (`fr_d1`…) et anglophone (`en_d1`…),
// et un référentiel importé par une école peut en porter d'autres. Le libellé,
// lui, décrit la famille.
// ORDRE SIGNIFICATIF dans chaque liste : le premier motif qui trouve un domaine
// gagne. Les motifs vont donc du plus SPÉCIFIQUE au plus général — « sciences »
// tout court matcherait « Sciences humaines », qui précède « Sciences et
// technologies » dans le référentiel, et enverrait les mathématiques chez les
// historiens. C'est le piège de ces tables.
//
// Les cinq familles de domaines, chacune reconnue par son libellé.
const M_LANGUES  = [/langue|littérature|literature/i];
const M_SCIENCES = [/sciences? et techno/i, /technolog/i, /^\s*sciences?\s*$/i];
const M_HUMAINES = [/sciences humaines|social/i];
const M_ARTS     = [/arts|culture/i];
const M_SPORT    = [/développement personnel|personal development/i];

// Reconnaît le sport et le travail manuel par le NOM. Sert à départager les
// deux débouchés du groupe ARTS_SPORTS, qui confond les deux.
const SPORTIF_NOM = /eps|sport|physique et sportive|physical education|manuel|manual|gym|athlet/i;

/**
 * Ordre de PRÉFÉRENCE des domaines pour une matière. On prend le premier que le
 * référentiel de la classe propose réellement — d'où des replis, et non un
 * domaine unique : tous les sous-systèmes n'ont pas les mêmes domaines.
 * L'anglophone, par exemple, n'a PAS de domaine « Arts » ; une matière
 * artistique doit alors aller aux sciences humaines et surtout pas au
 * « Développement personnel », qui est le domaine du sport.
 */
function motifsPour(subject) {
  switch (subject?.category) {
    case 'langues':      return M_LANGUES;
    case 'sciences':
    case 'informatique': return M_SCIENCES;
    case 'eps':          return [...M_SPORT, ...M_ARTS];
    case 'autre':        return [];
    default: break;      // `litteraire`, ou aucun classement : le nom tranche
  }
  switch (subjectGroupKey(subject)) {
    case 'LANGUES':           return M_LANGUES;
    case 'SCIENCES_EXACTES':  return M_SCIENCES;
    case 'SCIENCES_HUMAINES': return [...M_HUMAINES, ...M_ARTS];
    case 'ARTS_SPORTS':
      return SPORTIF_NOM.test(subject?.name || '')
        ? [...M_SPORT, ...M_ARTS, ...M_HUMAINES]
        : [...M_ARTS, ...M_HUMAINES, ...M_SPORT];
    default:                  return [];
  }
}

/**
 * Domaine d'apprentissage où ranger une matière que le référentiel ne réclame
 * pas, d'après son classement. `null` si aucun domaine ne correspond — la
 * matière reste alors sous AUTRES MATIÈRES, comme avant.
 *
 * @param subject ligne `subjects` ({ name, category })
 * @param rows    lignes du référentiel de la classe, portant `domaine_nom` et
 *                `domaine_ordre`
 */
export function domaineForSubject(subject, rows, nomOf = (r) => r?.domaine_nom) {
  const liste = (rows || []).filter((r) => r && nomOf(r));
  if (!liste.length) return null;
  const motifs = motifsPour(subject);
  for (const motif of motifs) {
    const hit = liste.find((r) => motif.test(nomOf(r)));
    if (hit) return hit;
  }
  return null;
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
