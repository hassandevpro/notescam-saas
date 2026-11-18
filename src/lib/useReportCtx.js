// Contexte de calcul des RAPPORTS DE CLASSE (moyennes et rangs par période, tout moteur),
// pour les écrans qui en ont besoin hors de la page Rapports — aujourd'hui les tableaux
// d'honneur. Mêmes données que pages/Reports.jsx (reportCtx) : notes APC et primaire,
// référentiels, masques, compétences non évaluées, règles de moyenne de l'école. Sans
// elles, une classe APC ou MINEDUB n'aurait aucune moyenne.
import { useEffect, useMemo } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { resolveClassEngine } from '../core/engineResolver';
import { moyennePointsActive } from '../core/primMoyennePoints';

export function useReportCtx(school) {
  const classes         = useSchoolStore((s) => s.classes);
  const schoolUnits     = useSchoolStore((s) => s.schoolUnits);
  const students        = useSchoolStore((s) => s.students);
  const subjects        = useSchoolStore((s) => s.subjects);
  const gradeMap        = useSchoolStore((s) => s.gradeMap);
  const apcNotes        = useSchoolStore((s) => s.apcNotes);
  const apcReferentiel  = useSchoolStore((s) => s.apcReferentiel);
  const primNotes       = useSchoolStore((s) => s.primNotes);
  const primReferentiel = useSchoolStore((s) => s.primReferentiel);
  const matObservations = useSchoolStore((s) => s.matObservations);
  const apcMasques      = useSchoolStore((s) => s.refMasques.apc);
  const primMasques     = useSchoolStore((s) => s.refMasques.prim);
  const primMasquesClasse = useSchoolStore((s) => s.refMasquesClasse);
  const primCriteresMasques = useSchoolStore((s) => s.refMasques.prim_crit);
  const critMasquesParClasse = useSchoolStore((s) => s.refCriteresMasquesClasse);
  const primNonEvaluees = useSchoolStore((s) => s.primNonEvaluees);
  const loadApc  = useSchoolStore((s) => s.loadApc);
  const loadPrim = useSchoolStore((s) => s.loadPrim);

  // Référentiels officiels chargés à la demande (idempotent côté store).
  const engines = useMemo(() => {
    const set = new Set(classes.map((c) => resolveClassEngine(school, c)));
    return { apc: set.has('apc'), prim: set.has('apc_primaire') };
  }, [classes, school]);
  useEffect(() => { if (engines.apc)  loadApc?.(); },  [engines.apc, loadApc]);
  useEffect(() => { if (engines.prim) loadPrim?.(); }, [engines.prim, loadPrim]);

  return useMemo(() => ({
    school, schoolUnits, students, subjects, gradeMap,
    apcNotes, apcReferentiel, primNotes, primReferentiel, matObservations,
    apcMasques, primMasques, primMasquesClasse, primCriteresMasques, critMasquesParClasse,
    primNonEvaluees, zeroSiManquante: !!school?.notes_manquantes_zero,
    moyennePoints: moyennePointsActive(school),
  }), [school, schoolUnits, students, subjects, gradeMap, apcNotes, apcReferentiel, primNotes, primReferentiel, matObservations,
    apcMasques, primMasques, primMasquesClasse, primCriteresMasques, critMasquesParClasse, primNonEvaluees]);
}
