// ─────────────────────────────────────────────────────────────────────────────
// RELEVÉS DE NOTES — MOTEUR DE PRÉPARATION / VALIDATION / DIAGNOSTIC (pur)
// ─────────────────────────────────────────────────────────────────────────────
// Transforme les données scolaires en un état de PRODUCTION : pour chaque élève,
// son relevé est-il « prêt », « incomplet » ou « bloqué » — et pourquoi ?
//
// Réutilise intégralement le moteur de relevé existant (buildClassTranscripts)
// pour ne JAMAIS dupliquer un calcul de moyenne/rang : on lit ses résultats
// (generalAvg, rows[].annual, rankEntry) et on en dérive un statut + des
// diagnostics actionnables.
//
// Statuts :
//   ready    : moyenne calculée, toutes les matières notées        → générable
//   warning  : moyenne calculée mais ≥1 matière sans note          → générable (à corriger)
//   blocked  : pas de moyenne / pas de matière / pas de note        → NON générable
// Convention KPI : « générables / prêts » = statut ≠ blocked ; « bloqués » = blocked.
// ─────────────────────────────────────────────────────────────────────────────

import { buildClassTranscripts } from './transcriptEngine';
import { transcriptUsesPv } from './transcriptFromPv';
import { gradingOpts } from './useCountry';
// Ordre des matières : la règle unique du produit (voir core/subjectOrder).
import { classSubjectsOf } from '../core/subjectOrder';

// Contexte de calcul d'une classe (matières, élèves, options de notation).
export function classContext(cls, ctx) {
  const { subjects, students, school } = ctx;
  const sys = cls.system || 'FR';
  const cycle = cls.cycle || 'secondaire';
  const classSubjects = classSubjectsOf(subjects, cls.id);
  const classStudents = students.filter((s) => s.class_id === cls.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const opts = { ...gradingOpts(school, cycle), gradeScale: school?.grade_scale };
  return { sys, cycle, classSubjects, classStudents, opts };
}

// Dérive le statut + les anomalies d'un relevé déjà construit (`data`).
function statusFromTranscript(data, classSubjects) {
  const issues = [];

  // Relevé bâti sur le PV (bilingue / APC / primaire) : les « matières » sont ses lignes.
  if (!classSubjects.length && !data.rows.length) {
    issues.push({ code: 'no_subjects' });
    return { status: 'blocked', issues };
  }

  const missing = data.rows.filter((r) => r.annual === null).map((r) => r.subject.name);
  const noGrades = missing.length === data.rows.length; // aucune matière notée

  if (data.generalAvg === null || data.generalAvg === undefined) {
    issues.push(noGrades ? { code: 'no_grades' } : { code: 'no_average' });
    return { status: 'blocked', issues };
  }

  if (missing.length) {
    issues.push({ code: 'missing_subjects', names: missing, count: missing.length });
  }
  if (!data.rankEntry) {
    issues.push({ code: 'no_rank' });
  }

  return { status: missing.length ? 'warning' : 'ready', issues };
}

// Évalue une classe entière → { applicable, cls, total, ready, blocked, warning, students:[…] }
// students : [{ id, name, status, issues, generalAvg, rank, classId }]
export function evaluateClass(cls, ctx) {
  const cycle = cls.cycle || 'secondaire';
  if (cycle === 'maternelle') {
    return { applicable: false, cls, total: 0, ready: 0, blocked: 0, warning: 0, students: [] };
  }

  const { sys, classSubjects, classStudents, opts } = classContext(cls, ctx);

  // Classe dont le bulletin suit un moteur officiel : ses relevés viennent du MÊME
  // calcul que le bulletin et le PV. Les lire dans gradeMap rendait bloqués des
  // centaines de relevés dont le bulletin existait (notes hors gradeMap).
  if (ctx.engineOf && ctx.pvTranscripts && transcriptUsesPv(ctx.engineOf(cls))) {
    const fromPv = ctx.pvTranscripts(cls);
    if (!fromPv.length) {
      // Référentiel officiel absent (chargement, ou programme non pris en charge) :
      // on le dit, on ne laisse pas croire à une saisie manquante.
      const students = classStudents.map((st) => ({
        id: st.id, name: st.name, classId: cls.id, className: cls.name,
        status: 'blocked', issues: [{ code: 'no_reference' }], generalAvg: null, rank: null,
      }));
      return { applicable: true, cls, total: students.length, ready: 0, blocked: students.length, warning: 0, students };
    }
    return summarizeClass(cls, fromPv.map((data) => ({ data })), classSubjects);
  }

  const transcripts = buildClassTranscripts({
    classStudents, cls, subjects: classSubjects, gradeMap: ctx.gradeMap, sys, cycle,
    countryCode: ctx.countryCode, schoolYear: ctx.schoolYear, stats: null, opts,
  });
  return summarizeClass(cls, transcripts.map((data) => ({ data })), classSubjects);
}

function summarizeClass(cls, items, classSubjects) {
  const transcripts = items.map((i) => i.data);

  const students = transcripts.map((data) => {
    const { status, issues } = statusFromTranscript(data, classSubjects);
    return {
      id: data.student.id,
      name: data.student.name,
      classId: cls.id,
      className: cls.name,
      status,
      issues,
      generalAvg: data.generalAvg,
      rank: data.rankEntry?.rankD ?? null,
    };
  });

  const count = (s) => students.filter((x) => x.status === s).length;
  return {
    applicable: true,
    cls,
    total: students.length,
    ready: students.filter((x) => x.status !== 'blocked').length, // générables
    blocked: count('blocked'),
    warning: count('warning'),
    students,
  };
}

// Évalue tout l'établissement (année courante) → agrégats + détail par classe.
export function evaluateSchool(ctx) {
  const evals = (ctx.classes || [])
    .filter((c) => (c.cycle || 'secondaire') !== 'maternelle')
    .map((c) => evaluateClass(c, ctx));

  const studentsTotal = evals.reduce((a, e) => a + e.total, 0);
  return {
    classesCount: evals.length,
    studentsCount: studentsTotal,
    ready: evals.reduce((a, e) => a + e.ready, 0),
    blocked: evals.reduce((a, e) => a + e.blocked, 0),
    warning: evals.reduce((a, e) => a + e.warning, 0),
    byClass: evals,
  };
}

// Toutes les anomalies (warning + blocked) d'un ensemble d'évaluations de classe,
// à plat → alimente le panneau d'alertes. Bloqués d'abord.
export function collectAnomalies(classEvals) {
  const out = [];
  for (const ce of classEvals) {
    for (const st of ce.students) {
      if (st.status === 'ready') continue;
      out.push({ ...st });
    }
  }
  return out.sort((a, b) => (a.status === 'blocked' ? 0 : 1) - (b.status === 'blocked' ? 0 : 1));
}

// ── Checklist de validation (Section 6) ──────────────────────────────────────
// `selection` = { mode, cls, classEval, student } — student requis en single/multi.
// Renvoie 8 items { id, label:[fr,en,es], ok } pour la checklist visuelle.
export function buildChecklist(selection, ctx) {
  const { mode, cls, classEval, student } = selection;
  const needsStudent = mode === 'single' || mode === 'multi';
  const classSubjects = cls ? classContext(cls, ctx).classSubjects : [];

  // Élément de référence pour notes/moyenne/rang : l'élève (single/multi) ou la
  // classe (au moins un relevé générable).
  const ref = needsStudent
    ? classEval?.students.find((s) => s.id === student?.id) || null
    : null;
  const someGenerable = !!classEval && classEval.ready > 0;

  const hasNotes = ref
    ? !ref.issues.some((i) => i.code === 'no_grades')
    : someGenerable;
  const hasAverage = ref ? ref.generalAvg !== null : someGenerable;
  const hasRank = ref ? ref.rank !== null : someGenerable;

  return [
    { id: 'class',    label: ['Classe sélectionnée', 'Class selected', 'Clase seleccionada'], ok: !!cls },
    { id: 'student',  label: ['Élève sélectionné', 'Student selected', 'Alumno seleccionado'], ok: needsStudent ? !!student : true },
    { id: 'notes',    label: ['Notes disponibles', 'Grades available', 'Notas disponibles'], ok: hasNotes },
    { id: 'averages', label: ['Moyennes calculées', 'Averages computed', 'Promedios calculados'], ok: hasAverage },
    { id: 'rank',     label: ['Rang calculé', 'Rank computed', 'Puesto calculado'], ok: hasRank },
    { id: 'subjects', label: ['Matières configurées', 'Subjects configured', 'Asignaturas configuradas'], ok: classSubjects.length > 0 },
    { id: 'template', label: ['Modèle PDF disponible', 'PDF template available', 'Plantilla PDF disponible'], ok: true },
    { id: 'year',     label: ['Année scolaire active', 'Academic year active', 'Año escolar activo'], ok: !!ctx.schoolYear },
  ];
}

// ── Diagnostic intelligent (Section 10) ──────────────────────────────────────
// Traduit un code d'anomalie en { cause, action } lisibles. `t` = useT().
export function describeIssue(issue, t) {
  switch (issue.code) {
    case 'no_subjects':
      return {
        cause:  t('Aucune matière configurée pour cette classe.', 'No subjects configured for this class.', 'Sin asignaturas configuradas.'),
        action: t('Configurer les matières de la classe.', 'Configure the class subjects.', 'Configurar las asignaturas.'),
      };
    case 'no_grades':
      return {
        cause:  t('Aucune note enregistrée pour cet élève.', 'No grades recorded for this student.', 'Sin notas registradas.'),
        action: t('Saisir les notes manquantes.', 'Enter the missing grades.', 'Capturar las notas faltantes.'),
      };
    case 'no_average':
      return {
        cause:  t('Moyenne générale absente.', 'General average missing.', 'Promedio general ausente.'),
        action: t('Recalculer les moyennes (compléter les notes).', 'Recompute averages (complete grades).', 'Recalcular los promedios.'),
      };
    case 'missing_subjects': {
      const list = (issue.names || []).join(', ');
      return {
        cause:  t(`Aucune note pour : ${list}.`, `No grades for: ${list}.`, `Sin notas para: ${list}.`),
        action: t('Saisir les notes des matières concernées.', 'Enter grades for those subjects.', 'Capturar las notas faltantes.'),
      };
    }
    case 'no_reference':
      return {
        cause:  t('Référentiel officiel de la classe indisponible (chargement en cours ou programme non pris en charge).', 'Official curriculum unavailable for this class (still loading or unsupported programme).', 'Referencial oficial no disponible.'),
        action: t('Patienter quelques secondes ; sinon vérifier le programme de la classe.', 'Wait a few seconds; otherwise check the class programme.', 'Esperar unos segundos.'),
      };
    case 'no_rank':
      return {
        cause:  t('Rang non calculé.', 'Rank not computed.', 'Puesto no calculado.'),
        action: t('Vérifier les moyennes de la classe.', 'Check the class averages.', 'Verificar los promedios.'),
      };
    default:
      return { cause: t('Anomalie inconnue.', 'Unknown issue.', 'Anomalía desconocida.'), action: '' };
  }
}

// Résumé court d'une anomalie pour le panneau d'alertes (1 ligne).
export function summarizeIssue(issue, t) {
  switch (issue.code) {
    case 'no_subjects':     return t('Matières non configurées', 'Subjects not configured', 'Asignaturas no configuradas');
    case 'no_grades':       return t('Aucune note saisie', 'No grades entered', 'Sin notas');
    case 'no_average':      return t('Moyenne non calculée', 'Average not computed', 'Promedio no calculado');
    case 'missing_subjects':return t(`${issue.count} matière(s) sans notes`, `${issue.count} subject(s) without grades`, `${issue.count} asignatura(s) sin notas`);
    case 'no_reference':    return t('Référentiel indisponible', 'Curriculum unavailable', 'Referencial no disponible');
    case 'no_rank':         return t('Rang non calculé', 'Rank not computed', 'Puesto no calculado');
    default:                return '';
  }
}
