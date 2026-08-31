import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/currency';
import { studentFeeSituation, FEE_STATUS } from '../../lib/feeEngine';
import { STATUS_UI, TRANCHE_UI } from '../../components/fees/feeUi';
import { Card, Empty, Loading, Denied, useChildSection, fmtDate } from './parentUi';

// FRAIS SCOLAIRES — §9. CONSULTATION SEULE.
//
// Le parent ne devient PAS un utilisateur du service financier : pas de
// bouton « payer », pas d'encaissement, pas de grille tarifaire. Ce n'est pas
// une décision d'interface — `fee_payments` n'accorde `INSERT` qu'au caissier,
// et `UPDATE`/`DELETE` sont révoqués pour tout le monde, y compris l'admin.
//
// La situation est calculée par le MOTEUR TARIFAIRE EXISTANT (feeEngine), celui
// qu'utilisent la caisse et le portail public : un solde affiché au parent ne
// peut donc pas diverger de celui que lit le caissier.
export default function ParentFees() {
  const t = useT();
  const { data, loading, denied, child } = useChildSection('fees');

  if (loading) return <Card><Loading /></Card>;
  if (denied || !data) return <Denied />;

  const money = (n) => formatMoney(n, data.currency || 'XAF');
  const fee = data.fee;
  const payments = data.payments || [];
  const items = data.items || [];

  if (!fee) {
    return (
      <Card title={`${t('Frais scolaires', 'School fees', 'Tasas escolares')} — ${child?.student?.name || ''}`}>
        <Empty>{t('Aucun frais enregistré pour cette année.', 'No fees recorded for this year.', 'Sin tasas registradas este año.')}</Empty>
      </Card>
    );
  }

  const sit = studentFeeSituation(fee, null);
  const su  = STATUS_UI[sit.status] || STATUS_UI[FEE_STATUS.NONE];
  const pct = sit.total > 0 ? Math.min(100, Math.round((sit.paid / sit.total) * 100)) : 0;
  const bar = sit.status === FEE_STATUS.LATE ? 'bg-red-400'
    : sit.status === FEE_STATUS.DUE_SOON ? 'bg-amber-400'
    : sit.balance <= 0 ? 'bg-emerald-500' : 'bg-amber-400';

  return (
    <div className="space-y-4">
      <Card
        title={`${t('Situation', 'Status', 'Situación')} ${data.academic_year || ''} — ${child?.student?.name || ''}`}
        action={
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${su.chip}`}>
            {su.icon} {t(...su.label)}
            {sit.status === FEE_STATUS.LATE && sit.daysLate > 0 && (
              <span className="font-normal">· {sit.daysLate} {t('j de retard', 'days late', 'd atraso')}</span>
            )}
          </span>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t('Montant dû', 'Total due', 'Importe total')}</p>
            <p className="font-bold text-gray-900 text-sm tabular-nums">{money(sit.total)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t('Montant payé', 'Amount paid', 'Importe pagado')}</p>
            <p className="font-bold text-emerald-600 text-sm tabular-nums">{money(sit.paid)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t('Solde restant', 'Remaining balance', 'Saldo pendiente')}</p>
            <p className={`font-bold text-sm tabular-nums ${sit.balance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              {money(Math.max(0, sit.balance))}
            </p>
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-right mt-1 text-gray-400">{pct}% {t('payé', 'paid', 'pagado')}</p>
      </Card>

      {sit.tranches.length > 1 && (
        <Card title={t('Échéancier', 'Schedule', 'Calendario')}>
          <ul className="space-y-2">
            {sit.tranches.map((tr) => {
              const ui = TRANCHE_UI[tr.status] || TRANCHE_UI.upcoming;
              const current = sit.current && tr.id === sit.current.id;
              return (
                <li key={tr.id} className={`flex items-center gap-3 py-1.5 ${current ? 'bg-brand-50/40 -mx-2 px-2 rounded-lg' : ''}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ui.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {tr.label}
                      {current && (
                        <span className="ml-2 text-[10px] font-semibold text-brand-600 uppercase">
                          {t('attendue', 'expected', 'esperada')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {t('Échéance', 'Due', 'Vence')} : {tr.due_date ? fmtDate(tr.due_date) : '—'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm text-gray-700">{money(tr.amount)}</div>
                    <div className={`text-[11px] font-semibold ${ui.text}`}>{t(...ui.label)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {items.length > 0 && (
        <Card title={t('Postes de frais', 'Fee items', 'Conceptos')}>
          <ul className="divide-y divide-gray-50">
            {items.map((i) => (
              <li key={i.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{i.name}</p>
                  {i.category && <p className="text-[11px] text-gray-400">{i.category}</p>}
                </div>
                <span className="text-sm font-mono text-gray-700 shrink-0">{money(i.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('Historique des paiements', 'Payment history', 'Historial de pagos')}>
        {payments.length === 0 ? (
          <Empty>{t('Aucun versement enregistré.', 'No payment recorded.', 'Sin pagos registrados.')}</Empty>
        ) : (
          <ul className="divide-y divide-gray-50">
            {payments.map((p) => (
              <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{fmtDate(p.date)}</p>
                  <p className="text-[11px] text-gray-400">
                    {p.receipt_no ? `${t('Reçu n°', 'Receipt no.', 'Recibo n.º')} ${p.receipt_no}` : t('Sans reçu', 'No receipt', 'Sin recibo')}
                    {p.reversal_of ? ` · ${t('Annulation', 'Reversal', 'Anulación')}${p.void_reason ? ` — ${p.void_reason}` : ''}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </p>
                </div>
                <span className={`text-sm font-mono shrink-0 ${Number(p.amount) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {money(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-gray-300 mt-3">
          {t("Les annulations restent visibles : ce registre n'est jamais retouché.",
             'Reversals stay visible: this ledger is never altered.',
             'Las anulaciones permanecen visibles: este registro nunca se retoca.')}
        </p>
      </Card>
    </div>
  );
}
