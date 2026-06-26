import { describeIssue } from '../../lib/transcriptReadiness';

// ── Diagnostic PDF intelligent (Section 10) ──────────────────────────────────
// Plus jamais « Erreur PDF » : on explique la CAUSE détectée et l'ACTION
// recommandée. Alimenté par les codes d'anomalie du moteur + l'erreur technique
// éventuelle remontée par la génération.
function Card({ cause, action, onAction, actionLabel, t }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-red-700">
        <span>⚠</span> {t('Impossible de générer le relevé', 'Cannot generate the transcript', 'No se puede generar')}
      </p>
      <div className="mt-2 space-y-1.5 text-[13px]">
        <p className="text-slate-700"><span className="font-semibold text-slate-500">{t('Cause détectée :', 'Detected cause:', 'Causa:')}</span> {cause}</p>
        {action && <p className="text-slate-700"><span className="font-semibold text-slate-500">{t('Action recommandée :', 'Recommended action:', 'Acción:')}</span> {action}</p>}
      </div>
      {onAction && (
        <button type="button" onClick={onAction}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
          {actionLabel || t('Corriger', 'Fix', 'Corregir')}
        </button>
      )}
    </div>
  );
}

export default function PdfDiagnostic({ issues = [], rawError, onCorrect, t }) {
  return (
    <div className="space-y-3">
      {issues.map((iss, i) => {
        const { cause, action } = describeIssue(iss, t);
        return <Card key={i} cause={cause} action={action} onAction={onCorrect} t={t} />;
      })}
      {rawError && (
        <Card
          cause={rawError}
          action={t('Réessayer ; si le problème persiste, vérifier les données de la classe.', 'Try again; if it persists, check the class data.', 'Reintentar; verificar los datos.')}
          t={t}
        />
      )}
    </div>
  );
}
