import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/currency';
import { Card, Empty, Loading, Denied, useChildSection, fmtDate } from './parentUi';

// DOCUMENTS — §11.
//
// Aucun fichier n'est stocké ni servi par URL : les documents sont RÉGÉNÉRÉS par
// l'application à partir des lignes rendues ici. C'est ce qui répond au « ne pas
// pouvoir changer l'ID dans l'URL » du cahier des charges : il n'y a pas d'URL de
// document à modifier. La seule requête est la RPC, gardée par
// parent_owns_student, et un identifiant d'élève étranger y rend `null`.
export default function ParentDocuments() {
  const t = useT();
  const { data, loading, denied, child } = useChildSection('documents');

  if (loading) return <Card><Loading /></Card>;
  if (denied || !data) return <Denied />;

  const receipts  = data.receipts || [];
  const meetings  = data.meetings || [];
  const bulletins = data.bulletins || [];
  const money = (n) => formatMoney(n, child?.school?.currency || 'XAF');

  return (
    <div className="space-y-4">
      <Card title={`${t('Bulletins disponibles', 'Available report cards', 'Boletines disponibles')} — ${child?.student?.name || ''}`}>
        {bulletins.length === 0 ? (
          <Empty>{t('Aucun bulletin publié.', 'No report card published.', 'Sin boletines publicados.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {bulletins.map((b, i) => (
              <li key={`${b.engine}-${b.period}-${i}`} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.period}</p>
                  <p className="text-[11px] text-gray-400">{b.engine} · {t('publié le', 'published', 'publicado')} {fmtDate(b.updated_at)}</p>
                </div>
                <a href={`/app/parent/bulletins/${child?.student?.id}`}
                   className="text-xs font-semibold text-brand-600 hover:underline shrink-0">
                  {t('Consulter', 'View', 'Ver')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('Reçus de paiement', 'Payment receipts', 'Recibos de pago')}>
        {receipts.length === 0 ? (
          <Empty>{t('Aucun reçu disponible.', 'No receipt available.', 'Sin recibos disponibles.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {receipts.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {t('Reçu n°', 'Receipt no.', 'Recibo n.º')} {r.receipt_no}
                  </p>
                  <p className="text-[11px] text-gray-400">{fmtDate(r.date)} · {r.academic_year}</p>
                </div>
                <span className="text-sm font-mono text-emerald-600 shrink-0">{money(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('Convocations', 'Summons', 'Citaciones')}>
        {meetings.length === 0 ? (
          <Empty>{t('Aucune convocation.', 'No summons.', 'Sin citaciones.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {meetings.map((m) => (
              <li key={m.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-800">
                    {fmtDate(m.meeting_date)}{m.meeting_time ? ` · ${m.meeting_time}` : ''}
                  </p>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 shrink-0">
                    {m.status || '—'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {m.reason || '—'}{m.location ? ` · ${m.location}` : ''}
                </p>
                {m.outcome && <p className="text-[11px] text-gray-400 mt-0.5">{m.outcome}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
