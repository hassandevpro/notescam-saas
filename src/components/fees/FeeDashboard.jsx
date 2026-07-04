import { useMemo } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useT, localeForLang } from '../../lib/i18n';
import { feeDashboard } from '../../lib/feeEngine';
import { useMoney } from '../../lib/useMoney';

function StatCard({ accent, value, unit, label, sub }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${accent} p-5 shadow-sm`}>
      <div className="text-xl font-bold text-gray-900">
        {value} {unit && <span className="text-xs font-normal text-gray-400">{unit}</span>}
      </div>
      <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
      {sub != null && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// Tableau de bord des échéances : à jour / en retard, montants attendu/encaissé/
// restant, et tranches arrivant à échéance dans les 7 prochains jours.
export default function FeeDashboard({ students, feeMap, classNameById, onOpenStudent }) {
  const t = useT();
  const money = useMoney();
  const getClassFeeGrid = useSchoolStore((s) => s.getClassFeeGrid);

  const dash = useMemo(() => {
    const entries = students.map((s) => ({
      student: s,
      fee: feeMap[s.id],
      grid: getClassFeeGrid(s.class_id),
    }));
    return feeDashboard(entries);
  }, [students, feeMap, getClassFeeGrid]);

  const recovery = dash.expected > 0 ? Math.round((dash.collected / dash.expected) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Cartes financières */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard accent="border-brand-400"   value={money(dash.expected)}  label={t('Montant attendu', 'Expected', 'Esperado')}  sub={`${students.length} ${t('élèves', 'students', 'alumnos')}`} />
        <StatCard accent="border-emerald-400" value={money(dash.collected)} label={t('Montant encaissé', 'Collected', 'Cobrado')} sub={`${recovery}% ${t('recouvré', 'recovered', 'recaudado')}`} />
        <StatCard accent="border-amber-400"   value={money(dash.remaining)} label={t('Montant restant', 'Remaining', 'Restante')} />
        <StatCard accent="border-red-400"     value={dash.lateTotal}                  label={t('Élèves en retard', 'Overdue students', 'Alumnos atrasados')} sub={`${dash.upToDateTotal} ${t('à jour', 'up to date', 'al día')}`} />
      </div>

      {/* Répartition par statut */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{dash.counts.paid}</div>
          <div className="text-xs text-gray-500 mt-1">✓ {t('Soldés', 'Paid in full', 'Saldados')}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-500">{dash.counts.upToDate}</div>
          <div className="text-xs text-gray-500 mt-1">✓ {t('À jour', 'Up to date', 'Al día')}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-amber-500">{dash.counts.dueSoon}</div>
          <div className="text-xs text-gray-500 mt-1">🟡 {t('Échéance proche', 'Due soon', 'Próximo')}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{dash.counts.late}</div>
          <div className="text-xs text-gray-500 mt-1">🔴 {t('En retard', 'Overdue', 'Atrasados')}</div>
        </div>
      </div>

      {/* Échéances dans les 7 prochains jours */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/70">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t('Échéances sous 7 jours', 'Due within 7 days', 'Vencimientos en 7 días')} · {dash.dueSoon.length}
          </span>
        </div>
        {dash.dueSoon.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('Aucune échéance imminente. 👍', 'No imminent due dates. 👍', 'Sin vencimientos próximos. 👍')}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {dash.dueSoon.map(({ student, tranche, inDays }) => (
              <button key={`${student.id}-${tranche.id}`} onClick={() => onOpenStudent?.(student.id)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/60 text-left">
                <span className={`w-2 h-2 rounded-full shrink-0 ${inDays <= 2 ? 'bg-red-500' : 'bg-amber-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{student.name}</div>
                  <div className="text-xs text-gray-400">{classNameById(student.class_id)} · {tranche.label}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm text-gray-700">{money(tranche.remaining)}</div>
                  <div className="text-[11px] text-amber-600">
                    {inDays === 0 ? t("aujourd'hui", 'today', 'hoy') : `${t('dans', 'in', 'en')} ${inDays} ${t('j', 'd', 'd')}`}
                    {' · '}{new Date(tranche.due_date).toLocaleDateString(localeForLang())}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
