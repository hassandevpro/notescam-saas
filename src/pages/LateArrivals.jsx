// Module RETARDS — heure d'arrivée, motif, justificatif, validation, historique.
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { lateArrivals } from '../lib/vieScolaireService';

export default function LateArrivals() {
  const t = useT();
  return (
    <RecordsPage
      entity={lateArrivals}
      title={t('Retards', 'Late arrivals')}
      fields={[
        { key: 'date',          label: ['Date', 'Date', 'Fecha'], type: 'date' },
        { key: 'arrival_time',  label: ["Heure d'arrivée", 'Arrival time', 'Hora de llegada'], type: 'time' },
        { key: 'reason',        label: ['Motif', 'Reason', 'Motivo'], type: 'text', full: true },
        { key: 'justification', label: ['Justificatif', 'Justification', 'Justificante'], type: 'text', full: true },
        { key: 'justified',     label: ['Justifié', 'Justified', 'Justificado'], type: 'checkbox' },
        { key: 'validated',     label: ['Validé', 'Validated', 'Validado'], type: 'checkbox' },
      ]}
      columns={[
        { label: ['Date', 'Date', 'Fecha'], render: (r, c) => c.fmtDate(r.date) },
        { label: ['Heure', 'Time', 'Hora'], render: (r) => r.arrival_time || '—' },
        { label: ['Motif', 'Reason', 'Motivo'], render: (r) => r.reason || '—' },
        { label: ['Justifié', 'Justified', 'Justificado'], render: (r, c) => (r.justified ? '✅' : '—') },
        { label: ['Validé', 'Validated', 'Validado'], render: (r) => (r.validated ? '✅' : '⏳') },
      ]}
    />
  );
}
