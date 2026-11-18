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

import { resolveCountryCode } from '../countries';
import { primaryPeriodMode } from './useCountry';
import { resolveClassEngine } from '../core/engineResolver';
import { computeClassReport } from './classReportRun';
import { periodePourClasse } from '../core/honorPeriod';
import { lireReglagesHonneur, normaliserModele, seuilDuModele, seuilAuBareme, versSur20, niveauAtteint } from '../core/honorSettings';
import { surcoucheVieScolaire, cumulVieScolaire } from '../core/vieScolaireBulletin';

// Conduite (lettres) → score /20 pour les seuils de filtrage.
export const CONDUITE_SCORE = { TB: 20, B: 16, AB: 12, P: 8, M: 4 };


// ── 1) Lignes élèves enrichies (moyenne DE LA PÉRIODE, rang, niveau, conduite…) ──
// Moyennes et rangs : ceux des RAPPORTS DE CLASSE (lib/classReportRun), donc du bulletin,
// pour tout moteur — classique, collège APC, primaire MINEDUB. Avant (2026-11-18), seul le
// moteur classique était lu, et toujours sur l'année entière.
//
// data : { school, classes, subjects, students, gradeMap,
//          reportCtx,                // contexte des rapports (notes APC, primaire, masques…)
//          periodKey,                // clé d'HONOR_PERIODS (défaut 'annual')
//          reglages,                 // lireReglagesHonneur(school)
//          vsAgg }                   // agregerVieScolaire(...) de l'école (facultatif)
// Renvoie les lignes ; `data.indisponibles` (si fourni, tableau) reçoit les classes sautées.
export function computeStudentRows(data) {
  const { school, classes, students, gradeMap = {}, reportCtx, periodKey = 'annual', vsAgg = null } = data;
  const reglages = data.reglages || lireReglagesHonneur(school);
  const cc = resolveCountryCode(school);
  const isGE = cc === 'guinea_eq';
  const primSeqMode = primaryPeriodMode(school) === 'sequences';
  const rows = [];
  classes.forEach((cls) => {
    if (cls.cycle === 'maternelle') return;
    const engine = resolveClassEngine(school, cls);
    const { period, raison } = periodePourClasse(periodKey, { engine, isGE, primSeqMode, apcReferentiel: reportCtx?.apcReferentiel });
    if (!period) { data.indisponibles?.push({ classId: cls.id, className: cls.name, raison }); return; }
    const rep = reportCtx ? computeClassReport(cls, period, reportCtx) : null;
    if (!rep || rep.notReady) { if (rep?.notReady) data.indisponibles?.push({ classId: cls.id, className: cls.name, raison: 'donnees' }); return; }
    const sys = cls.system || 'FR';
    const scaleMax = rep.maxScale || 20;
    const studs = students.filter((s) => s.class_id === cls.id);
    // Vie scolaire de la période : registre (par date) + saisie du conseil (prioritaire).
    const gm = vsAgg ? surcoucheVieScolaire(gradeMap, cls.id, vsDeClasse(vsAgg, studs)) : gradeMap;
    const seqs = period.seqs || [];
    const lastSeq = seqs[seqs.length - 1];

    rep.studentResults.forEach((r) => {
      const s = r.student;
      const avg = r.avg == null ? null : Math.round(r.avg * 100) / 100;
      const slot = gm[`${cls.id}_${s.id}_${lastSeq}`] || {};
      let absNJ = 0;
      seqs.forEach((q) => { const n = parseFloat((gm[`${cls.id}_${s.id}_${q}`] || {}).__abs_nj__); if (!isNaN(n)) absNJ += n; });
      const vs = cumulVieScolaire(gm, cls.id, s.id, seqs);
      rows.push({
        subjects: [],
        id: s.id, name: s.name, matricule: s.matricule || '', gender: s.gender || '',
        photo_url: s.photo_url || '',
        classId: cls.id, className: cls.name, level: cls.level || '', cycle: cls.cycle || '',
        filiere: cls.filiere || cls.serie || cls.stream || '',
        classSize: studs.length,
        sys, scaleMax, engine,
        avg, avg20: versSur20(avg, scaleMax),
        score: avg == null ? -1 : avg / scaleMax,
        rankInClass: r.rank?.rankN ?? null,
        rankLabel: r.rank?.rankD ?? '',
        mention: r.appr ? (r.appr.text || r.appr.txt || r.appr.g || '') : '',
        mentionCol: r.appr?.col || '',
        conduite: slot.__conduite__ || '',
        absNJ,
        sanctionne: (vs.blameTravail + vs.blameConduite + vs.exclusions + vs.exclDef) > 0,
      });
    });
  });
  return rows;
}

// Ne garde du registre de vie scolaire que les élèves d'une classe.
function vsDeClasse(vsAgg, studs) {
  const ids = new Set(studs.map((s) => s.id));
  return { byStudent: Object.fromEntries(Object.entries(vsAgg.byStudent || {}).filter(([id]) => ids.has(id))) };
}

// ── 2) Classement par matière (meilleurs résultats par matière) ───────────────
// Regroupe par NOM de matière (fusionne les classes de même intitulé) ; chaque
// élève est noté sur la moyenne annuelle de cette matière.
export function computeSubjectRows({ school, classes, subjects, students, gradeMap, periodKey = 'annual', indisponibles }, subjectFilterName) {
  const cc = resolveCountryCode(school);
  const isGE = cc === 'guinea_eq';
  const bySubject = {}; // name → rows[]
  classes.forEach((cls) => {
    if (cls.cycle === 'maternelle') return;
    const sys = cls.system || 'FR';
    // Moyenne PAR MATIÈRE : lue dans les notes de séquence, ce qui n'a de sens que pour
    // le moteur classique. Les classes APC / primaire sont signalées, pas inventées.
    const engine = resolveClassEngine(school, cls);
    if (engine !== 'classic') { indisponibles?.push({ classId: cls.id, className: cls.name, raison: 'matiere_' + engine }); return; }
    const { period } = periodePourClasse(periodKey, { engine, isGE });
    if (!period) return;
    const seqs = period.seqs;
    const subs = subjects.filter((s) => s.class_id === cls.id);
    const studs = students.filter((s) => s.class_id === cls.id);
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
          sys, scaleMax: Number(subj.max) || 20, avg, avg20: versSur20(avg, Number(subj.max) || 20),
          score: avg / (Number(subj.max) || 20), subjectMax: subj.max, subjectName: subj.name,
        });
      });
    });
  });
  return bySubject;
}

// ── 3) Filtres de sélection ───────────────────────────────────────────────────
// Le SEUIL (sur 20) est ramené au barème de la classe de chaque élève. `ctx` :
// { seuil, reglages } calculés une fois par modèle.
function passFilters(r, f = {}, ctx = {}) {
  if (r.avg == null) return false;
  if (ctx.seuil != null && r.avg < seuilAuBareme(ctx.seuil, r.scaleMax)) return false;
  if (ctx.reglages?.excludeSanctioned && r.sanctionne) return false;
  if (f.maxRank != null && f.maxRank !== '' && (r.rankInClass == null || r.rankInClass > f.maxRank)) return false;
  if (f.gender && r.gender !== f.gender) return false;
  if (f.classIds?.length && !f.classIds.includes(r.classId)) return false;
  if (f.levels?.length && !f.levels.includes(r.level)) return false;
  if (f.conduiteMin != null && f.conduiteMin !== '' && (CONDUITE_SCORE[r.conduite] || 0) < f.conduiteMin) return false;
  if (f.maxAbsNJ != null && f.maxAbsNJ !== '' && (r.absNJ || 0) > f.maxAbsNJ) return false;
  if (f.mentionIn?.length && !f.mentionIn.includes(r.mention)) return false;
  return true;
}

// Niveau de distinction (Tableau d'honneur / Encouragements / Félicitations) d'une ligne.
function poserNiveau(r, ctx) {
  r.honorLevel = niveauAtteint(r.avg20, ctx.seuil, ctx.reglages);
  return r;
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
export function applyTemplate(templateBrut, data, ctx = {}) {
  const t = ctx.t || ((fr) => fr);
  const template = normaliserModele(templateBrut);       // ancien « % » → sur 20, en mémoire
  const { scope = 'school', filters = {}, limit = null, sort = 'score', subjectName } = template;
  const reglages = data.reglages || lireReglagesHonneur(data.school);
  const fctx = { reglages, seuil: seuilDuModele(template, reglages) };

  // Mode matière : un groupe par matière.
  if (scope === 'subject') {
    const bySubject = computeSubjectRows(data, subjectName);
    return Object.entries(bySubject).map(([name, rows]) => {
      let rs = rows.filter((r) => passFilters(r, filters, { ...fctx, reglages: { ...reglages, excludeSanctioned: false } })).map((r) => poserNiveau(r, fctx));
      rs.sort((a, b) => b.score - a.score);
      rs = limit ? rs.slice(0, limit) : rs;
      rs.forEach((r, i) => { r.rank = i + 1; });
      return { title: name, scope, rows: rs };
    }).filter((g) => g.rows.length);
  }

  // `data.lignes` : lignes déjà calculées pour la période (une fois pour TOUS les modèles de
  // la page) — copiées, car rang et niveau sont posés par modèle.
  const base = data.lignes || computeStudentRows({ ...data, reglages });
  const all = base.filter((r) => passFilters(r, filters, fctx)).map((r) => poserNiveau({ ...r }, fctx));

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
