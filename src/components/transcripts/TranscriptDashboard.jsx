// ── Tableau de bord — 4 KPI cliquables (Section 2) ───────────────────────────
// Donne au directeur l'état de production en un coup d'œil : effectifs, classes,
// relevés prêts, relevés bloqués. Chaque carte est un raccourci d'action.
function Kpi({ icon, value, label, hint, tone, onClick }) {
  const tones = {
    slate:   'border-slate-200 hover:border-slate-300',
    brand:   'border-brand-200 hover:border-brand-300',
    emerald: 'border-emerald-200 hover:border-emerald-300',
    red:     'border-red-200 hover:border-red-300',
  };
  const ic = {
    slate:   'bg-slate-100 text-slate-600',
    brand:   'bg-brand-100 text-brand-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red:     'bg-red-100 text-red-700',
  };
  const val = {
    slate: 'text-slate-900', brand: 'text-brand-700', emerald: 'text-emerald-700', red: 'text-red-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${tones[tone]}`}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${ic[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold leading-none ${val[tone]}`}>{value}</p>
        <p className="mt-1 text-[12px] font-semibold text-slate-600 truncate">{label}</p>
        {hint && <p className="text-[11px] text-slate-400 truncate">{hint}</p>}
      </div>
    </button>
  );
}

export default function TranscriptDashboard({ summary, onKpiClick, t }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-5">
      <Kpi tone="slate" icon="👨‍🎓" value={summary.studentsCount}
        label={t('Élèves', 'Students', 'Alumnos')}
        onClick={() => onKpiClick('all')} />
      <Kpi tone="brand" icon="🏫" value={summary.classesCount}
        label={t('Classes', 'Classes', 'Clases')}
        onClick={() => onKpiClick('classes')} />
      <Kpi tone="emerald" icon="📄" value={summary.ready}
        label={t('Relevés prêts', 'Transcripts ready', 'Listas')}
        hint={t('générables', 'generable', 'generables')}
        onClick={() => onKpiClick('ready')} />
      <Kpi tone="red" icon="⚠️" value={summary.blocked}
        label={t('Relevés bloqués', 'Blocked transcripts', 'Bloqueadas')}
        hint={summary.blocked > 0 ? t('nécessitent une correction', 'need correction', 'requieren corrección') : t('rien à corriger', 'nothing to fix', 'nada que corregir')}
        onClick={() => onKpiClick('blocked')} />
    </div>
  );
}
