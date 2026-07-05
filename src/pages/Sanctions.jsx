// Module SANCTIONS — avertissement oral/écrit, blâme, retenue, exclusions,
// travail d'intérêt scolaire. Historisées avec durée et autorité décisionnaire.
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { actions } from '../lib/vieScolaireService';
import { ACTION_TYPES, labelOf } from '../core/disciplineTerms';

export default function Sanctions() {
  const t = useT();
  return (
    <RecordsPage
      entity={actions}
      title={t('Sanctions', 'Sanctions')}
      defaults={{ action_type: 'avertissement_oral' }}
      fields={[
        { key: 'date',          label: ['Date', 'Date', 'Fecha'], type: 'date' },
        { key: 'action_type',   label: ['Sanction', 'Sanction', 'Sanción'], type: 'select', optionList: ACTION_TYPES, required: true },
        { key: 'reason',        label: ['Motif', 'Reason', 'Motivo'], type: 'text', full: true },
        { key: 'duration_days', label: ['Durée (jours)', 'Duration (days)', 'Duración (días)'], type: 'number' },
        { key: 'start_date',    label: ['Début', 'Start', 'Inicio'], type: 'date' },
        { key: 'end_date',      label: ['Fin', 'End', 'Fin'], type: 'date' },
        { key: 'decided_by',    label: ['Décidée par', 'Decided by', 'Decidido por'], type: 'text' },
        { key: 'notes',         label: ['Notes', 'Notes', 'Notas'], type: 'textarea', full: true },
      ]}
      columns={[
        { label: ['Date', 'Date', 'Fecha'], render: (r, c) => c.fmtDate(r.date) },
        { label: ['Sanction', 'Sanction', 'Sanción'], render: (r, c) => labelOf(ACTION_TYPES, r.action_type, c.t) },
        { label: ['Motif', 'Reason', 'Motivo'], render: (r) => r.reason || '—' },
        { label: ['Durée', 'Duration', 'Duración'], render: (r) => (r.duration_days ? `${r.duration_days} j` : '—') },
      ]}
    />
  );
}
