// Analyse d'un NOM de classe libre (« 1ère TI A », « Form 3 Red », « Terminale C »)
// pour en inférer TOUT ce qui est déductible : cycle, niveau, sous-système /
// langue, série, moteur de bulletin, barème. Logique pure, sans React — testée
// isolément (voir _classNameParser.test.mjs).
//
// Objectif produit : l'utilisateur ne saisit qu'UN champ (le nom). Le reste est
// hérité (année, modèle établissement) ou inféré ici, et reste corrigeable dans
// les « réglages avancés ».
//
// Source de vérité des niveaux : la config PAYS (countries/*.js). Les items de
// `cycles[].levelGroups[].items` encodent déjà la série (« 1ère TI », « Terminale
// C »…), donc on en dérive le niveau ET la série sans regex fragile.

import { resolveClassEngine, isFirstCycle, isSecondCycle } from './engineResolver.js';
// Import direct des deux configs camerounaises (fichiers sans dépendance → aussi
// résolvables sous `node` pour les tests) plutôt que le baril ../countries qui
// s'appuie sur la résolution sans extension de Vite.
import { cameroonFr } from '../countries/cameroon_fr.js';
import { cameroonEn } from '../countries/cameroon_en.js';

// Séries officielles du second cycle MINESEC (slug stocké dans classes.serie).
// « B » volontairement absent : réduit les faux positifs (« Bilingue », « Bleu »)
// et le Cameroun n'a pas de série B au lycée général.
const SC_SERIES = ['A1', 'A2', 'A3', 'A4', 'A5', 'ABI', 'AC', 'SH', 'TI', 'TG', 'A', 'C', 'D', 'E'];
// Pour un rapprochement « greedy » du 1er token de suffixe (ex. « A1 » avant « A »).
const SERIES_BY_LEN = [...SC_SERIES].sort((a, b) => b.length - a.length);

// Le Cameroun est bilingue : un nom anglophone dans une école FR (et inversement)
// reste reconnaissable — on propose les niveaux des DEUX langues.
const CAMEROON_CODES = new Set(['cameroon_fr', 'cameroon_en']);

// Normalisation identique au reste du moteur (engineResolver) + suppression des
// espaces pour un rapprochement tolérant (« 1ère TI A » ⊃ « 1ère TI »).
const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const squash = (s) => norm(s).replace(/\s+/g, '');

// Aplati tous les niveaux connus du pays (+ l'autre langue au Cameroun), triés du
// plus long au plus court pour un rapprochement « greedy » (préfixe le plus long).
function levelCatalog(country) {
  const collect = (c) =>
    (c?.cycles || []).flatMap((cy) =>
      cy.levelGroups.flatMap((g) =>
        g.items.map((item) => ({ item, cycle: cy.code, code: c.code })),
      ),
    );
  let items = collect(country);
  if (CAMEROON_CODES.has(country?.code)) {
    const other = country.code === 'cameroon_fr' ? cameroonEn : cameroonFr;
    items = items.concat(collect(other));
  }
  return items.sort((a, b) => squash(b.item).length - squash(a.item).length);
}

// Rapproche le nom saisi du plus long niveau connu qui en est le préfixe.
//   « Terminale C »  → { level: 'Terminale C', cycle: 'secondaire', fromEN: false }
//   « 1ère TI A »    → { level: '1ère TI',      cycle: 'secondaire', fromEN: false }
//   « Form 3 Red »   → { level: 'Form 3',       cycle: 'secondaire', fromEN: true  }
function matchLevel(name, country) {
  const target = squash(name);
  for (const cand of levelCatalog(country)) {
    if (target.startsWith(squash(cand.item))) {
      return { level: cand.item, cycle: cand.cycle, fromEN: cand.code === 'cameroon_en' };
    }
  }
  return null;
}

// Repli quand aucun niveau du catalogue ne matche : au moins déduire le cycle.
function fallbackCycle(name) {
  if (isFirstCycle('', name) || isSecondCycle('', name)) return 'secondaire';
  if (/\b(cp|ce[12]|cm[12]|sil|class\s?[1-6])\b/i.test(name)) return 'primaire';
  if (/\b(petite|moyenne|grande)\s?section|nursery|toute\s?petite/i.test(name)) return 'maternelle';
  // Crèche / garderie / pré-scolaire : même liste que `maternelleNiveauSlug`
  // (engineResolver). Les deux DOIVENT reconnaître les mêmes noms, sinon la classe
  // naît ici avec le cycle 'secondaire' du repli final — et un mauvais cycle stocké
  // survit à toute correction ultérieure du classement par nom.
  if (/creche|garderie|day-?care|pre-?scolaire|pre-?school/i.test(name.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return 'maternelle';
  return 'secondaire';
}

// Extrait la série depuis un LIBELLÉ de niveau (voies techniques « 1ère TI » /
// « Terminale TG » qui gardent la série dans le libellé).
function serieFromLevel(level) {
  if (!level) return null;
  const up = level.toUpperCase();
  const m = up.match(new RegExp(`\\b(${SC_SERIES.join('|')})\\b`));
  return m ? m[1].toLowerCase() : null;
}

// Sépare le suffixe (partie après le niveau « nu ») en { série, section }.
// La série doit couvrir TOUT le premier token (éventuellement suivi de chiffres de
// section, « D2 » → série D + section 2) — sinon « Ciel »→C, « Bilingue »→B.
//   « E »    → { serie:'e',  rest:'' }        « D 2 » → { serie:'d', rest:'2' }
//   « TI A » → { serie:'ti', rest:'A' }       « Bleu » → { serie:null, rest:'Bleu' }
function splitSuffixSerie(suffix) {
  const raw = String(suffix || '').trim();
  if (!raw) return { serie: null, rest: '' };
  const firstTok = raw.split(/\s+/)[0];
  const tokU = squash(firstTok).toUpperCase();
  for (const code of SERIES_BY_LEN) {
    if (tokU === code || (tokU.startsWith(code) && /^[0-9]*$/.test(tokU.slice(code.length)))) {
      return { serie: code.toLowerCase(), rest: raw.slice(firstTok.length).trim() };
    }
  }
  return { serie: null, rest: raw };
}

// Barème de sortie hérité du sous-système : FR → /20, EN → /100, ES/GE → /geMax.
const scaleForSystem = (system, country) =>
  system === 'ES' ? null : system === 'EN' ? 100 : 20;

/**
 * Analyse un nom de classe et renvoie toutes les propriétés inférées.
 * @returns {null | {
 *   name, level, cycle, system, serie, engine, grade_max,
 *   report_template, confidence, needsSeries, displaySuffix
 * }}
 */
export function parseClassName(raw, { school, country }) {
  const name = String(raw ?? '').trim();
  if (!name) return null;

  const isGE = country?.code === 'guinea_eq';
  const matched = matchLevel(name, country);
  const level = matched?.level ?? null;
  const cycle = matched?.cycle ?? fallbackCycle(name);

  // Sous-système / langue : GE → ES ; sinon un niveau anglophone force EN, y
  // compris dans une école francophone (auto-bascule /100).
  const system = isGE ? 'ES' : matched?.fromEN ? 'EN' : 'FR';

  // Partie du nom après le niveau (peut contenir la série puis la section).
  const rawSuffix = level ? name.slice(matchedPrefixLength(name, level)).trim() : '';

  // Série (second cycle uniquement) : soit encodée dans le libellé (voies
  // techniques « 1ère TI »), soit lue en TÊTE du suffixe pour les niveaux « nus »
  // (« Terminale E » → série E). Le collège n'a pas de série.
  const serieInLevel = serieFromLevel(level);
  const secondCycle  = isSecondCycle(level ?? '', name);
  const { serie: serieInSuffix, rest: section } =
    (!serieInLevel && secondCycle) ? splitSuffixSerie(rawSuffix) : { serie: null, rest: rawSuffix };
  const serie = serieInLevel || serieInSuffix || null;

  // Moteur effectif : réutilise LA résolution partagée par tout le reste de
  // l'app — aucune logique de bulletin dupliquée.
  const engine = resolveClassEngine(school, { level: level ?? '', name, serie });

  const grade_max = scaleForSystem(system, country);

  // Le second cycle exige une série pour l'auto-config des matières : si non
  // résolue (ex. « Terminale » sans série précisée), on baisse la confiance.
  const needsSeries = engine === 'sc' && !serie;

  // Suffixe de section restant (« A », « Red », « Science ») — purement affiché.
  // Quand la série a été lue dans le libellé, le suffixe brut est déjà la section.
  const displaySuffix = serieInLevel ? rawSuffix : section;

  return {
    name,
    level,
    cycle,
    system,
    serie,
    engine,
    grade_max,
    report_template: templateFor({ engine, serie, cycle, country }),
    confidence: matched && !needsSeries ? 'high' : 'low',
    needsSeries,
    displaySuffix,
  };
}

// Longueur (dans le nom brut) du préfixe correspondant au libellé de niveau, pour
// isoler le suffixe de section. Tolérant aux espaces/accents.
function matchedPrefixLength(name, level) {
  const targetLen = squash(level).length;
  let count = 0;
  for (let i = 0; i < name.length; i++) {
    if (squash(name[i]).length) count += squash(name[i]).length;
    if (count >= targetLen) return i + 1;
  }
  return name.length;
}

// Modèle officiel de bulletin dérivé du moteur résolu.
function templateFor({ engine, serie, cycle, country }) {
  if (engine === 'sc') return { id: `sc_${serie || 'x'}`, label: `Second Cycle · ${(serie || '?').toUpperCase()}` };
  if (engine === 'apc') return { id: 'apc_minesec', label: 'APC (compétences)' };
  return { id: `classic_${country?.code || 'default'}`, label: 'Classique' };
}
