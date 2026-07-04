import { useState } from 'react';

// ── Panneau de contrôle de classe (Section 5) ────────────────────────────────
// Dès qu'une classe est ciblée : effectif, générables, bloqués, prêts + détail
// élève par élève (statut coloré) dépliable.
const STATUS_CHIP = {
  ready:   { cls: 'bg-emerald-100 text-emerald-700', label: ['Prêt', 'Ready', 'Lista'] },
  warning: { cls: 'bg-amber-100 text-amber-700',     label: ['À corriger', 'To fix', 'Corregir'] },
  blocked: { cls: 'bg-red-100 text-red-700',         label: ['Bloqué', 'Blocked', 'Bloqueada'] },
};

function Stat({ value, label, tone = 'slate' }) {
  const c = { slate: 'text-slate-900', emerald: 'text-emerald-700', red: 'text-red-700', brand: 'text-brand-700' }[tone];
  return (
    <div>
      <p className={`text-xl font-bold leading-none ${c}`}>{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

export default function ControlPanel({ classEval, onCorrect, t }) {
  const [open, setOpen] = useState(false);
  if (!classEval) return null;

  if (!classEval.applicable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        {t("Les relevés ne s'appliquent pas au cycle maternelle.", 'Transcripts do not apply to the kindergarten cycle.', 'No aplica al ciclo infantil.')}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Classe', 'Class', 'Clase')}</p>
          <p className="text-base font-bold text-slate-900">{classEval.cls.name}</p>
        </div>
        <Stat value={classEval.total}   label={t('Effectif', 'Headcount', 'Efectivo')} />
        <Stat value={classEval.ready}   label={t('Générables', 'Generable', 'Generables')} tone="brand" />
        <Stat value={classEval.ready - classEval.warning} label={t('Prêts', 'Ready', 'Listas')} tone="emerald" />
        <Stat value={classEval.blocked} label={t('Bloqués', 'Blocked', 'Bloqueadas')} tone="red" />
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="ml-auto btn-secondary text-sm" style={{ width: 'auto' }}>
          {open ? t('Masquer les détails', 'Hide details', 'Ocultar') : t('Voir les détails', 'View details', 'Ver detalles')}
        </button>
      </div>

      {open && (
        <ul className="max-h-72 overflow-auto divide-y divide-slate-100 border-t border-slate-100">
          {classEval.students.map((st) => {
            const chip = STATUS_CHIP[st.status];
            return (
              <li key={st.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{t(...chip.label)}</span>
                <span className="font-medium text-slate-800 truncate">{st.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs text-slate-400">
                  {st.generalAvg != null ? st.generalAvg : '—'}
                  {st.rank ? ` · ${st.rank}` : ''}
                </span>
                {st.status !== 'ready' && onCorrect && (
                  <button type="button" onClick={() => onCorrect(st)}
                    className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-800">
                    {t('Corriger', 'Fix', 'Corregir')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
