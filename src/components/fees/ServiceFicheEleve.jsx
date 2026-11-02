// FICHE D'UN ÉLÈVE POUR UN SERVICE — mois par mois, et l'argent qui va avec.
//
// Ce que cette fiche montre et que la grille ne peut pas : les VERSEMENTS. La
// grille dit ce qui est dû et ce qui est entré ; elle ne dit pas quand, par qui,
// ni sous quel numéro de reçu. C'est pourtant ce qu'on demande au guichet quand
// un parent affirme avoir déjà payé.
//
// UN MOIS NON SOUSCRIT N'EST PAS UN MOIS IMPAYÉ. Il s'affiche « non souscrit »,
// sans montant. Depuis que l'abonnement est à la carte, c'est le cas le plus
// fréquent, et le confondre avec un impayé reviendrait à réclamer une dette qui
// n'existe pas.
//
// L'ANNULATION NE SUPPRIME RIEN. Elle passe par `reversePayment`, qui écrit une
// ligne de montant NÉGATIF pointant l'originale, avec son motif. Les deux
// restent visibles, la somme reste juste, et le reçu annulé reste tirable —
// marqué comme tel. Un versement effacé, lui, ne laisse rien à montrer.
import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { soldeEcheance, libellePeriode, libelleEcheance } from '../../lib/feeScheduleEngine';
import { paidForSchedule } from '../../lib/feeScheduleService';
import { printReceiptDuo } from '../../lib/receiptDoc';
import { MODES_PAIEMENT } from './EncaissementServiceModal';

export default function ServiceFicheEleve({
  service, eleve, mois = [], entete = [], lignes = [], payments = [], school,
  canCollect, canVoid, onEncaisser, onAjouterMois, onClose, onChange,
}) {
  const t = useT();
  const money = useMoney();
  const reversePayment = useSchoolStore((s) => s.reversePayment);
  const fullName = useAuthStore((s) => s.fullName);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState(null);

  const parPeriode = useMemo(
    () => new Map(lignes.map((l) => [l.period_key, l])), [lignes]);

  // Le mois EN COURS, mis en évidence : c'est celui qu'on vient encaisser dans
  // neuf cas sur dix, et le chercher des yeux dans dix lignes fait perdre du
  // temps à quelqu'un qui a un parent devant lui.
  const moisCourant = new Date().toISOString().slice(0, 7);

  const rangs = useMemo(() => mois.map((cle) => {
    const l = parPeriode.get(cle) || null;
    if (!l) return { cle, souscrit: false, du: 0, paye: 0, reste: 0, statut: 'non_souscrit' };
    const paye = paidForSchedule(l.id, payments);
    const du = Number(l.amount_due) || 0;
    const reste = soldeEcheance({ ...l, amount_paid: paye });
    const decide = ['exempted', 'abandoned', 'not_applicable'].includes(l.status);
    return {
      cle, souscrit: true, du, paye, reste, ligne: l,
      statut: decide ? l.status : reste <= 0 ? 'paid' : paye > 0 ? 'partial' : 'due',
    };
  }), [mois, parPeriode, payments]);

  const totaux = useMemo(() => rangs.reduce((a, r) => ({
    du: a.du + (r.statut === 'due' || r.statut === 'partial' || r.statut === 'paid' ? r.du : 0),
    paye: a.paye + r.paye,
    reste: a.reste + (r.statut === 'due' || r.statut === 'partial' ? r.reste : 0),
  }), { du: 0, paye: 0, reste: 0 }), [rangs]);

  // Versements de CE service : ceux rattachés à une échéance de cet élève pour
  // ce service. Un versement de scolarité n'a rien à faire ici, et l'inverse
  // non plus — c'est précisément ce que `fee_schedule_item_id` permet de dire.
  const idsEcheance = useMemo(() => new Set(lignes.map((l) => l.id)), [lignes]);
  const versements = useMemo(() => (payments || [])
    .filter((p) => idsEcheance.has(p.fee_schedule_item_id))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [payments, idsEcheance]);

  // Une ligne contre-passée ET sa contre-passation restent toutes deux
  // visibles : l'une barrée, l'autre en négatif. C'est la trace.
  const annulees = useMemo(
    () => new Set(versements.filter((p) => p.reversal_of).map((p) => p.reversal_of)),
    [versements]);

  const LIB_STATUT = {
    non_souscrit:   ['Non souscrit', 'Not subscribed', 'No suscrito'],
    due:            ['Impayé', 'Unpaid', 'Impago'],
    partial:        ['Partiel', 'Partial', 'Parcial'],
    paid:           ['Soldé', 'Settled', 'Saldado'],
    exempted:       ['Exempté', 'Exempted', 'Exento'],
    abandoned:      ['Abandon', 'Dropped', 'Abandono'],
    not_applicable: ['Non applicable', 'Not applicable', 'No aplicable'],
  };
  const TEINTE = {
    non_souscrit: 'text-slate-400',
    due: 'text-rose-700', partial: 'text-amber-700', paid: 'text-emerald-700',
    exempted: 'text-sky-700', abandoned: 'text-rose-500', not_applicable: 'text-slate-400',
  };

  const reimprimer = (p) => {
    const ligne = lignes.find((l) => l.id === p.fee_schedule_item_id);
    printReceiptDuo({
      school,
      student: { name: eleve.name, matricule: eleve.matricule },
      className: eleve.className,
      lang: school?.language,
      designation: service?.name,
      periods: ligne ? (libelleEcheance(ligne)) : '',
      versement: p.amount,
      newTotal: totaux.paye,
      fraisAnnuels: totaux.du,
      date: p.date,
      mode: p.method,
      // Le caissier d'ORIGINE, figé sur la ligne. Celui qui réimprime
      // n'usurpe pas sa place : il apparaît à part, sur le duplicata.
      cashierName: p.recorded_by_name || '—',
      payment: p,
      duplicate: true,
      reprintBy: fullName,
    });
  };

  const annuler = async (p) => {
    const motif = window.prompt(t(
      'Motif de l’annulation (obligatoire) :',
      'Reason for cancelling (required):',
      'Motivo de la anulación (obligatorio):'));
    if (motif == null) return;
    if (!motif.trim()) {
      setMessage(t('Le motif est obligatoire : une annulation sans raison ne se justifie pas plus tard.',
                   'A reason is required: an unexplained cancellation cannot be justified later.',
                   'El motivo es obligatorio.'));
      return;
    }
    setOccupe(true);
    // Signature du store : (paymentId, studentId, reason). L'élève est exigé —
    // c'est lui dont le total doit être recalculé après la contre-passation.
    const r = await reversePayment(p.id, eleve.id, motif.trim());
    setOccupe(false);
    if (!r) { setMessage(t('Annulation refusée.', 'Cancellation refused.', 'Anulación rechazada.')); return; }
    setMessage(null);
    onChange?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto bg-white dark:bg-slate-900 p-4 shadow-xl"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-slate-100">{eleve.name}</h3>
            <p className="text-xs text-slate-500">
              {[eleve.matricule, eleve.className, service?.name].filter(Boolean).join(' · ')}
              {eleve.startedAt && (
                <> · {t('depuis', 'since', 'desde')} {eleve.startedAt}</>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">✕</button>
        </div>

        {message && <p className="mb-3 text-sm text-rose-600">{message}</p>}

        {canCollect && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button" onClick={onEncaisser} disabled={occupe || totaux.reste <= 0}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {t('Encaisser', 'Collect', 'Cobrar')}
            </button>
            <button
              type="button" onClick={onAjouterMois} disabled={occupe}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
            >
              + {t('Ajouter des mois', 'Add months', 'Añadir meses')}
            </button>
          </div>
        )}

        {/* ── Mois par mois ─────────────────────────────────────────────── */}
        <table className="w-full text-sm mb-4">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('Mois', 'Month', 'Mes')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('Attendu', 'Expected', 'Esperado')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('Payé', 'Paid', 'Pagado')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('Reste', 'Balance', 'Saldo')}</th>
              <th className="px-2 py-1.5 text-left font-medium">{t('Statut', 'Status', 'Estado')}</th>
            </tr>
          </thead>
          <tbody>
            {rangs.map((r) => {
              const courant = r.cle === moisCourant;
              const libelle = entete.find((e) => e.period_key === r.cle)?.label || libellePeriode(r.cle);
              return (
                <tr key={r.cle} className={`border-t border-slate-100 dark:border-slate-700/60 ${courant ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {libelle}
                    {courant && (
                      <span className="ml-1.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                        {t('mois en cours', 'current month', 'mes actual')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.souscrit ? money(r.du) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.paye ? money(r.paye) : '—'}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.reste ? money(r.reste) : '—'}</td>
                  <td className={`px-2 py-1.5 whitespace-nowrap ${TEINTE[r.statut]}`}>{t(...LIB_STATUT[r.statut])}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-800/60 font-semibold">
            <tr>
              <td className="px-2 py-1.5">{t('Total', 'Total', 'Total')}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totaux.du)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{money(totaux.paye)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(totaux.reste)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {/* ── Historique des versements ─────────────────────────────────── */}
        <h4 className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">
          {t('Historique des versements', 'Payment history', 'Historial de pagos')} · {versements.length}
        </h4>
        {versements.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('Aucun versement pour ce service.', 'No payment for this service.', 'Ningún pago.')}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {versements.map((p) => {
              const estAnnulation = Boolean(p.reversal_of);
              const estAnnule = annulees.has(p.id);
              const ligne = lignes.find((l) => l.id === p.fee_schedule_item_id);
              const modeLib = MODES_PAIEMENT.find((m) => m.key === p.method);
              return (
                <li
                  key={p.id}
                  className={`rounded-lg border px-2.5 py-2 text-sm ${estAnnulation
                    ? 'border-rose-200 bg-rose-50 dark:bg-rose-900/20'
                    : estAnnule ? 'border-slate-200 bg-slate-50 opacity-70'
                      : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={estAnnule ? 'line-through' : ''}>
                      {p.date} · <b>{money(p.amount)}</b>
                      {ligne && <> · {libelleEcheance(ligne)}</>}
                    </span>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {p.receipt_no ? `n° ${p.receipt_no}` : ''}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {modeLib ? t(modeLib.fr, modeLib.en, modeLib.es) : (p.method || '—')}
                    {p.payer_name && ` · ${p.payer_name}`}
                    {p.reference && ` · ${p.reference}`}
                    {p.recorded_by_name && ` · ${p.recorded_by_name}`}
                  </div>
                  {estAnnule && (
                    <div className="mt-0.5 text-xs font-semibold text-rose-700">
                      {t('ANNULÉ', 'CANCELLED', 'ANULADO')}
                    </div>
                  )}
                  {estAnnulation && (
                    <div className="mt-0.5 text-xs text-rose-700">
                      {t('Contre-passation', 'Reversal', 'Contrapartida')}
                      {p.void_reason ? ` — ${p.void_reason}` : ''}
                    </div>
                  )}
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button" onClick={() => reimprimer(p)}
                      className="text-xs underline text-slate-600 dark:text-slate-300"
                    >
                      {t('Réimprimer (duplicata)', 'Reprint (duplicate)', 'Reimprimir (duplicado)')}
                    </button>
                    {canVoid && !estAnnulation && !estAnnule && (
                      <button
                        type="button" onClick={() => annuler(p)} disabled={occupe}
                        className="text-xs underline text-rose-600 disabled:opacity-40"
                      >
                        {t('Annuler', 'Cancel', 'Anular')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
