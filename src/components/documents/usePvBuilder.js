// ─────────────────────────────────────────────────────────────────────────────
// Assemblage du PV d'une classe — UNE seule fois pour tout l'écran Documents.
// ─────────────────────────────────────────────────────────────────────────────
// Le procès-verbal ET le relevé de notes lisent le même calcul (buildClassPv, qui
// appelle les fonctions mêmes des bulletins). Ce hook réunit ce qu'il faut pour
// l'appeler — notes, référentiels officiels, masques décidés par l'école — pour
// que les deux ateliers ne puissent pas diverger.
import { useCallback, useEffect, useMemo } from 'react';
import { masquesCriteresPour } from '../../core/primCriteresMasques';
import { useAuthStore } from '../../store/authStore';
import { useSchoolStore } from '../../store/schoolStore';
import { useUiStore } from '../../store/uiStore';
import { buildClassPv } from '../../lib/pvEngine';
import { resolveClassEngine, firstCycleClasseSlug, primaireNiveauSlug, classSectionKey } from '../../core/engineResolver';
import { gradingOpts, primaryPeriodMode, geGradeMax } from '../../lib/useCountry';
import { bulletinScale } from '../../core/bulletinScale';
import { resolveCountryCode } from '../../countries';
import { headTeacherText } from '../../lib/headTeachers';
import { moyennePointsActive } from '../../core/primMoyennePoints';

// `classesToLoad` : les classes dont le calcul est attendu — seuls les référentiels
// qu'elles utilisent sont chargés.
export default function usePvBuilder(classesToLoad) {
  const school      = useAuthStore((s) => s.school);
  const subjects    = useSchoolStore((s) => s.subjects);
  const students    = useSchoolStore((s) => s.students);
  const gradeMap    = useSchoolStore((s) => s.gradeMap);
  const teachers    = useSchoolStore((s) => s.teachers);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const loadApc         = useSchoolStore((s) => s.loadApc);
  const bilReferentiel  = useSchoolStore((s) => s.bilReferentiel);
  const loadBil         = useSchoolStore((s) => s.loadBil);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const loadPrim        = useSchoolStore((s) => s.loadPrim);
  const apcMasques        = useSchoolStore((s) => s.refMasques.apc);
  const primMasques       = useSchoolStore((s) => s.refMasques.prim);
  const primMasquesClasse = useSchoolStore((s) => s.refMasquesClasse);
  // Critères que l'école n'évalue pas (liste de l'école, comme sur main).
  const primCriteresMasquesEcole = useSchoolStore((s) => s.refMasques.prim_crit);
  const critMasquesParClasse = useSchoolStore((s) => s.refCriteresMasquesClasse);
  const primNonEvaluees   = useSchoolStore((s) => s.primNonEvaluees);
  const loadRefMasques    = useSchoolStore((s) => s.loadRefMasques);
  const viewYear    = useUiStore((s) => s.viewYear);

  const schoolYear  = viewYear ?? school?.current_year ?? '';
  const countryCode = resolveCountryCode(school);

  const engines = useMemo(
    () => new Set((classesToLoad || []).map((c) => resolveClassEngine(school, c))),
    [classesToLoad, school]);
  const needsApc = engines.has('apc');
  const needsBil = engines.has('bilingue');
  const needsPrim = engines.has('apc_primaire');
  useEffect(() => { if (needsApc) { loadApc(); loadRefMasques('apc'); } }, [needsApc, loadApc, loadRefMasques]);
  useEffect(() => { if (needsBil) loadBil(); }, [needsBil, loadBil]);
  useEffect(() => { if (needsPrim) { loadPrim(); loadRefMasques('prim'); loadRefMasques('prim_crit'); } }, [needsPrim, loadPrim, loadRefMasques]);

  // Un référentiel attendu mais pas encore là : les calculs qui en dépendent
  // rendent null. L'écran le dit au lieu d'afficher « bloqué ».
  const referentielsPending = (needsApc && !apcReferentiel) || (needsBil && !bilReferentiel) || (needsPrim && !primReferentiel);

  const pvForClass = useCallback((cls, period = 'annuel') => {
    const engine = resolveClassEngine(school, cls);
    const section = classSectionKey(cls);
    const cycle = cls.cycle || 'secondaire';
    return buildClassPv({
      cls, engine, sys: cls.system || 'FR', cycle, countryCode, schoolYear, period,
      students: students.filter((s) => s.class_id === cls.id).sort((a, b) => a.name.localeCompare(b.name)),
      subjects: subjects.filter((s) => s.class_id === cls.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)),
      gradeMap,
      opts: { ...gradingOpts(school, cycle), ...(cls.system === 'EN' ? { maxScale: bulletinScale(cls, 'EN', geGradeMax(school)).maxScale } : {}) },
      gradeScale: school?.grade_scale,
      apcReferentiel, apcNotes, apcClasseSlug: firstCycleClasseSlug(cls.level, cls.name),
      bilReferentiel,
      primReferentiel, primNotes, primNiveauSlug: primaireNiveauSlug(cls.level, cls.name),
      primBareme: primReferentiel?.bareme,
      primSequences: section === 'primaire' && primaryPeriodMode(school) === 'sequences',
      apcMasques, primMasques, primMasquesClasse,
      primCriteresMasques: masquesCriteresPour(primCriteresMasquesEcole, critMasquesParClasse, cls.id),
      primNonEvaluees, zeroSiManquante: !!school?.notes_manquantes_zero,
      moyennePoints: moyennePointsActive(school),
      teacherName: headTeacherText(cls, teachers),
    });
  }, [school, countryCode, schoolYear, students, subjects, gradeMap,
      apcReferentiel, apcNotes, bilReferentiel, primReferentiel, primNotes, teachers,
      apcMasques, primMasques, primMasquesClasse, primCriteresMasquesEcole, critMasquesParClasse, primNonEvaluees]);

  return { pvForClass, referentielsPending, needsBil, bilReferentiel };
}
