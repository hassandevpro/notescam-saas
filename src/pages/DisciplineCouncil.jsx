// Module CONSEIL DE DISCIPLINE — dossier disciplinaire, membres présents,
// décisions prises, historique. Stocké dans discipline_statistics.
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { disciplineCouncil } from '../lib/vieScolaireService';
import { COUNCIL_STATUS, ACTION_TYPES, labelOf } from '../core/disciplineTerms';

export default function DisciplineCouncil() {
  const t = useT();
  return (
    <RecordsPage
      entity={disciplineCouncil}
      title={t('Conseil de discipline', 'Discipline board')}
      defaults={{ status: 'convoque' }}
      fields={[
        { key: 'council_date',  label: ['Date du conseil', 'Council date', 'Fecha'], type: 'date' },
        { key: 'status',        label: ['Statut', 'Status', 'Estado'], type: 'select', optionList: COUNCIL_STATUS, required: true },
        { key: 'summary',       label: ['Exposé des faits / dossier', 'Case summary', 'Resumen'], type: 'textarea', full: true },
        { key: 'members',       label: ['Membres présents (un par ligne)', 'Members present (one per line)', 'Miembros'], type: 'textarea', full: true },
        { key: 'decision',      label: ['Décision du conseil', 'Board decision', 'Decisión'], type: 'textarea', full: true },
        { key: 'sanction_type', label: ['Sanction retenue', 'Sanction applied', 'Sanción'], type: 'select', optionList: ACTION_TYPES },
      ]}
      columns={[
        { label: ['Date', 'Date', 'Fecha'], render: (r, c) => c.fmtDate(r.council_date || r.date) },
        { label: ['Statut', 'Status', 'Estado'], render: (r, c) => labelOf(COUNCIL_STATUS, r.status, c.t) },
        { label: ['Sanction', 'Sanction', 'Sanción'], render: (r, c) => r.sanction_type ? labelOf(ACTION_TYPES, r.sanction_type, c.t) : '—' },
        { label: ['Décision', 'Decision', 'Decisión'], render: (r) => (r.decision ? String(r.decision).slice(0, 40) + (r.decision.length > 40 ? '…' : '') : '—') },
      ]}
    />
  );
}
