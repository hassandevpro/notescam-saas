// ─────────────────────────────────────────────────────────────────────────────
// MOTEUR DE TABLEAUX D'HONNEUR — entièrement piloté par configuration.
// ─────────────────────────────────────────────────────────────────────────────
// Aucun type de tableau n'est codé en dur : un « modèle » (objet de config, cf.
// honorRollTemplates.js) décrit le périmètre (scope), les filtres, le tri et la
// limite. Le moteur transforme les données de l'école en GROUPES classés, prêts
// à être mis en page (honorRollDoc.js). Ajouter un tableau = ajouter un modèle.
//
// Comparaison inter-systèmes : chaque moyenne est ramenée à un score 0..1
// (`score = moyenne / barème`) pour classer équitablement FR(/20), EN(/100),
// ES(/10|/20) dans un même tableau « établissement ».

import { multiAvg, buildRanks, getAppreciation } from '../core/bulletinEngine';
import { transcriptColumns } from './transcriptEngine';
import { resolveCountryCode } from '../countries';
import { gradingOpts, geGradeMax, classScale } from './useCountry';

// Conduite (lettres) → score /20 pour les seuils de filtrage.
export const CONDUITE_SCORE = { TB: 20, B: 16, AB: 12, P: 8, M: 4 };

// Séquences/évaluations d'une classe selon son système & le pays.
function seqsFor(cls, cc) {
  const sys = cls.system || 'FR';
  const cycle = cls.cycle || 'secondaire';
  return transcriptColumns(sys, cycle, cc).seqs;
}

// ── 1) Lignes élèves enrichies (moyenne annuelle, rang, mention, conduite…) ───
// Renvoie une ligne par élève (hors maternelle), avec tout le nécessaire au
// filtrage/tri, quel que soit le type de tableau.
export function computeStudentRows({ school, classes, subjects, students, gradeMap }) {
  const cc = resolveCountryCode(school);
  const rows = [];
  classes.forEach((cls) => {
    if (cls.cycle === 'maternelle') return;
    const sys = cls.system || 'FR';
    const cycle = cls.cycle || 'secondaire';
    const opts = gradingOpts(school, cycle);
    const seqs = seqsFor(cls, cc);
    const subs = subjects.filter((s) => s.class_id === cls.id);
    const studs = students.filter((s) => s.class_id === cls.id);
    if (!studs.length || !subs.length) return;

    const ranked = buildRanks(studs, gradeMap, cls.id, seqs, subs, sys, {}, opts);
    const scaleMax = classScale(cls, school);
    const lastSeq = seqs[seqs.length - 1];

    ranked.forEach((s) => {
      const avg = s.av;
      const appr = avg != null ? getAppreciation(avg, school?.grade_scale, sys, geGradeMax(school)) : null;
      const slot = gradeMap[`${cls.id}_${s.id}_${lastSeq}`] || {};
      let absNJ = 0;
      seqs.forEach((q) => {
        const e = gradeMap[`${cls.id}_${s.id}_${q}`] || {};
        const n = parseFloat(e.__abs_nj__);
        if (!isNaN(n)) absNJ += n;
      });
      // Détail par matière (moyenne annuelle) — pour les modèles « diplôme ».
      const breakdown = subs.map((subj) => {
        const vals = seqs.map((q) => {
          const v = (gradeMap[`${cls.id}_${s.id}_${q}`] || {})[subj.id];
          const n = parseFloat(v);
          return (v === 'ABS' || v == null || v === '' || isNaN(n)) ? null : n;
        }).filter((x) => x !== null);
        return { name: subj.name, max: subj.max, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null };
      });
      rows.push({
        subjects: breakdown,
        id: s.id, name: s.name, matricule: s.matricule || '', gender: s.gender || '',
        photo_url: s.photo_url || '',
        classId: cls.id, className: cls.name, level: cls.level || '',
        filiere: cls.filiere || cls.serie || cls.stream || '',
        classSize: studs.length,
        sys, scaleMax,
        avg: avg == null ? null : Math.round(avg * 100) / 100,
        score: avg == null ? -1 : avg / scaleMax,
        rankInClass: avg == null ? null : parseInt(String(s.rankD), 10),
        rankLabel: s.rankD,
        mention: appr ? (appr.text || appr.txt || appr.g || '') : '',
        mentionCol: appr?.col || '',
        conduite: slot.__conduite__ || '',
        absNJ,
      });
    });
  });
  return rows;
}

// ── 2) Classement par matière (meilleurs résultats par matière) ───────────────
// Regroupe par NOM de matière (fusionne les classes de même intitulé) ; chaque
// élève est noté sur la moyenne annuelle de cette matière.
export function computeSubjectRows({ school, classes, subjects, students, gradeMap }, subjectFilterName) {
  const cc = resolveCountryCode(school);
  const bySubject = {}; // name → rows[]
  classes.forEach((cls) => {
    if (cls.cycle === 'maternelle') return;
    const sys = cls.system || 'FR';
    const cycle = cls.cycle || 'secondaire';
    const opts = gradingOpts(school, cycle);
    const seqs = seqsFor(cls, cc);
    const subs = subjects.filter((s) => s.class_id === cls.id);
    const studs = students.filter((s) => s.class_id === cls.id);
    const scaleMax = classScale(cls, school);
    subs.forEach((subj) => {
      if (subjectFilterName && subj.name.toLowerCase() !== subjectFilterName.toLowerCase()) return;
      const key = subj.name;
      (bySubject[key] ||= []);
      studs.forEach((s) => {
        // moyenne annuelle de CETTE matière = moyenne des séquences disponibles
        const vals = seqs.map((q) => {
          const v = (gradeMap[`${cls.id}_${s.id}_${q}`] || {})[subj.id];
          const n = parseFloat(v);
          return v === 'ABS' || v == null || v === '' || isNaN(n) ? null : n;
        }).filter((x) => x !== null);
        if (!vals.length) return;
        const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        bySubject[key].push({
          id: s.id, name: s.name, matricule: s.matricule || '', gender: s.gender || '',
          photo_url: s.photo_url || '', classId: cls.id, className: cls.name, level: cls.level || '',
          sys, scaleMax, avg, score: avg / scaleMax, subjectMax: subj.max, subjectName: subj.name,
        });
      });
    });
  });
  return bySubject;
}

// ── 3) Filtres de sélection ───────────────────────────────────────────────────
function passFilters(r, f = {}) {
  if (r.avg == null) return false;
  if (f.minAvgPct != null && r.score * 100 < f.minAvgPct) return false;
  if (f.maxRank != null && (r.rankInClass == null || r.rankInClass > f.maxRank)) return false;
  if (f.gender && r.gender !== f.gender) return false;
  if (f.classIds?.length && !f.classIds.includes(r.classId)) return false;
  if (f.levels?.length && !f.levels.includes(r.level)) return false;
  if (f.conduiteMin != null && (CONDUITE_SCORE[r.conduite] || 0) < f.conduiteMin) return false;
  if (f.maxAbsNJ != null && (r.absNJ || 0) > f.maxAbsNJ) return false;
  if (f.mentionIn?.length && !f.mentionIn.includes(r.mention)) return false;
  return true;
}

function groupKey(r, scope) {
  switch (scope) {
    case 'class':  return r.className;
    case 'level':  return r.level || '—';
    case 'gender': return r.gender === 'F' ? 'F' : r.gender === 'M' ? 'M' : '—';
    default:       return '__all__';
  }
}

function groupTitle(scope, key, t) {
  if (scope === 'gender') return key === 'F' ? t('Filles', 'Girls', 'Chicas') : key === 'M' ? t('Garçons', 'Boys', 'Chicos') : key;
  if (scope === 'class')  return key;
  if (scope === 'level')  return key;
  return null;
}

// ── 4) Application d'un modèle → groupes classés prêts à imprimer ──────────────
// template : { scope, filters, sort, limit, subjectName? }
// ctx      : { t } pour les titres traduits
export function applyTemplate(template, data, ctx = {}) {
  const t = ctx.t || ((fr) => fr);
  const { scope = 'school', filters = {}, limit = null, sort = 'score', subjectName } = template;

  // Mode matière : un groupe par matière.
  if (scope === 'subject') {
    const bySubject = computeSubjectRows(data, subjectName);
    return Object.entries(bySubject).map(([name, rows]) => {
      let rs = rows.filter((r) => passFilters(r, filters));
      rs.sort((a, b) => b.score - a.score);
      rs = limit ? rs.slice(0, limit) : rs;
      rs.forEach((r, i) => { r.rank = i + 1; });
      return { title: name, scope, rows: rs };
    }).filter((g) => g.rows.length);
  }

  const all = computeStudentRows(data).filter((r) => passFilters(r, filters));

  // Regroupement.
  const groups = {};
  all.forEach((r) => { (groups[groupKey(r, scope)] ||= []).push(r); });

  return Object.entries(groups).map(([key, rows]) => {
    rows.sort((a, b) => {
      if (sort === 'conduite') return (CONDUITE_SCORE[b.conduite] || 0) - (CONDUITE_SCORE[a.conduite] || 0);
      if (sort === 'absNJ')    return (a.absNJ || 0) - (b.absNJ || 0) || b.score - a.score;
      return b.score - a.score;
    });
    const limited = limit ? rows.slice(0, limit) : rows;
    limited.forEach((r, i) => { r.rank = i + 1; });
    return { title: groupTitle(scope, key, t), scope, rows: limited };
  }).filter((g) => g.rows.length)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
}

// Listes utiles à l'UI (filtres) — niveaux et matières distincts.
export function distinctLevels(classes) {
  return [...new Set(classes.filter((c) => c.cycle !== 'maternelle').map((c) => c.level).filter(Boolean))].sort();
}
export function distinctSubjectNames(subjects) {
  return [...new Set(subjects.map((s) => s.name).filter(Boolean))].sort();
}
