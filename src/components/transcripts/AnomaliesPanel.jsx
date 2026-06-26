import { summarizeIssue } from '../../lib/transcriptReadiness';

// ── Panneau d'anomalies (Section 7) ──────────────────────────────────────────
// Liste actionnable des relevés à problème (bloqués d'abord) : qui, pourquoi,
// et un bouton « Corriger » qui amène droit à la saisie des notes.
export default function AnomaliesPanel({ anomalies, onCorrect, t }) {
  if (!anomalies.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
        ✓ {t('Aucune anomalie — tous les relevés sont prêts.', 'No anomalies — all transcripts are ready.', 'Sin anomalías — todo listo.')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-800">
          ⚠ {t('Anomalies détectées', 'Detected anomalies', 'Anomalías')} ({anomalies.length})
        </h3>
      </div>
      <ul className="max-h-80 overflow-auto divide-y divide-slate-100">
        {anomalies.map((a) => (
          <li key={`${a.classId}_${a.id}`} className="flex items-start gap-3 px-4 py-2.5">
            <span className={`mt-0.5 shrink-0 text-base ${a.status === 'blocked' ? 'text-red-500' : 'text-amber-500'}`}>⚠</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-slate-800 truncate">
                {a.name} <span className="font-normal text-slate-400">· {a.className}</span>
              </p>
              <p className="text-[12px] text-slate-500">
                {a.issues.map((iss) => summarizeIssue(iss, t)).filter(Boolean).join(' · ')}
              </p>
            </div>
            {onCorrect && (
              <button type="button" onClick={() => onCorrect(a)}
                className="shrink-0 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                {t('Corriger', 'Fix', 'Corregir')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
