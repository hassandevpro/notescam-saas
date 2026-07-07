// Module INCIDENTS disciplinaires — type, gravité, lieu, description, témoins,
// décision, statut. Terminologie adaptée au profil de l'établissement.
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { incidents } from '../lib/vieScolaireService';
import {
  INCIDENT_TYPES, INCIDENT_SEVERITY, INCIDENT_STATUS, labelOf, colorOf,
} from '../core/disciplineTerms';

export default function Incidents() {
  const t = useT();
  return (
    <RecordsPage
      entity={incidents}
      title={t('Incidents disciplinaires', 'Disciplinary incidents')}
      defaults={{ incident_type: 'autre', severity: 'mineur', status: 'ouvert' }}
      fields={[
        { key: 'date',          label: ['Date', 'Date', 'Fecha'], type: 'date' },
        { key: 'incident_time', label: ['Heure', 'Time', 'Hora'], type: 'time' },
        { key: 'incident_type', label: ["Type d'incident", 'Incident type', 'Tipo'], type: 'select', optionList: INCIDENT_TYPES, required: true },
        { key: 'severity',      label: ['Gravité', 'Severity', 'Gravedad'], type: 'select', optionList: INCIDENT_SEVERITY, required: true },
        { key: 'custom_type',   label: ['Autre (préciser)', 'Other (specify)', 'Otro'], type: 'text' },
        { key: 'location',      label: ['Lieu', 'Location', 'Lugar'], type: 'text' },
        { key: 'description',   label: ['Description', 'Description', 'Descripción'], type: 'textarea', full: true },
        { key: 'witnesses',     label: ['Témoins', 'Witnesses', 'Testigos'], type: 'text', full: true },
        { key: 'decision',      label: ['Décision prise', 'Decision taken', 'Decisión'], type: 'textarea', full: true },
        { key: 'status',        label: ['Statut', 'Status', 'Estado'], type: 'select', optionList: INCIDENT_STATUS, required: true },
      ]}
      columns={[
        { label: ['Date', 'Date', 'Fecha'], render: (r, c) => c.fmtDate(r.date) },
        { label: ['Type', 'Type', 'Tipo'], render: (r, c) => r.incident_type === 'autre' && r.custom_type ? r.custom_type : labelOf(INCIDENT_TYPES, r.incident_type, c.t) },
        { label: ['Gravité', 'Severity', 'Gravedad'], render: (r, c) => (
            <span className="font-semibold" style={{ color: colorOf(INCIDENT_SEVERITY, r.severity) }}>{labelOf(INCIDENT_SEVERITY, r.severity, c.t)}</span>
          ) },
        { label: ['Statut', 'Status', 'Estado'], render: (r, c) => labelOf(INCIDENT_STATUS, r.status, c.t) },
      ]}
    />
  );
}
