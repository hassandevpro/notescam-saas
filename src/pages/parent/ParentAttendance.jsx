import { useT } from '../../lib/i18n';
import { Card, Empty, Loading, Denied, useChildSection, fmtDate } from './parentUi';

// ABSENCES ET RETARDS — §8. Consultation seule : date, type, motif, statut,
// remarque. Aucun bouton de justification : justifier une absence est un acte
// de la vie scolaire, pas du parent, et le serveur le refuserait.
const STATUS_UI = {
  absent:  { chip: 'bg-red-50 text-red-700',       label: ['Absence', 'Absence', 'Ausencia'] },
  retard:  { chip: 'bg-amber-50 text-amber-700',   label: ['Retard', 'Late', 'Retraso'] },
  excused: { chip: 'bg-emerald-50 text-emerald-700', label: ['Excusée', 'Excused', 'Justificada'] },
};

export default function ParentAttendance() {
  const t = useT();
  const { data, loading, denied, child } = useChildSection('attendance');

  if (loading) return <Card><Loading /></Card>;
  if (denied || !data) return <Denied />;

  const events = data.events || [];
  const late   = data.late || [];
  const totals = data.totals || [];

  return (
    <div className="space-y-4">
      {totals.length > 0 && (
        <Card title={t('Cumuls par séquence', 'Totals per term', 'Totales por secuencia')}>
          <div className="flex flex-wrap gap-2">
            {totals.map((s) => (
              <div key={s.sequence} className="rounded-xl border border-gray-100 px-3 py-2 min-w-[110px]">
                <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
                  {t('Séq', 'Seq', 'Sec')} {s.sequence}
                </p>
                <p className="text-sm text-gray-800 tabular-nums">
                  <b>{s.abs_justifiees ?? 0}</b> {t('just.', 'exc.', 'just.')} ·{' '}
                  <b className="text-red-600">{s.abs_non_justifiees ?? 0}</b> {t('non just.', 'unexc.', 'no just.')}
                </p>
                {s.conduite && <p className="text-[11px] text-gray-500 mt-0.5">{s.conduite}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={`${t('Absences', 'Absences', 'Ausencias')} — ${child?.student?.name || ''}`}>
        {events.length === 0 ? (
          <Empty>{t('Aucune absence enregistrée.', 'No absence recorded.', 'Sin ausencias registradas.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {events.map((e) => {
              const ui = STATUS_UI[e.status] || STATUS_UI.absent;
              return (
                <li key={e.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{fmtDate(e.date)}</p>
                    <p className="text-[11px] text-gray-500">
                      {e.session ? `${e.session} · ` : ''}{e.motif || t('Motif non précisé', 'No reason given', 'Sin motivo')}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.chip}`}>
                    {t(...ui.label)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t('Retards', 'Late arrivals', 'Retrasos')}>
        {late.length === 0 ? (
          <Empty>{t('Aucun retard enregistré.', 'No late arrival recorded.', 'Sin retrasos registrados.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {late.map((l) => (
              <li key={l.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {fmtDate(l.date)}{l.arrival_time ? ` · ${l.arrival_time}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {l.reason || t('Motif non précisé', 'No reason given', 'Sin motivo')}
                    {l.justification ? ` — ${l.justification}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  l.justified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {l.justified
                    ? t('Justifié', 'Justified', 'Justificado')
                    : t('Non justifié', 'Unjustified', 'No justificado')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
