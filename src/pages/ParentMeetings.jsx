// Module CONVOCATIONS & rendez-vous parents — convocation élève/parent,
// impression PDF, suivi des rendez-vous (statut).
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { parentMeetings } from '../lib/vieScolaireService';
import { MEETING_TARGETS, MEETING_STATUS, labelOf } from '../core/disciplineTerms';
import { printConvocation } from '../lib/disciplineDoc';

export default function ParentMeetings() {
  const t = useT();
  return (
    <RecordsPage
      entity={parentMeetings}
      title={t('Convocations', 'Summons')}
      defaults={{ target: 'parent', status: 'planifie' }}
      fields={[
        { key: 'target',       label: ['Destinataire', 'Recipient', 'Destinatario'], type: 'select', optionList: MEETING_TARGETS, required: true },
        { key: 'reason',       label: ['Motif', 'Reason', 'Motivo'], type: 'text', full: true },
        { key: 'meeting_date', label: ['Date du RDV', 'Meeting date', 'Fecha'], type: 'date' },
        { key: 'meeting_time', label: ['Heure', 'Time', 'Hora'], type: 'time' },
        { key: 'location',     label: ['Lieu', 'Location', 'Lugar'], type: 'text' },
        { key: 'status',       label: ['Statut', 'Status', 'Estado'], type: 'select', optionList: MEETING_STATUS, required: true },
        { key: 'outcome',      label: ['Compte-rendu', 'Outcome', 'Resultado'], type: 'textarea', full: true },
      ]}
      columns={[
        { label: ['Destinataire', 'Recipient', 'Destinatario'], render: (r, c) => labelOf(MEETING_TARGETS, r.target, c.t) },
        { label: ['Date RDV', 'Meeting', 'Fecha'], render: (r, c) => c.fmtDate(r.meeting_date) },
        { label: ['Motif', 'Reason', 'Motivo'], render: (r) => r.reason || '—' },
        { label: ['Statut', 'Status', 'Estado'], render: (r, c) => labelOf(MEETING_STATUS, r.status, c.t) },
      ]}
      rowActions={[
        { label: ['🖨 Imprimer', '🖨 Print'], onClick: (row, ctx) => printConvocation({
            school: ctx.school, student: ctx.studentById.get(row.student_id),
            className: ctx.classById.get(row.class_id)?.name, meeting: row, t: ctx.t,
          }) },
      ]}
    />
  );
}
