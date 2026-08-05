// ARRÊTÉ DE CAISSE — l'écran qui confronte l'argent physique aux écritures.
//
// Tout le calcul vit dans cashSessionEngine (pur, testé) : ce composant ne fait
// qu'afficher et déclencher. En particulier l'ATTENDU n'est jamais saisi ni
// transmis depuis ici — il est recalculé par le store à partir des écritures,
// sinon un caissier déclarerait un attendu sur mesure et l'écart tomberait
// toujours à zéro.
import { useEffect, useMemo, useState } from 'react';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { useT, localeForLang } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import {
  expectedCash, reconcile, requiresExplanation, canValidate,
  receiptSequenceGaps, dayOverview, SESSION_STATUS,
} from '../../lib/cashSessionEngine';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CashControlTab() {
  const t = useT();
  const money = useMoney();
  const { userId, fullName, role } = useAuthStore();
  const feePayments   = useSchoolStore((s) => s.feePayments);
  const cashSessions  = useSchoolStore((s) => s.cashSessions);
  const loadCashSessions   = useSchoolStore((s) => s.loadCashSessions);
  const declareCashSession = useSchoolStore((s) => s.declareCashSession);
  const validateCashSession = useSchoolStore((s) => s.validateCashSession);

  const [date, setDate]           = useState(todayISO());
  const [openingFloat, setFloat]  = useState('0');
  const [counted, setCounted]     = useState('');
  const [explanation, setExpl]    = useState('');
  const [busy, setBusy]           = useState(false);

  useEffect(() => { loadCashSessions(); }, [loadCashSessions]);

  // Ma caisse du jour.
  const mine = useMemo(
    () => expectedCash(feePayments, { cashierId: userId, date, openingFloat: parseInt(openingFloat, 10) || 0 }),
    [feePayments, userId, date, openingFloat],
  );
  const preview = reconcile({ counted: parseInt(counted, 10) || 0, expected: mine.expected });
  const needsWhy = counted !== '' && requiresExplanation(preview.variance);
  const mySession = cashSessions.find((s) => s.date === date && s.cashier_id === userId) || null;

  // Vue de contrôle : tous ceux qui ont encaissé ce jour-là.
  const overview = useMemo(() => {
    const cashiers = [...new Map(
      feePayments.filter((p) => p.date === date && p.recorded_by)
        .map((p) => [p.recorded_by, { id: p.recorded_by, name: p.recorded_by_name || '—' }]),
    ).values()];
    return dayOverview(feePayments, cashSessions, { date, cashiers });
  }, [feePayments, cashSessions, date]);

  // Trous dans la série des reçus : le signal d'une recette escamotée.
  const gaps = useMemo(
    () => receiptSequenceGaps(feePayments.map((p) => p.receipt_no).filter((n) => n != null)),
    [feePayments],
  );

  const submit = async () => {
    setBusy(true);
    const rec = await declareCashSession({
      date, openingFloat: parseInt(openingFloat, 10) || 0,
      countedCash: parseInt(counted, 10) || 0, explanation,
    });
    setBusy(false);
    if (!rec) {
      window.alert(needsWhy
        ? t('Un écart doit être justifié pour clore la caisse.', 'A variance must be explained to close the till.', 'Una diferencia debe justificarse.')
        : t('Arrêté impossible (déjà validé par un tiers ?).', 'Cannot declare (already validated?).', 'No se puede declarar.'));
      return;
    }
    setCounted(''); setExpl('');
  };

  const varianceTone = (v) => (v === 0 ? 'text-emerald-600' : v > 0 ? 'text-amber-600' : 'text-rose-600');

  return (
    <div className="space-y-5">

      {/* Ce que le dispositif attrape — et ce qu'il n'attrape pas. */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-semibold mb-1">{t('À quoi sert l’arrêté de caisse', 'What the till closing is for', 'Para qué sirve el arqueo')}</p>
        <p>
          {t('Les versements enregistrés sont déjà protégés : ils ne peuvent plus être effacés. L’arrêté vise l’autre cas — l’argent encaissé qui n’a jamais été saisi. Si le tiroir contient plus que les écritures, l’écart apparaît ici.',
             'Recorded payments are already protected: they can no longer be erased. This closing targets the other case — cash collected but never recorded. If the till holds more than the entries, the variance shows here.',
             'Los pagos registrados ya están protegidos. El arqueo apunta al otro caso: dinero cobrado nunca registrado.')}
        </p>
        <p className="mt-1 opacity-80">
          {t('Un comptage auto-déclaré ne suffit pas : il ne devient un contrôle que validé par un tiers, et rapproché de la série des reçus.',
             'A self-declared count is not enough: it only becomes a control once validated by someone else and cross-checked against the receipt series.',
             'Un recuento autodeclarado no basta: solo es control si lo valida un tercero.')}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="form-label">{t('Journée', 'Day', 'Día')}</label>
          <input type="date" className="form-input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {/* ── Ma caisse ── */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          {t('Ma caisse', 'My till', 'Mi caja')} — {fullName || '—'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-center">
          <div><div className="text-[11px] text-gray-400">{t('Écritures', 'Entries', 'Asientos')}</div>
            <div className="text-sm font-bold text-gray-900">{mine.count}</div></div>
          <div><div className="text-[11px] text-gray-400">{t('Encaissé', 'Collected', 'Cobrado')}</div>
            <div className="text-sm font-bold text-emerald-600">{money(mine.encaissements)}</div></div>
          <div><div className="text-[11px] text-gray-400">{t('Annulé', 'Voided', 'Anulado')}</div>
            <div className="text-sm font-bold text-rose-600">{money(mine.annulations)}</div></div>
          <div><div className="text-[11px] text-gray-400">{t('Attendu en caisse', 'Expected in till', 'Esperado')}</div>
            <div className="text-sm font-bold text-gray-900">{money(mine.expected)}</div></div>
        </div>

        {mySession?.status === SESSION_STATUS.VALIDATED ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {t('Arrêté validé par', 'Closing validated by', 'Arqueo validado por')} <b>{mySession.validated_by_name || '—'}</b> ·{' '}
            {t('écart', 'variance', 'diferencia')} <b className={varianceTone(mySession.variance)}>{money(mySession.variance)}</b>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="form-label">{t('Fond d’ouverture', 'Opening float', 'Fondo inicial')}</label>
                <input type="number" min="0" className="form-input" value={openingFloat} onChange={(e) => setFloat(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('Espèces comptées', 'Cash counted', 'Efectivo contado')}</label>
                <input type="number" min="0" className="form-input" placeholder={t('Comptez le tiroir', 'Count the till', 'Cuente la caja')}
                  value={counted} onChange={(e) => setCounted(e.target.value)} />
              </div>
              <div>
                <label className="form-label">{t('Écart', 'Variance', 'Diferencia')}</label>
                <div className={`form-input bg-gray-50 font-bold ${varianceTone(preview.variance)}`}>
                  {counted === '' ? '—' : money(preview.variance)}
                </div>
              </div>
            </div>

            {needsWhy && (
              <div className="mt-3">
                <label className="form-label">
                  {preview.variance > 0
                    ? t('Excédent : d’où vient cet argent ?', 'Surplus: where does this money come from?', 'Excedente: ¿de dónde viene?')
                    : t('Manquant : que s’est-il passé ?', 'Shortfall: what happened?', 'Faltante: ¿qué pasó?')}
                </label>
                <input type="text" className="form-input" value={explanation} onChange={(e) => setExpl(e.target.value)}
                  placeholder={t('Justification obligatoire', 'Explanation required', 'Justificación obligatoria')} />
              </div>
            )}

            <button onClick={submit} disabled={busy || counted === '' || (needsWhy && !explanation.trim())}
              className="btn-primary mt-3" style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}>
              {busy ? t('Enregistrement…', 'Saving…', 'Guardando…')
                : mySession ? t('Corriger l’arrêté', 'Amend closing', 'Corregir arqueo')
                : t('Arrêter ma caisse', 'Close my till', 'Cerrar mi caja')}
            </button>
          </>
        )}
      </div>

      {/* ── Contrôle de la journée ── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/60 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t('Contrôle de la journée', 'Day control', 'Control del día')}
          </span>
          {overview.unreconciled > 0 && (
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {overview.unreconciled} {t('caisse(s) non arrêtée(s)', 'till(s) not closed', 'caja(s) sin cerrar')}
            </span>
          )}
        </div>

        {overview.rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">
            {t('Aucun encaissement ce jour.', 'No collection that day.', 'Sin cobros ese día.')}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-2">{t('Caissier', 'Cashier', 'Cajero')}</th>
                <th className="text-right px-4 py-2">{t('Écritures', 'Entries', 'Asientos')}</th>
                <th className="text-right px-4 py-2">{t('Attendu', 'Expected', 'Esperado')}</th>
                <th className="text-right px-4 py-2">{t('Compté', 'Counted', 'Contado')}</th>
                <th className="text-right px-4 py-2">{t('Écart', 'Variance', 'Diferencia')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {overview.rows.map((r) => (
                <tr key={r.cashier.id} className={`border-t border-gray-100 ${r.unreconciled ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.cashier.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{r.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.expected)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.session?.counted_cash != null ? money(r.session.counted_cash)
                      : <span className="text-amber-600 font-semibold">{t('non arrêtée', 'not closed', 'sin cerrar')}</span>}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums font-bold ${r.reconciliation ? varianceTone(r.reconciliation.variance) : 'text-gray-300'}`}>
                    {r.reconciliation ? money(r.reconciliation.variance) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.session?.status === SESSION_STATUS.VALIDATED ? (
                      <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {t('validé', 'validated', 'validado')}
                      </span>
                    ) : canValidate(r.session, userId) ? (
                      <button onClick={() => validateCashSession(r.session.id)}
                        className="text-xs font-semibold text-brand-700 hover:underline">
                        {t('Contrôler', 'Validate', 'Validar')}
                      </button>
                    ) : r.session?.status === SESSION_STATUS.DECLARED ? (
                      <span className="text-[10px] text-gray-400">{t('en attente d’un tiers', 'awaiting a third party', 'esperando a un tercero')}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {overview.rows.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40 text-right text-xs text-gray-500">
            {t('Écart consolidé', 'Consolidated variance', 'Diferencia total')} :{' '}
            <b className={varianceTone(overview.totalVariance)}>{money(overview.totalVariance)}</b>
          </div>
        )}
      </div>

      {/* ── Série des reçus ── */}
      {(role === 'admin' || gaps.gaps.length > 0) && (
        <div className={`rounded-xl border p-4 ${gaps.gaps.length ? 'border-rose-200 bg-rose-50' : 'border-gray-100 bg-white'}`}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {t('Série des reçus', 'Receipt series', 'Serie de recibos')}
          </p>
          {gaps.issued === 0 ? (
            <p className="text-xs text-gray-400">
              {t('Aucun reçu numéroté (versements antérieurs à la numérotation séquentielle).',
                 'No numbered receipt yet (payments predate sequential numbering).',
                 'Sin recibos numerados todavía.')}
            </p>
          ) : gaps.gaps.length === 0 ? (
            <p className="text-xs text-emerald-700">
              ✓ {t(`Série continue de ${gaps.from} à ${gaps.to} — ${gaps.issued} reçus, aucun manquant.`,
                    `Continuous series ${gaps.from}–${gaps.to} — ${gaps.issued} receipts, none missing.`,
                    `Serie continua ${gaps.from}–${gaps.to}, ninguno falta.`)}
            </p>
          ) : (
            <>
              <p className="text-xs text-rose-800 font-semibold">
                {gaps.gaps.length} {t('reçu(s) manquant(s) dans la série', 'receipt(s) missing from the series', 'recibo(s) faltante(s)')} —{' '}
                {t('une somme a pu être encaissée puis retirée du système.',
                   'an amount may have been collected then removed from the system.',
                   'un importe pudo cobrarse y luego retirarse.')}
              </p>
              <p className="text-xs font-mono text-rose-700 mt-1 break-all">
                {gaps.gaps.slice(0, 40).join(' · ')}{gaps.gaps.length > 40 ? ' …' : ''}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
