// LES DEUX PROGRAMMES D'UNE CLASSE BILINGUE — variante du carnet papier.
//
// ── CE QUE LE CARNET DE L'ÉCOLE FAIT, ET QUE LE NÔTRE NE FAISAIT PAS ───────
//
// Sur les sept bulletins photographiés de THE GENIUS (relevés le 2026-10-29),
// six rangent les compétences sous les SIX FAMILLES du MINEDUB. Le septième —
// « Class 2/CP », une classe BILINGUE — ne les range pas comme ça du tout : il
// coupe la liste en DEUX BLOCS, un par programme, chacun suivi de son total, de
// sa moyenne et de sa cote, puis donne le total général :
//
//     CHINESE · 1B- Communicate in English · 2A- Use basic notions in …
//                              English    Total: 242   Average: 17.29/20
//     CHINESE · 1A- Communiquer en Français · 2A- Utiliser les notions …
//                              French     Total: 260   Average: 18.57/20
//     Total                    502 / 560                         Grade: A
//
// 242 + 260 = 502 : les deux blocs s'additionnent bien dans le total général.
// C'est la lecture dont un parent d'élève bilingue a besoin — « comment va mon
// enfant du côté anglophone ? » — et les six familles ne la donnent pas, parce
// qu'une famille mélange les deux programmes.
//
// ── LE PIÈGE QU'IL A FALLU MESURER POUR LE VOIR ───────────────────────────
//
// Première version de ce module : classer chaque ligne d'après la LANGUE de son
// intitulé. Monté sur l'édition LAN et ouvert dans Chrome (CP BIL, 19 matières,
// les deux troncs), le carnet n'a produit AUCUN bloc. La cause, lue à l'écran :
//
//     [1A] [Communicate in French]  …     [1B] [Communicate in English]
//
// Les compétences NATIONALES sont stockées en français et TRADUITES à
// l'affichage (`referentielI18n.primCompetenceLabel`) : sur un bulletin
// anglophone, les onze s'écrivent en anglais. Tout tombait donc du même côté.
// Un intitulé de ligne ne dit pas le programme — il dit la langue du document.
//
// ── CE QUI LE DIT VRAIMENT : LA MATIÈRE QUI A RÉCLAMÉ LA COMPÉTENCE ───────
//
// Une classe bilingue porte les DEUX troncs dans ses `subjects` — c'est ce qui
// la rend bilingue (« la liste des matières EST la marque du bilinguisme »,
// `bilingualSubjects.isBilingualClass`). Et `refClassScope` attribue déjà les
// compétences à ces matières, avec une règle écrite et testée :
//
//     « La PREMIÈRE matière (dans l'ordre de la classe) qui réclame une
//       compétence la garde. Chaque matière SUIVANTE qui réclamerait la même
//       reçoit sa propre compétence maison. »
//
// On REJOUE cette attribution, à l'identique, avec la même fonction de
// rapprochement (`competenceIdForSubject`). Le programme d'une ligne est alors
// celui de SA matière, et une matière appartient à l'un des deux troncs
// officiels du niveau — que `classicSubjects` porte déjà, dans les deux langues.
// Rien n'est deviné : on relit une attribution que le produit a faite.
//
// Ce qui ne tombe sur rien — « Chinois », dans aucun des deux troncs — et les
// compétences nationales qu'AUCUNE matière ne réclame ne sont rangées dans
// aucun programme : elles vont dans un bloc résiduel qui porte son nom. Mieux
// vaut une ligne visiblement à part qu'une matière attribuée au mauvais
// programme sur un document remis aux parents.
//
// ── POURQUOI AUCUNE COLONNE EN BASE, AUCUN RÉGLAGE DE PLUS ────────────────
//
// Une classe dont les lignes relèvent d'UN SEUL programme rend une liste VIDE,
// et le carnet garde ses six familles — donc aucune école existante ne voit son
// bulletin changer sans l'avoir demandé, et il n'y a ni migration ni case à
// cocher de plus.
//
// MODULE PUR : aucun store, aucun DOM, aucun réseau. Testable sous Node.

// Les deux troncs du niveau, à la SOURCE. `bilingualSubjects` les lit aussi,
// mais il les DÉDOUBLONNE — un libellé présent des deux côtés n'y garde que le
// premier, et arriverait ici étiqueté d'un programme choisi par l'ordre du
// code. Ce module a besoin de l'inverse : savoir qu'un libellé est AMBIGU pour
// refuser de le classer.
import { defaultClassicSubjects } from './classicSubjects.js';
// LE MÊME rapprochement matière ↔ compétence que `refClassScope`. En écrire un
// second, c'était accepter que le bulletin range une ligne dans un programme
// dont l'écran de saisie la croit absente.
import { competenceIdForSubject } from './primCompetenceMatch.js';
import { agregerGroupe } from './primCompactRows.js';

// Même normalisation que `primCompetenceMatch` et `bilingualSubjects` : sans
// accents, sans ponctuation. Deux modules qui normaliseraient différemment
// finiraient par ranger la même matière dans deux programmes.
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * Nom du programme, dans la langue du bulletin.
 *
 * Le carnet papier de Class 2/CP — un bulletin ANGLOPHONE — écrit « English »
 * et « French ». On garde ses mots, et on les rend dans le système de la classe
 * comme tout le reste du document : un carnet francophone dira « Anglais » et
 * « Français ».
 */
export function programmeLabel(cote, sys = 'FR') {
  const en = { FR: 'French', EN: 'English', AUTRE: 'Other subjects' };
  const es = { FR: 'Francés', EN: 'Inglés', AUTRE: 'Otras asignaturas' };
  const fr = { FR: 'Français', EN: 'Anglais', AUTRE: 'Autres matières' };
  const table = sys === 'EN' ? en : (sys === 'ES' ? es : fr);
  return table[cote] || null;
}

/**
 * Les deux troncs officiels du niveau, normalisés.
 *
 * « Anglais » appartient au tronc FRANCOPHONE (c'est son cours d'anglais) et
 * « French » au tronc ANGLOPHONE : l'étiquette dit le programme, pas la langue
 * du mot.
 *
 * Un libellé présent des DEUX côtés ne discrimine rien : il est retiré, sinon
 * le premier côté examiné l'emporterait par ordre d'écriture du code plutôt que
 * par la donnée. (Mesuré sur les catalogues du dépôt, de la maternelle à la
 * Terminale : aucun libellé partagé aujourd'hui. Le garde-fou reste pour le
 * jour où un catalogue en créera un.)
 *
 * @returns {{ FR: string[], EN: string[] }}
 */
export function troncsDe(cls) {
  const vu = { FR: new Set(), EN: new Set() };
  // Le système 'ES' (Guinée équatoriale) n'a pas de tronc classique
  // auto-configuré : `defaultClassicSubjects` rend [] et on n'insiste pas.
  if (cls && String(cls.system || '').toUpperCase() !== 'ES') {
    for (const cote of ['FR', 'EN']) {
      for (const s of defaultClassicSubjects({ ...cls, system: cote }) || []) {
        const n = norm(s?.name);
        if (n) vu[cote].add(n);
      }
    }
  }
  const commun = [...vu.FR].filter((n) => vu.EN.has(n));
  for (const n of commun) { vu.FR.delete(n); vu.EN.delete(n); }
  return { FR: [...vu.FR], EN: [...vu.EN] };
}

/**
 * Le programme d'une MATIÈRE, ou `null` si elle n'est dans aucun tronc.
 *
 * Deux reconnaissances, dans cet ordre :
 *   1. ÉGALITÉ exacte du libellé normalisé — le cas courant ;
 *   2. un libellé du tronc apparaît comme SUITE DE MOTS ENTIERS dans le nom —
 *      « English 2 », « Mathematics paper 1 », les noms que les écoles écrivent
 *      vraiment sur leurs copies (relevés sur le carnet de CLASS V).
 *
 * Le mot ENTIER, et non la sous-chaîne : sans cela « French » se reconnaîtrait
 * au milieu d'un mot plus long, et « Arts » dans « Artsonia ».
 *
 * SI LES DEUX CÔTÉS RÉPONDENT, le libellé le PLUS LONG l'emporte — il est le
 * plus spécifique : « Arts / Dessin » (francophone) contient le mot « Arts »
 * (anglophone), et c'est bien la matière française. À égalité de longueur, on
 * rend `null` : une ambiguïté vraie ne se tranche pas à pile ou face.
 */
export function programmeDeMatiere(nom, troncs) {
  const n = norm(nom);
  if (!n || !troncs) return null;
  const espace = ` ${n} `;
  let meilleur = null;
  let longueur = -1;
  let ambigu = false;
  for (const cote of ['FR', 'EN']) {
    for (const mot of troncs[cote] || []) {
      if (n !== mot && !espace.includes(` ${mot} `)) continue;
      if (mot.length > longueur) { meilleur = cote; longueur = mot.length; ambigu = false; }
      else if (mot.length === longueur && cote !== meilleur) ambigu = true;
    }
  }
  return ambigu ? null : meilleur;
}

/**
 * LE PROGRAMME DE CHAQUE COMPÉTENCE — l'attribution du produit, relue.
 *
 * On rejoue `refClassScope.primSubjectsNeedingOwnCompetence` : la première
 * matière de la classe qui réclame une compétence nationale la garde ; les
 * suivantes reçoivent leur propre compétence maison, qui PORTE leur nom.
 *
 * @param classSubjects lignes `subjects` de la classe, DANS L'ORDRE d'affichage
 *                      (c'est cet ordre qui décide qui garde quoi)
 * @param competences   compétences du bulletin, NON TRADUITES
 *                      ([{ id, code, intitule, school_id }])
 * @param troncs        sortie de `troncsDe`
 * @returns {Map<string, 'FR'|'EN'>} code de compétence → programme. Un code
 *          absent de la table n'appartient à aucun programme.
 */
export function programmesParCode(classSubjects, competences, troncs) {
  const liste = (competences || []).filter((c) => c && c.id != null);
  const nationales = liste.filter((c) => !c.school_id);
  const parCode = new Map();

  // Nom de matière normalisé → compétence MAISON qui le porte. C'est le lien
  // inverse de celui qui l'a créée : la maison est née du nom de la matière.
  const maisonDe = new Map();
  for (const c of liste) {
    if (!c.school_id) continue;
    const n = norm(c.intitule);
    if (n && !maisonDe.has(n)) maisonDe.set(n, c);
  }

  const prises = new Set();
  for (const s of classSubjects || []) {
    if (!s || !s.name) continue;
    const cote = programmeDeMatiere(s.name, troncs);
    const id = competenceIdForSubject(s, nationales);
    // La règle du produit, mot pour mot : la première qui réclame garde.
    if (id && !prises.has(id)) {
      prises.add(id);
      const nat = nationales.find((c) => c.id === id);
      if (cote && nat?.code != null && !parCode.has(nat.code)) parCode.set(nat.code, cote);
      continue;
    }
    // Sinon la matière a sa propre compétence maison — si elle existe.
    const maison = maisonDe.get(norm(s.name));
    if (cote && maison?.code != null && !parCode.has(maison.code)) parCode.set(maison.code, cote);
  }
  return parCode;
}

/**
 * LES BLOCS DU CARNET BILINGUE — même forme que `groupesDe`, pour que le
 * gabarit n'ait qu'un seul bandeau à savoir dessiner.
 *
 * @param rows  lignes de `buildCompactRows`
 * @param p.cls            la classe
 * @param p.classSubjects  ses matières, dans l'ordre d'affichage
 * @param p.competences    les compétences du bulletin, NON TRADUITES
 * @param p.sys            'FR' | 'EN' | 'ES' — langue des intitulés
 * @param p.coteBareme     bandes de cotes de l'école, pour la cote du bloc
 * @returns {Array} [] si la classe ne porte PAS les deux programmes — et alors
 *          le carnet garde ses six familles, inchangé.
 *
 * L'ORDRE DES BLOCS suit le système de la classe, comme
 * `bilingualSubjects.mergeBilingualCatalog` : le carnet anglophone de Class 2/CP
 * ouvre sur English, un carnet francophone ouvrirait sur Français.
 *
 * LE TROISIÈME BLOC — « Autres matières » — n'existe que s'il reste des lignes
 * hors des deux programmes. Il en reste deux sortes, et aucune ne doit être
 * rangée de force : les matières d'aucun tronc (« Chinois »), et les
 * compétences nationales qu'aucune matière de la classe ne réclame. Il n'est
 * pas sur le papier de l'école, et il y est pourtant indispensable : sans lui,
 * ces lignes comptaient dans le total général sans figurer dans aucun bloc, et
 * un parent qui additionne les deux blocs ne retombait pas sur le total.
 */
export function programmesDe(rows, {
  cls, classSubjects = [], competences = [], sys = 'FR', coteBareme = null,
} = {}) {
  const liste = (rows || []).filter((r) => r && r.code != null);
  if (!liste.length) return [];
  const parCode = programmesParCode(classSubjects, competences, troncsDe(cls));

  const par = { FR: [], EN: [], AUTRE: [] };
  for (const r of liste) par[parCode.get(r.code) || 'AUTRE'].push(r);

  // LA CLASSE EST-ELLE VRAIMENT BILINGUE ? On ne le demande pas à un réglage,
  // on le LIT sur ses matières. Un seul programme reconnu — toutes les classes
  // monolingues, c'est-à-dire la quasi-totalité — et ce module se retire.
  if (!par.FR.length || !par.EN.length) return [];

  const ordre = String(cls?.system || 'FR').toUpperCase() === 'EN'
    ? ['EN', 'FR', 'AUTRE']
    : ['FR', 'EN', 'AUTRE'];
  return ordre
    .filter((cote) => par[cote].length)
    .map((cote) => ({
      cle: `prog:${cote}`,
      programme: cote,
      // Pas de numéro : un bloc de programme n'est pas une famille du MINEDUB,
      // et le bandeau ne doit pas s'imprimer « 1) English ».
      numero: null,
      intitule: programmeLabel(cote, sys),
      ...agregerGroupe(par[cote], coteBareme),
    }));
}

/**
 * Les lignes RÉORDONNÉES par bloc, chaque bloc gardant son ordre interne.
 *
 * Nécessaire, et pas seulement cosmétique : les compétences d'une classe
 * bilingue arrivent dans l'ordre du référentiel, donc les deux programmes
 * s'entrelacent (les onze nationales, puis les maisons). Le bandeau
 * « English · Total: 242 » se poserait alors après la DERNIÈRE ligne
 * anglophone, c'est-à-dire tout en bas, par-dessus des lignes francophones —
 * un total juste à un endroit qui le rend faux à lire.
 *
 * Rend `rows` INCHANGÉ si aucun bloc n'est fourni : les six familles, elles,
 * n'ont jamais eu besoin d'être contiguës (cf. `reperesDeGroupe`).
 */
export function ordonnerParProgramme(rows, blocs) {
  if (!blocs || !blocs.length) return rows || [];
  const rang = new Map();
  blocs.forEach((b, i) => { for (const code of b?.codes || []) rang.set(code, i); });
  // Tri STABLE (celui de `Array.prototype.sort` depuis ES2019) : à bloc égal,
  // l'ordre du référentiel est conservé tel quel.
  return [...(rows || [])].sort((a, b) => (rang.get(a?.code) ?? blocs.length)
    - (rang.get(b?.code) ?? blocs.length));
}
