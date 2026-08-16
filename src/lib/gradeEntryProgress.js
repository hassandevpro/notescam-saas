// PROGRESSION DE SAISIE DES NOTES — logique PURE (ni React, ni store, ni réseau).
//
// « X/Y notes saisies » n'a pas le même sens selon le moteur de la classe, parce
// que la saisie ne vit pas au même endroit :
//
//   moteur        | attendu (Y)                    | source des saisies
//   --------------|--------------------------------|----------------------------
//   classic / sc  | élèves × matières              | gradeMap[classe_élève_séq]
//   apc           | élèves × compétences du trim.  | apcNotes[élève_comp_sN]
//   apc_primaire  | élèves × compétences (matières)| primNotes[élève_comp_crit_UA]
//   maternelle    | élèves × domaines (matières)   | matObservations[élève_dom_tN]
//
// Compter les quatre avec la formule du moteur classique donnait « 0/48 » à vie
// sur une maternelle : ses observations ne passent jamais par `gradeMap`.
//
// Test : `node src/lib/_gradeEntryProgress.test.mjs`

import { SEQ_TO_TRIM } from '../core/apcEngine.js';
import { firstCycleClasseSlug } from '../core/engineResolver.js';

const filled = (v) => v !== undefined && v !== null && v !== '' && v !== 'ABS';

// ── Moteur classique / second cycle : notes numériques dans gradeMap ─────────
function classicProgress({ cls, subs, studs, order, gradeMap }) {
  const expected = studs.length * subs.length;
  const entered = studs.reduce((count, stu) => {
    const grades = gradeMap?.[`${cls.id}_${stu.id}_${order}`] || {};
    return count + subs.filter((sub) => filled(grades[sub.id])).length;
  }, 0);
  return { expected, entered };
}

// ── Maternelle : une observation par (élève, domaine, trimestre) ─────────────
// Les domaines sont matérialisés en `subjects.mat_domaine_id` (cf. matEngine).
function maternelleProgress({ subs, studs, order, matObservations }) {
  const domaines = subs.map((s) => s.mat_domaine_id).filter(Boolean);
  const expected = studs.length * domaines.length;
  let entered = 0;
  for (const stu of studs) {
    for (const dom of domaines) {
      const obs = matObservations?.[`${stu.id}_${dom}_t${order}`];
      if (obs && filled(obs.niveau_acquis)) entered++;
    }
  }
  return { expected, entered };
}

// ── Primaire APC : notes par (élève, compétence, critère, UA) ────────────────
// On compte au grain COMPÉTENCE (une compétence est « saisie » dès qu'au moins un
// de ses critères porte une note) : le nombre de critères varie par niveau et par
// aptitude de l'élève, un dénominateur au grain critère serait illisible.
// Les compétences sont matérialisées en `subjects.prim_competence_id`.
function primaireProgress({ subs, studs, order, primNotes, primIndex }) {
  const competences = subs.map((s) => s.prim_competence_id).filter(Boolean);
  const expected = studs.length * competences.length;
  const done = (primIndex || indexPrimNotes(primNotes))[order] || EMPTY_SET;
  let entered = 0;
  for (const stu of studs) {
    for (const comp of competences) if (done.has(`${stu.id}_${comp}`)) entered++;
  }
  return { expected, entered };
}

const EMPTY_SET = new Set();

/**
 * Index des notes primaires : { [ua]: Set<'eleve_competence'> }.
 *
 * Sans lui, chaque (classe × UA) rebalaye l'intégralité de `primNotes` — soit,
 * pour une école primaire complète, des dizaines de balayages d'un objet à
 * plusieurs dizaines de milliers d'entrées à chaque rendu du tableau de bord.
 * À construire UNE fois par jeu de notes et à passer en `primIndex`.
 */
export function indexPrimNotes(primNotes) {
  const byUa = {};
  for (const n of Object.values(primNotes || {})) {
    if (!filled(n?.note)) continue;
    const ua = Number(n.ua);
    (byUa[ua] || (byUa[ua] = new Set())).add(`${n.eleve_id}_${n.competence_id}`);
  }
  return byUa;
}

// ── APC premier cycle : notes par (élève, compétence, séquence) ──────────────
// Les compétences ne sont PAS matérialisées en matières : elles viennent du
// référentiel, TOUTES matières confondues, filtrées par (classe, trimestre de la
// séquence). Sans référentiel chargé, l'attendu est inconnu → `expected: null`
// (l'appelant n'affiche rien plutôt qu'un pourcentage faux).
function apcProgress({ cls, studs, order, apcNotes, apcReferentiel }) {
  const classeId = firstCycleClasseSlug(cls?.level || '', cls?.name || '');
  const trimestreId = SEQ_TO_TRIM[Number(order)];
  const comps = classeId && trimestreId
    ? (apcReferentiel?.competences || []).filter(
        (c) => c.actif !== false && c.classe_id === classeId && c.trimestre_id === trimestreId)
    : [];
  if (!comps.length) return { expected: null, entered: null };

  const expected = studs.length * comps.length;
  let entered = 0;
  for (const stu of studs) {
    for (const c of comps) {
      if (filled(apcNotes?.[`${stu.id}_${c.id}_s${order}`]?.note)) entered++;
    }
  }
  return { expected, entered };
}

/**
 * Avancement de la saisie d'UNE classe pour UNE période (le rang de période est
 * celui de la piste de la classe : séquence 1-6, term 1-3, UA 1-8, trimestre 1-3).
 *
 * @returns { expected, entered } — `expected: null` quand l'attendu n'est pas
 *          calculable (référentiel APC pas encore chargé).
 */
export function classEntryProgress({
  engine, cls, subs = [], studs = [], order,
  gradeMap, apcNotes, primNotes, matObservations, apcReferentiel, primIndex,
}) {
  if (order == null) return { expected: null, entered: null };
  switch (engine) {
    case 'maternelle':   return maternelleProgress({ subs, studs, order, matObservations });
    case 'apc_primaire': return primaireProgress({ subs, studs, order, primNotes, primIndex });
    case 'apc':          return apcProgress({ cls, studs, order, apcNotes, apcReferentiel });
    default:             return classicProgress({ cls, subs, studs, order, gradeMap });
  }
}

/**
 * Avancement d'UNE matière (au sens de l'écran de saisie) sur une période :
 * combien de ses élèves ont une note/observation. Sert au repérage des
 * « matières sans aucune note ».
 *
 * En APC premier cycle, les matières ne portent pas les compétences notées :
 * l'information n'est pas dérivable d'une ligne `subjects` → `rate: null`.
 *
 * @returns { total, filled, rate } — `rate: null` si non calculable.
 */
export function subjectEntryRate({
  engine, sub, studs = [], order,
  gradeMap, primNotes, matObservations,
}) {
  const total = studs.length;
  if (!total || order == null) return { total, filled: 0, rate: null };

  let filledCount = null;
  if (engine === 'maternelle') {
    const dom = sub?.mat_domaine_id;
    filledCount = dom
      ? studs.filter((s) => filled(matObservations?.[`${s.id}_${dom}_t${order}`]?.niveau_acquis)).length
      : null;
  } else if (engine === 'apc_primaire') {
    const comp = sub?.prim_competence_id;
    if (comp) {
      const done = new Set();
      for (const n of Object.values(primNotes || {})) {
        if (Number(n?.ua) === Number(order) && n?.competence_id === comp && filled(n?.note)) done.add(n.eleve_id);
      }
      filledCount = studs.filter((s) => done.has(s.id)).length;
    }
  } else if (engine === 'apc') {
    filledCount = null;                       // non dérivable d'une matière
  } else {
    filledCount = studs.filter((s) => filled(gradeMap?.[`${sub.class_id}_${s.id}_${order}`]?.[sub.id])).length;
  }

  if (filledCount === null) return { total, filled: 0, rate: null };
  return { total, filled: filledCount, rate: Math.round((filledCount / total) * 100) };
}

/**
 * Dernière période où la classe a DÉJÀ des saisies — repli quand le calendrier
 * scolaire n'est pas renseigné. Parcourt les rangs à l'envers et renvoie le
 * premier non vide, sinon null.
 */
export function latestPeriodWithData({ engine, cls, subs, studs, maxOrder, ...sources }) {
  for (let order = maxOrder; order >= 1; order--) {
    const { entered } = classEntryProgress({ engine, cls, subs, studs, order, ...sources });
    if (entered > 0) return order;
  }
  return null;
}
