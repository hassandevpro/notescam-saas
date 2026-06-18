// Hook central des périodes académiques.
//
// Source de vérité de « quelle séquence est active » et « peut-on éditer ? »,
// consommé par les modules (Grades/Bulletins/Reports/ConseilDeClasse en P2) pour
// supprimer les sélecteurs de séquence côté enseignant.
//
// Règles :
//   * status en base FAIT FOI (une activation manuelle admin l'emporte).
//   * mode 'auto' + aucune active en base → l'active est calculée par la date
//     (computeAutoActive), à défaut la 1ère séquence.
//   * mode 'manual' → on respecte strictement le status en base.
//   * canEdit : l'admin édite tout ; sinon édition possible tant que la période
//     n'est pas verrouillée et n'est pas `upcoming` (une `closed` reste éditable
//     tant que !is_locked — on ne bloque jamais un enseignant en retard).

import { useMemo, useEffect } from 'react';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { activatePeriod } from './academicPeriodsService';
import { computeAutoActive } from './periodLogic';

export { computeAutoActive };

// Persistance idempotente de l'auto-switch (mode auto, admin uniquement) : si la
// séquence calculée par la date diffère de l'active en base, on l'active (ce qui
// clôture la précédente, sans la verrouiller). N'écrit jamais sinon.
const _autoSwitchInFlight = new Set();
export async function maybeAutoSwitch({ periods, school, userId, isAdmin }) {
  if (!isAdmin) return;
  if ((school?.period_mode || 'auto') !== 'auto') return;
  const year = school?.current_year;
  const yearPeriods = (periods || []).filter((p) => !year || p.school_year === year);
  const target = computeAutoActive(yearPeriods);
  if (!target || target.status === 'active') return;
  const key = `${school?.id}_${year}_${target.id}`;
  if (_autoSwitchInFlight.has(key)) return;
  _autoSwitchInFlight.add(key);
  try {
    await activatePeriod(target, userId, yearPeriods);
    await useSchoolStore.getState()._refreshAcademicPeriods();
  } finally {
    _autoSwitchInFlight.delete(key);
  }
}

export function useActivePeriod() {
  const periods    = useSchoolStore((s) => s.academicPeriods);
  const storeSeq   = useSchoolStore((s) => s.activeSequence);
  const refresh    = useSchoolStore((s) => s._refreshAcademicPeriods);
  const role       = useAuthStore((s) => s.role);
  const user       = useAuthStore((s) => s.user);
  const school     = useAuthStore((s) => s.school);

  const year    = school?.current_year;
  const mode    = school?.period_mode || 'auto';
  const isAdmin = role === 'admin';

  // Auto-switch au montage / quand les périodes changent (admin + mode auto).
  useEffect(() => {
    maybeAutoSwitch({ periods, school, userId: user?.id, isAdmin });
  }, [periods, school, user?.id, isAdmin]);

  return useMemo(() => {
    const yearPeriods = periods.filter((p) => !year || p.school_year === year);
    const sequences   = yearPeriods
      .filter((p) => p.type === 'sequence')
      .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0));
    const trimesters  = yearPeriods.filter((p) => p.type === 'trimestre');

    let activePeriod = sequences.find((p) => p.status === 'active') || null;
    if (!activePeriod && mode === 'auto') {
      activePeriod = computeAutoActive(sequences) || sequences[0] || null;
    }
    const activeSequence = activePeriod?.sequence_order ?? storeSeq ?? null;

    const canEdit = (period) => {
      if (!period) return false;
      if (isAdmin) return true;
      return !period.is_locked && period.status !== 'upcoming';
    };

    // upcoming masqué pour le personnel ; active + closed visibles (closed en
    // lecture seule via canEdit). Admin voit tout.
    const visiblePeriods = (r = role) =>
      r === 'admin' ? sequences : sequences.filter((p) => p.status !== 'upcoming');

    return { activePeriod, activeSequence, periods: sequences, trimesters, isAdmin, canEdit, visiblePeriods, refresh };
  }, [periods, storeSeq, role, year, mode, isAdmin, refresh]);
}
