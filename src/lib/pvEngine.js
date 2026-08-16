// ─────────────────────────────────────────────────────────────────────────────
// PROCÈS-VERBAL DE DÉLIBÉRATION — logique métier pure (pas de React, pas de DOM)
// ─────────────────────────────────────────────────────────────────────────────
// Un PV n'est pas un bulletin : c'est le tableau de délibération d'une CLASSE
// entière — une ligne par élève, une colonne par matière (avec le détail des
// unités d'évaluation de la période), puis moyenne générale, décision, rang et
// mention. Il se termine par un résumé (effectif, admis, taux de réussite).
//
// Le PV suit le MOTEUR DE BULLETIN de la classe ([[engineResolver]]) : chaque
// moteur expose ses propres unités d'évaluation et son propre barème.
//
//   classic / sc   → notes de `gradeMap`, séquences de la période, /20 (ou /100)
//   apc            → référentiel APC 1er cycle, séquences MINESEC, /20
//   apc_primaire   → référentiel primaire, Unités d'Apprentissage (UA), /10
//   maternelle     → non applicable (évaluation par domaines, non chiffrée)
//
// Aucune moyenne n'est recalculée « à part » : on réutilise multiAvg/fusedG
// (moteur classique), assemblePeriod/assembleApcAnnual (APC) et
// competencePointsTotal (primaire) — les mêmes fonctions que les bulletins.

import { multiAvg, fusedG, getAppreciation } from '../core/bulletinEngine.js';
import { assemblePeriod, assembleApcAnnual } from './apcBulletinDoc.js';
import { sequencesOfTrimestre, TRIM_TO_SEQ } from '../core/apcEngine.js';
import {
  competencesForNiveau, criteresForCompetence, competencePointsTotal,
  generalAverage as primGeneralAverage, primCote, PRIM_COTE_DEFAULT, UA_PAR_TRIMESTRE,
  primNkey,
} from '../core/primEngine.js';

// ── Périodes de délibération ─────────────────────────────────────────────────
// Un conseil de classe délibère par TRIMESTRE (ou en fin d'année). Chaque moteur
// traduit ensuite le trimestre en ses propres unités (séquences, UA…).
export const PV_PERIODS = [
  { key: 't1',     trimestre: 1, fr: 'Trimestre 1', en: 'Term 1', es: 'Trimestre 1' },
  { key: 't2',     trimestre: 2, fr: 'Trimestre 2', en: 'Term 2', es: 'Trimestre 2' },
  { key: 't3',     trimestre: 3, fr: 'Trimestre 3', en: 'Term 3', es: 'Trimestre 3' },
  { key: 'annuel', trimestre: 0, fr: 'Annuel',      en: 'Annual', es: 'Anual' },
];

export const pvPeriodLabel = (key, sys) => {
  const p = PV_PERIODS.find((x) => x.key === key) || PV_PERIODS[0];
  return sys === 'EN' ? p.en : sys === 'ES' ? p.es : p.fr;
};

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const L = (sys, fr, en, es) => (sys === 'EN' ? en : sys === 'ES' ? (es || fr) : fr);
const mean = (vals) => (vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null);

// Le PV n'est produit que pour les moteurs à moyenne chiffrée.
export const PV_ENGINES = ['classic', 'sc', 'apc', 'apc_primaire'];
export const pvApplicable = (engine) => PV_ENGINES.includes(engine);

// ── Unités d'évaluation d'une période, selon le moteur ───────────────────────
// Renvoie [{ key, label, seqs: [n] }]. Une unité regroupe une ou plusieurs
// évaluations : séquence isolée (S1), trimestre entier (T1, en vue annuelle) ou
// Unité d'Apprentissage du primaire (UA1). Le PV annuel affiche TOUJOURS les
// trois trimestres — six colonnes de séquences seraient illisibles.
export function pvUnits({ engine, sys, cycle, countryCode, primSequences = false, period = 't1' }) {
  const trim = PV_PERIODS.find((p) => p.key === period)?.trimestre ?? 1;
  const annual = trim === 0;
  const termLabel = (n) => (sys === 'EN' ? `Term ${n}` : `T${n}`);

  if (engine === 'apc_primaire') {
    if (annual) {
      return [1, 2, 3].map((n) => ({ key: `t${n}`, label: termLabel(n), seqs: UA_PAR_TRIMESTRE[n] || [] }));
    }
    return (UA_PAR_TRIMESTRE[trim] || [1, 2, 3]).map((ua) => ({ key: `ua${ua}`, label: `UA${ua}`, seqs: [ua] }));
  }

  if (engine === 'apc') {
    if (annual) return [1, 2, 3].map((n) => ({ key: `t${n}`, label: termLabel(n), seqs: TRIM_TO_SEQ[`t${n}`] }));
    return (TRIM_TO_SEQ[`t${trim}`] || [1, 2]).map((n) => ({ key: `s${n}`, label: `S${n}`, seqs: [n] }));
  }

  // Moteurs à notes (classic / sc). Deux rythmes possibles :
  //   • 6 séquences (francophone secondaire, primaire en mode séquences),
  //   • 3 périodes  (anglophone : terms ; fondamental : trimestres ; Guinée Éq.).
  const sixSeq = countryCode !== 'guinea_eq' && sys !== 'EN'
    && (cycle === 'secondaire' || primSequences);
  if (sixSeq) {
    if (annual) return [1, 2, 3].map((n) => ({ key: `t${n}`, label: termLabel(n), seqs: TRIM_TO_SEQ[`t${n}`] }));
    return (TRIM_TO_SEQ[`t${trim}`] || [1, 2]).map((n) => ({ key: `s${n}`, label: `S${n}`, seqs: [n] }));
  }
  const nums = annual ? [1, 2, 3] : [trim];
  return nums.map((n) => ({ key: `p${n}`, label: termLabel(n), seqs: [n] }));
}

// Toutes les séquences (ou UA) couvertes par la période.
const allSeqs = (units) => units.flatMap((u) => u.seqs);

// Décision de délibération dérivée de la moyenne (le conseil peut la surcharger).
function pvDecision(avg, pass, sys) {
  if (avg == null) return { text: L(sys, 'NON DÉLIBÉRÉ', 'PENDING', 'PENDIENTE'), passed: null };
  return avg >= pass
    ? { text: L(sys, 'ADMIS(E)', 'PASSED', 'APROBADO'), passed: true }
    : { text: L(sys, 'AJOURNÉ(E)', 'FAILED', 'SUSPENSO'), passed: false };
}

// Rangs à partir des moyennes (ex æquo partagés, non notés sans rang).
function rankMap(entries) {
  const wa = entries.filter((e) => e.avg != null).sort((a, b) => b.avg - a.avg);
  const out = {};
  let rk = 1;
  wa.forEach((e, i) => {
    if (i > 0 && e.avg < wa[i - 1].avg) rk = i + 1;
    out[e.id] = rk;
  });
  return out;
}

function ordinal(n, sys) {
  if (sys !== 'EN') return `${n}${n === 1 ? 'er' : 'e'}`;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
}

// Résumé de délibération (pied du PV).
function pvSummary(rows, pass) {
  const avgs = rows.map((r) => r.avg).filter((v) => v != null);
  const admis = rows.filter((r) => r.decision.passed === true).length;
  return {
    total: rows.length,
    notes: avgs.length,
    admis,
    ajournes: rows.filter((r) => r.decision.passed === false).length,
    rate: avgs.length ? Math.round((admis / avgs.length) * 100) : null,
    avg: mean(avgs),
    min: avgs.length ? r2(Math.min(...avgs)) : null,
    max: avgs.length ? r2(Math.max(...avgs)) : null,
    pass,
  };
}

// ── Moteurs à notes (classique / second cycle) ───────────────────────────────
function buildNotesPv({ cls, sys, students, subjects, gradeMap, units, opts, gradeScale }) {
  const maxScale = opts?.maxScale ?? (sys === 'EN' ? 100 : sys === 'ES' ? 10 : 20);
  const seqs = allSeqs(units);
  const tops = (subjects || []).filter((s) => !s.parent_id);
  const cols = tops.map((s) => ({ key: s.id, name: s.name, code: s.code || null, coef: s.coef || 1 }));

  const num = (v) => (v == null || v === '' ? null : Number(v));

  const rows = students.map((st) => {
    const cells = {};
    for (const s of tops) {
      const byUnit = {};
      for (const u of units) byUnit[u.key] = num(fusedG(gradeMap, cls.id, st.id, u.seqs, [s])[s.id]);
      cells[s.id] = { byUnit, moy: num(fusedG(gradeMap, cls.id, st.id, seqs, [s])[s.id]) };
    }
    return {
      id: st.id, name: st.name, matricule: st.matricule || '', cells,
      avg: multiAvg(gradeMap, cls.id, st.id, seqs, subjects, sys, opts),
    };
  });

  return { cols, rows, maxScale, pass: maxScale / 2, gradeScale };
}

// ── Moteur APC (premier cycle MINESEC) ───────────────────────────────────────
// Une passe d'assemblage par unité donne la note de chaque matière ; la moyenne
// de matière et la moyenne générale viennent de l'assemblage sur la période
// complète (mêmes règles que le bulletin APC officiel).
function buildApcPv({ sys, students, units, referentiel, notes, classeSlug, annual, trimestreId, gradeScale }) {
  const seqIdsOf = (nums) => {
    const all = referentiel?.sequences || [];
    return nums.map((n) => {
      const trimSeqs = sequencesOfTrimestre(all, `t${Math.ceil(n / 2)}`);
      const byNum = trimSeqs.find((s) => s.numero === n);
      return (byNum || trimSeqs[n % 2 === 1 ? 0 : 1] || trimSeqs[0])?.id;
    }).filter(Boolean);
  };

  const colMap = new Map();
  const addCol = (m) => {
    if (!colMap.has(m.id)) colMap.set(m.id, { key: m.id, name: m.nom, code: null, coef: m.coef });
  };

  const rows = students.map((st) => {
    const cells = {};
    if (annual) {
      // Vue annuelle : le moteur APC fournit déjà T1/T2/T3 par matière.
      const d = assembleApcAnnual(referentiel, notes, { classeSlug, student: st, gradeScale });
      for (const m of d.matieres) {
        addCol(m);
        cells[m.id] = { moy: m.moyenne, byUnit: { t1: m.t1, t2: m.t2, t3: m.t3 } };
      }
      return { id: st.id, name: st.name, matricule: st.matricule || '', cells, avg: d.moyenneGenerale ?? null };
    }

    const full = assemblePeriod(referentiel, notes, {
      classeSlug, trimestreId, seqIds: seqIdsOf(allSeqs(units)), student: st, gradeScale,
    });
    const perUnit = {};
    for (const u of units) {
      const one = assemblePeriod(referentiel, notes, {
        classeSlug, trimestreId, seqIds: seqIdsOf(u.seqs), student: st, gradeScale,
      });
      perUnit[u.key] = Object.fromEntries(one.matieres.map((m) => [m.id, m.moyenne]));
    }
    for (const m of full.matieres) {
      addCol(m);
      cells[m.id] = {
        moy: m.moyenne,
        byUnit: Object.fromEntries(units.map((u) => [u.key, perUnit[u.key]?.[m.id] ?? null])),
      };
    }
    return { id: st.id, name: st.name, matricule: st.matricule || '', cells, avg: full.moyenneGenerale ?? null };
  });

  return { cols: [...colMap.values()], rows, maxScale: 20, pass: 10, gradeScale };
}

// ── Moteur primaire APC (SIL–CM2) ────────────────────────────────────────────
// Colonnes = compétences du niveau ; unités = UA de la période. La note d'une
// compétence sur une UA = pourcentage des points obtenus ramené à /10 — même
// règle que le bulletin primaire officiel.
function buildPrimPv({ students, units, referentiel, notes, niveauSlug, bareme }) {
  const GRADE_MAX = 10;
  const comps = competencesForNiveau(referentiel, niveauSlug);
  const scale = bareme?.length ? bareme : PRIM_COTE_DEFAULT;
  const coefOf = (c) => (c.coefficient == null ? 1 : Number(c.coefficient) || 1);

  const criteresFor = (compId, student) => criteresForCompetence(
    referentiel, niveauSlug, compId,
    compId === '6a' && student?.sport_aptitude === 'inapte' ? 'inapte' : 'apte',
  );

  const uaScore = (student, comp, ua) => {
    const criteres = criteresFor(comp.id, student);
    if (!criteres.length) return null;
    const notesByCritere = {};
    for (const cr of criteres) {
      const rec = notes[primNkey(student.id, comp.id, cr.id, ua)];
      if (rec?.note != null && rec.note !== '') notesByCritere[cr.id] = rec.note;
    }
    const { achieved, possible } = competencePointsTotal(notesByCritere, criteres);
    return achieved != null && possible ? r2((achieved / possible) * GRADE_MAX) : null;
  };

  const cols = comps.map((c) => ({ key: c.id, name: c.intitule, code: c.code, coef: coefOf(c) }));

  const rows = students.map((st) => {
    const cells = {};
    const forAvg = [];
    for (const c of comps) {
      const byUnit = {};
      const all = [];
      for (const u of units) {
        const vals = u.seqs.map((ua) => uaScore(st, c, ua)).filter((v) => v != null);
        byUnit[u.key] = mean(vals);
        all.push(...vals);
      }
      const moy = mean(all);
      cells[c.id] = { byUnit, moy };
      forAvg.push({ moyenne: moy, coef: coefOf(c) });
    }
    return { id: st.id, name: st.name, matricule: st.matricule || '', cells, avg: primGeneralAverage(forAvg) };
  });

  return { cols, rows, maxScale: GRADE_MAX, pass: GRADE_MAX / 2, primScale: scale };
}

// ── Assemblage complet du PV d'une classe ────────────────────────────────────
// ctx :
//   cls, engine, sys, cycle, countryCode, schoolYear, period, students,
//   subjects, gradeMap, opts, gradeScale                     (classic / sc)
//   apcReferentiel, apcNotes, apcClasseSlug                  (apc)
//   primReferentiel, primNotes, primNiveauSlug, primBareme   (apc_primaire)
//   decisions : { [studentId]: 'texte' } — décision explicite du conseil
// Renvoie null si le moteur n'est pas délibérable (maternelle) ou s'il manque le
// référentiel nécessaire.
export function buildClassPv(ctx) {
  const {
    cls, engine, sys = 'FR', cycle = 'secondaire', countryCode, schoolYear,
    period = 't1', students = [], subjects = [], gradeMap = {}, opts = {}, gradeScale,
    apcReferentiel, apcNotes = {}, apcClasseSlug,
    primReferentiel, primNotes = {}, primNiveauSlug, primBareme,
    primSequences = false, decisions = {}, teacherName = '',
  } = ctx;

  if (!pvApplicable(engine)) return null;
  if (engine === 'apc' && (!apcReferentiel || !apcClasseSlug)) return null;
  if (engine === 'apc_primaire' && (!primReferentiel || !primNiveauSlug)) return null;

  const units = pvUnits({ engine, sys, cycle, countryCode, primSequences, period });
  const trim = PV_PERIODS.find((p) => p.key === period)?.trimestre ?? 1;
  const annual = trim === 0;

  const base = engine === 'apc'
    ? buildApcPv({ sys, students, units, referentiel: apcReferentiel, notes: apcNotes, classeSlug: apcClasseSlug, annual, trimestreId: `t${trim || 1}`, gradeScale })
    : engine === 'apc_primaire'
      ? buildPrimPv({ students, units, referentiel: primReferentiel, notes: primNotes, niveauSlug: primNiveauSlug, bareme: primBareme })
      : buildNotesPv({ cls, sys, students, subjects, gradeMap, units, opts, gradeScale });

  const { cols, rows, maxScale, pass } = base;
  const ranks = rankMap(rows);

  const enriched = rows.map((r) => {
    const auto = pvDecision(r.avg, pass, sys);
    const explicit = decisions[r.id];
    const mention = r.avg == null ? '' : (engine === 'apc_primaire'
      ? (primCote(r.avg, maxScale, base.primScale)?.libelle || '')
      : (() => {
          const a = getAppreciation(r.avg, base.gradeScale, sys, maxScale);
          return sys === 'EN' ? `${a.g} — ${a.txt}` : a.text;
        })());
    const rk = ranks[r.id];
    return {
      ...r,
      decision: explicit ? { text: explicit, passed: auto.passed } : auto,
      rank: rk ?? null,
      rankTxt: rk ? `${ordinal(rk, sys)} / ${rows.length}` : '—',
      mention,
    };
  });

  // Ordre de délibération : par rang (meilleure moyenne d'abord), non notés en fin.
  enriched.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.name.localeCompare(b.name));

  return {
    cls, engine, sys, cycle, schoolYear, teacherName, annual,
    period, periodLabel: pvPeriodLabel(period, sys),
    units, cols, rows: enriched, maxScale,
    summary: pvSummary(enriched, pass),
  };
}
