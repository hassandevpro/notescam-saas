import { useMemo } from 'react';
import { groupAnomalies, describeGroup } from '../../lib/anomalyGroups';

// ── Panneau d'anomalies ──────────────────────────────────────────────────────
// UNE ligne par cause (classe + matière), pas une par élève. Deux niveaux nets :
//   • Bloqué        : le relevé ne peut PAS être produit ;
//   • Avertissement : le relevé s'imprime, la moyenne ignore la note manquante.
// « Corriger » ouvre la saisie sur la matière (et l'élève) concernés.
export default function AnomaliesPanel({ anomalies, classTotals = {}, onCorrect, t }) {
  const groups = useMemo(() => groupAnomalies(anomalies, classTotals), [anomalies, classTotals]);

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
        ✓ {t('Aucune anomalie pour cette sélection : tous les relevés sont prêts.', 'No issues for this selection: all transcripts are ready.', 'Sin anomalías en esta selección.')}
      </div>
    );
  }

  const blocked = groups.filter((g) => g.status === 'blocked').length;
  const warnings = groups.length - blocked;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">{t('À vérifier', 'To check', 'A revisar')}</h3>
        {blocked > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{blocked} {t('bloquant(s)', 'blocking', 'bloqueante(s)')}</span>}
        {warnings > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{warnings} {t('avertissement(s)', 'warning(s)', 'aviso(s)')}</span>}
      </div>
      <ul className="max-h-80 overflow-auto divide-y divide-slate-100">
        {groups.map((g) => {
          const { title, detail } = describeGroup(g, t);
          const isBlocked = g.status === 'blocked';
          const first = g.students[0];
          return (
            <li key={`${g.classId}_${g.code}_${g.subject || ''}`} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${isBlocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                {isBlocked ? t('Bloqué', 'Blocked', 'Bloqueado') : t('Avertissement', 'Warning', 'Aviso')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-800">
                  {title} <span className="font-normal text-slate-400">· {g.className}</span>
                </p>
                {detail && <p className="text-[12px] text-slate-500">{detail}</p>}
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {isBlocked
                    ? t('Le relevé ne peut pas être imprimé.', 'The transcript cannot be printed.', 'No se puede imprimir.')
                    : t('Le relevé s’imprime ; la moyenne ignore cette note manquante.', 'The transcript prints; the average ignores this missing grade.', 'Se imprime; el promedio ignora la nota.')}
                </p>
              </div>
              {onCorrect && (
                <button type="button"
                  onClick={() => onCorrect({
                    classId: g.classId,
                    id: first.id,
                    name: g.wholeClass ? '' : first.name,
                    issues: g.code === 'missing_subject' ? [{ code: 'missing_subjects', names: [g.subject] }] : [{ code: g.code }],
                  })}
                  className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                  {g.code === 'missing_subject' ? t('Saisir', 'Enter', 'Capturar') : t('Corriger', 'Fix', 'Corregir')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
