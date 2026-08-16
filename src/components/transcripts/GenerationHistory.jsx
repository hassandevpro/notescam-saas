import { DOC_TYPES, GEN_STATUS, GEN_STATUS_LABEL, GEN_STATUS_STYLE } from '../../lib/documentLog';
import { localeForLang } from '../../lib/i18n';

// ── Historique des générations (Section 11) ──────────────────────────────────
// Journal local des productions : date · utilisateur · type · statut · détail.
// Quatre statuts distincts (succès / partiel / bloqué / échec) : la direction
// doit pouvoir distinguer « le navigateur a bloqué la fenêtre » de « les notes
// sont incomplètes ».
export default function GenerationHistory({ entries = [], t }) {
  if (!entries.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-400">
        {t('Aucune génération enregistrée sur ce poste.', 'No generation recorded on this device.', 'Sin generaciones en este equipo.')}
      </p>
    );
  }

  const fmt = (ts) => {
    try { return new Date(ts).toLocaleString(localeForLang(), { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return new Date(ts).toLocaleString(); }
  };

  // Les entrées antérieures aux quatre statuts portaient 'error'.
  const statusOf = (e) => (GEN_STATUS_LABEL[e.status] ? e.status : (e.status === 'success' ? GEN_STATUS.SUCCESS : GEN_STATUS.FAILED));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5 font-semibold">{t('Date', 'Date', 'Fecha')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('Utilisateur', 'User', 'Usuario')}</th>
            <th className="px-4 py-2.5 font-semibold">{t('Type', 'Type', 'Tipo')}</th>
            <th className="px-4 py-2.5 font-semibold text-right">{t('Statut', 'Status', 'Estado')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {entries.map((e) => {
            const st = statusOf(e);
            return (
              <tr key={e.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-mono text-[12px] text-slate-500">{fmt(e.at)}</td>
                <td className="px-4 py-2.5 text-slate-700">{e.user_name}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  {t(...(DOC_TYPES[e.type] || ['Document', 'Document', 'Documento']))}
                  {e.scope ? <span className="text-slate-400"> · {e.scope}</span> : null}
                  {e.count > 1 ? <span className="text-slate-400"> ({e.count})</span> : null}
                  {e.detail ? <span className="block text-[11px] text-slate-400">{e.detail}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${GEN_STATUS_STYLE[st]}`}>
                    {t(...GEN_STATUS_LABEL[st])}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
