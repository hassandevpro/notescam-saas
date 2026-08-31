import { Link } from 'react-router-dom';
import { useParentStore } from '../../store/parentStore';
import { useT } from '../../lib/i18n';
import { formatMoney, currencyCode } from '../../lib/currency';
import { childSector, SECTOR_LABEL, feeSummary } from '../../lib/parentService';
import StudentAvatar from '../../components/StudentAvatar';
import { Card, Empty, fmtDate } from './parentUi';

// ACCUEIL de l'espace parent — §4 du cahier des charges.
// Tout vient d'un seul appel (`parent_dashboard`), déjà borné aux enfants du
// compte : il n'y a rien à filtrer ici, et rien à recouper.
export default function ParentHome() {
  const t = useT();
  const parent        = useParentStore((s) => s.parent);
  const children      = useParentStore((s) => s.children);
  const notifications = useParentStore((s) => s.notifications);

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
          {t('Bienvenue', 'Welcome', 'Bienvenido')}
        </p>
        <h2 className="text-xl font-bold text-gray-900">{parent?.full_name}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {children.length === 1
            ? t('1 enfant suivi', '1 child followed', '1 hijo seguido')
            : `${children.length} ${t('enfants suivis', 'children followed', 'hijos seguidos')}`}
        </p>
      </Card>

      <Card title={t('Mes enfants', 'My children', 'Mis hijos')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {children.map((c) => {
            const sector = childSector(c);
            const fee = feeSummary(c.fees);
            const money = (n) => formatMoney(n, currencyCode(c.school));
            const lastAbs = c.attendance?.events?.[0] || null;
            const lastLate = c.attendance?.late?.[0] || null;
            const bulletins = [
              ...(c.bulletins?.apc || []), ...(c.bulletins?.prim || []),
              ...(c.bulletins?.maternelle || []),
            ];
            return (
              <div key={c.student.id} className="rounded-xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <StudentAvatar student={c.student} size={44} square />
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-tight">{c.student.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t('Classe', 'Class', 'Clase')} : <b>{c.class?.name || '—'}</b>
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.school?.name}{sector ? ` — ${t(...SECTOR_LABEL[sector])}` : ''}
                    </p>
                  </div>
                </div>

                {/* Situation des frais */}
                {fee.hasData && (
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                      <span>{t('Frais', 'Fees', 'Tasas')}</span>
                      <span className={fee.balance > 0 ? 'text-red-500 font-semibold' : 'text-emerald-600 font-semibold'}>
                        {fee.balance > 0
                          ? `${t('Reste', 'Left', 'Resta')} ${money(fee.balance)}`
                          : t('Soldé', 'Settled', 'Liquidado')}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${fee.balance > 0 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                           style={{ width: `${fee.pct}%` }} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                    <span className="block text-gray-400">{t('Dernier bulletin', 'Latest report', 'Último boletín')}</span>
                    <span className="font-semibold text-gray-700">
                      {bulletins.length ? bulletins[bulletins.length - 1].trimestre_id : '—'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-2 py-1.5">
                    <span className="block text-gray-400">{t('Dernière absence', 'Latest absence', 'Última ausencia')}</span>
                    <span className="font-semibold text-gray-700">
                      {lastAbs ? fmtDate(lastAbs.date) : lastLate ? fmtDate(lastLate.date) : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Link to={`/app/parent/notes/${c.student.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">
                    {t('Résultats', 'Results', 'Resultados')}
                  </Link>
                  <span className="text-gray-200">·</span>
                  <Link to={`/app/parent/absences/${c.student.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">
                    {t('Absences', 'Attendance', 'Ausencias')}
                  </Link>
                  <span className="text-gray-200">·</span>
                  <Link to={`/app/parent/frais/${c.student.id}`} className="text-[11px] font-semibold text-brand-600 hover:underline">
                    {t('Frais', 'Fees', 'Tasas')}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title={t('Dernières notifications', 'Latest notifications', 'Últimas notificaciones')}>
        {notifications.length === 0 ? (
          <Empty>{t('Aucune notification', 'No notification', 'Sin notificaciones')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {notifications.slice(0, 5).map((n) => (
              <li key={n.id} className="py-2.5 flex gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-gray-200' : 'bg-brand-500'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                  <p className="text-[11px] text-gray-300 mt-0.5">{fmtDate(n.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
