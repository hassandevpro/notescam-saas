// ── Tableau de bord supérieur ────────────────────────────────────────────────
// Cinq indicateurs clés du planning, façon « cockpit » ERP (Linear/Stripe) :
// heures planifiées · enseignants · matières · créneaux libres · conflits.
function StatCard({ icon, value, label, tone = 'slate', emphasize = false }) {
  const tones = {
    slate:   { ring: 'border-slate-200',  ic: 'bg-slate-100 text-slate-600',   val: 'text-slate-900' },
    brand:   { ring: 'border-brand-200',  ic: 'bg-brand-100 text-brand-700',   val: 'text-brand-700' },
    emerald: { ring: 'border-emerald-200',ic: 'bg-emerald-100 text-emerald-700',val: 'text-emerald-700' },
    violet:  { ring: 'border-violet-200', ic: 'bg-violet-100 text-violet-700',  val: 'text-violet-700' },
    amber:   { ring: 'border-amber-200',  ic: 'bg-amber-100 text-amber-700',    val: 'text-amber-700' },
    red:     { ring: 'border-red-300',    ic: 'bg-red-100 text-red-700',        val: 'text-red-700' },
  };
  const ts = tones[tone] || tones.slate;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 shadow-sm ${ts.ring} ${emphasize ? 'ring-2 ring-red-200' : ''}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ts.ic}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold leading-none ${ts.val}`}>{value}</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400 truncate">{label}</p>
      </div>
    </div>
  );
}

const I = {
  clock:   <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd"/></svg>,
  teacher: <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>,
  book:    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/></svg>,
  empty:   <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5a1 1 0 00-1-1H5zm0-2a3 3 0 00-3 3v10a3 3 0 003 3h10a3 3 0 003-3V5a3 3 0 00-3-3H5z" clipRule="evenodd"/></svg>,
  warn:    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>,
};

export default function TimetableDashboard({ stats, t }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-5">
      <StatCard tone="brand"   icon={I.clock}   value={`${stats.totalHours} h`} label={t('Heures planifiées', 'Planned hours')} />
      <StatCard tone="slate"   icon={I.teacher} value={stats.teacherCount}      label={t('Enseignants', 'Teachers')} />
      <StatCard tone="violet"  icon={I.book}    value={stats.subjectCount}      label={t('Matières', 'Subjects')} />
      <StatCard tone="emerald" icon={I.empty}   value={stats.freeCells}         label={t('Créneaux libres', 'Free slots')} />
      <StatCard
        tone={stats.conflictCount > 0 ? 'red' : 'slate'}
        emphasize={stats.conflictCount > 0}
        icon={I.warn}
        value={stats.conflictCount}
        label={t('Conflits', 'Conflicts')}
      />
    </div>
  );
}
