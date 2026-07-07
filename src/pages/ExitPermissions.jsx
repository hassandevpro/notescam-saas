// Module AUTORISATIONS DE SORTIE — médicale, parentale, administrative,
// exceptionnelle. Signature + historique + impression.
import { useT } from '../lib/i18n';
import RecordsPage from '../components/vieScolaire/RecordsPage';
import { exitPermissions } from '../lib/vieScolaireService';
import { EXIT_TYPES, labelOf } from '../core/disciplineTerms';
import { printExitPermission } from '../lib/disciplineDoc';

export default function ExitPermissions() {
  const t = useT();
  return (
    <RecordsPage
      entity={exitPermissions}
      title={t('Autorisations de sortie', 'Exit permissions')}
      defaults={{ exit_type: 'parentale' }}
      fields={[
        { key: 'date',           label: ['Date', 'Date', 'Fecha'], type: 'date' },
        { key: 'exit_type',      label: ['Type de sortie', 'Exit type', 'Tipo'], type: 'select', optionList: EXIT_TYPES, required: true },
        { key: 'exit_time',      label: ['Heure de sortie', 'Exit time', 'Hora de salida'], type: 'time' },
        { key: 'return_time',    label: ['Retour prévu', 'Expected return', 'Regreso'], type: 'time' },
        { key: 'reason',         label: ['Motif', 'Reason', 'Motivo'], type: 'text', full: true },
        { key: 'authorized_by',  label: ['Autorisé par', 'Authorized by', 'Autorizado por'], type: 'text' },
        { key: 'accompanied_by', label: ['Accompagné de', 'Accompanied by', 'Acompañado por'], type: 'text' },
        { key: 'returned',       label: ['Élève revenu', 'Student returned', 'Regresó'], type: 'checkbox' },
      ]}
      columns={[
        { label: ['Date', 'Date', 'Fecha'], render: (r, c) => c.fmtDate(r.date) },
        { label: ['Type', 'Type', 'Tipo'], render: (r, c) => labelOf(EXIT_TYPES, r.exit_type, c.t) },
        { label: ['Sortie', 'Out', 'Salida'], render: (r) => r.exit_time || '—' },
        { label: ['Revenu', 'Returned', 'Regresó'], render: (r) => (r.returned ? '✅' : '—') },
      ]}
      rowActions={[
        { label: ['🖨 Imprimer', '🖨 Print'], onClick: (row, ctx) => printExitPermission({
            school: ctx.school, student: ctx.studentById.get(row.student_id),
            className: ctx.classById.get(row.class_id)?.name, permission: row, t: ctx.t,
            typeLabel: labelOf(EXIT_TYPES, row.exit_type, ctx.t),
          }) },
      ]}
    />
  );
}
