import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { downloadCSV } from '../lib/exportCsv';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT, localeForLang } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';
import { printReceipt, printTicket } from '../lib/receiptDoc';
import FeeGridsTab from '../components/fees/FeeGridsTab';
import FeeCatalog from './FeeCatalog';
import FeeDashboard from '../components/fees/FeeDashboard';
import CashControlTab from '../components/fees/CashControlTab';
import { studentFeeSituation, inscriptionApplies } from '../lib/feeEngine';
import { fetchStudentFeeItems, fetchCatalog, upsertStudentFeeItem, deleteStudentFeeItem } from '../lib/feeCatalogService';
import { studentTotals, optionalItemsFor, snapshotItem, paidForItem } from '../lib/feeCatalogEngine';
import { classSectionKey } from '../core/engineResolver';
import { uuid } from '../lib/uuid';
import SectionFilterSelect, { inSection } from '../components/SectionFilterSelect';
import { MODE_LABEL, STATUS_UI, TRANCHE_UI } from '../components/fees/feeUi';
import { useMoney } from '../lib/useMoney';

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981',
  '#3b82f6','#ef4444','#14b8a6','#f97316','#84cc16',
];

function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVT_COLORS[Math.abs(h) % AVT_COLORS.length];
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function isOverdue(fee) {
  if (!fee?.tranches?.length) return false;
  const today = todayISO();
  const amountDue = fee.tranches
    .filter((t) => t.due_date && t.due_date <= today)
    .reduce((s, t) => s + (t.amount || 0), 0);
  return amountDue > 0 && amountDue > (fee.frais_payes || 0);
}

const STATUS_CONFIG = {
  paid:    { label: 'Payé intégral', color: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Partiel',       color: 'bg-amber-100 text-amber-700' },
  unpaid:  { label: 'Non payé',      color: 'bg-red-100 text-red-600' },
  none:    { label: 'Non défini',    color: 'bg-gray-100 text-gray-500' },
};

const PAGE_SIZE = 25;

// ── Barre de progression paiement ─────────────────────────────────────────────

function PayProgress({ fee, due }) {
  const total = due || fee?.frais_annuels || 0;
  if (!total) return null;
  const pct = Math.min(100, Math.round(((fee?.frais_payes || 0) / total) * 100));
  const bar = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-400' : 'bg-red-300';
  return (
    <div className="mt-1.5 min-w-[60px]">
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400">{pct}%</span>
    </div>
  );
}

// ── Panneau de gestion étendu ─────────────────────────────────────────────────

// Ordre CHRONOLOGIQUE d'encaissement (date, puis heure d'insertion, puis id pour
// départager) — sert à recalculer le cumul versé au moment d'un versement donné.
const chronoPayment = (a, b) =>
  String(a.date || '').localeCompare(String(b.date || ''))
  || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  || String(a.id || '').localeCompare(String(b.id || ''));

function PaymentPanel({ student, fee, payments, isAdmin, onAddPayment, onReversePayment, onClose, onPrintReceipt, onConfigureGrid,
  studentItems = [], optionalItems = [], onAttachOptional, onDetachOptional }) {
  const t = useT();
  const money = useMoney();

  const [lastPaymentId, setLastPaymentId] = useState(null);

  const getClassFeeGrid = useSchoolStore((s) => s.getClassFeeGrid);
  const setStudentPaymentMode = useSchoolStore((s) => s.setStudentPaymentMode);
  const grid = getClassFeeGrid(student.class_id);
  // Frais d'inscription : ajoutés au total pour un élève nouveau dans l'établissement.
  const applyInscription = inscriptionApplies(student);
  const inscription = applyInscription ? (grid?.amount_inscription || 0) : 0;
  const situation = studentFeeSituation(fee, grid, { applyInscription });
  const mode = fee?.payment_mode || null;

  // Frais du CATALOGUE de l'élève (obligatoires + optionnels) : leur montant entre
  // dans le « Dû » (les versements liés à ces frais alimentent déjà `frais_payes`,
  // sinon le Payé dépasserait le Dû). Fournis par la page (source unique).
  const catalogDue = studentTotals(studentItems).due;
  // Frais optionnels du catalogue : coché = déjà attribué à l'élève.
  const attachedByCatalogId = new Map(studentItems.map((i) => [i.fee_catalog_id, i]));

  // Détection AUTOMATIQUE du mode à partir du montant versé : payer la totalité
  // du tarif comptant en une fois → comptant (tarif réduit) ; sinon → échelonné.
  // Le comptable n'a donc aucun mode à choisir : le système décide.
  const detectMode = (amt) => {
    const comptant  = grid?.amount_comptant  || 0;
    const echelonne = grid?.amount_echelonne || 0;
    if (comptant && !echelonne) return 'comptant';
    if (echelonne && !comptant) return 'echelonne';
    if (!comptant && !echelonne) return 'libre';
    return amt >= comptant ? 'comptant' : 'echelonne';
  };

  // Versements
  const [montant,  setMontant]  = useState('');
  const [date,     setDate]     = useState(todayISO());
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [voiding,  setVoiding]  = useState(null);   // id du versement en cours d'annulation

  // Un versement annulé reste affiché : on le barre, et la contre-passation
  // apparaît comme une ligne à part. Rien ne disparaît jamais de l'historique.
  const reversedIds = new Set(payments.filter((p) => p.reversal_of).map((p) => p.reversal_of));

  const typed = parseInt(montant, 10) || 0;
  // Total dû : si le mode est déjà figé, on le respecte ; sinon on prévisualise
  // selon le montant en cours de saisie (le système « décide directement »).
  const previewMode  = mode || detectMode(typed);
  const tuitionTotal = mode
    ? situation.total
    : (grid
        ? (previewMode === 'comptant' ? grid.amount_comptant : grid.amount_echelonne) + inscription
        : (fee?.frais_annuels || 0) + inscription);
  // Dû global affiché = scolarité (+ inscription) + frais du catalogue de l'élève.
  const previewTotal = tuitionTotal + catalogDue;
  // Reste à payer : borne les versements pour ne JAMAIS encaisser au-delà du dû
  // (sinon « Total encaissé » > « Total dû » → recouvrement > 100 %, calculs faussés).
  // Si aucun dû n'est défini (previewTotal 0), on ne borne pas (rien à comparer).
  const remaining = previewTotal > 0 ? Math.max(0, previewTotal - (fee?.frais_payes ?? 0)) : Infinity;
  const overpay = typed > remaining;

  // Reconstitue le reçu d'un versement DONNÉ — récent ou vieux de trois ans.
  // Le cumul versé est recalculé à la position chronologique du versement, pour
  // que le reçu réimprimé affiche ce qu'il affichait le jour de l'encaissement.
  // Le caissier vient de la LIGNE (recorded_by_name figé), jamais de la session
  // en cours. Réserve connue : `fraisAnnuels` est le total dû ACTUEL — la grille
  // tarifaire n'est pas historisée par versement.
  const receiptDataFor = (p) => {
    const ordered = [...payments].sort(chronoPayment);
    const idx = ordered.findIndex((x) => x.id === p.id);
    const upTo = idx >= 0 ? ordered.slice(0, idx + 1) : [...ordered, p];
    return {
      payment:      p,
      versement:    Number(p.amount) || 0,
      newTotal:     upTo.reduce((s, x) => s + (Number(x.amount) || 0), 0),
      fraisAnnuels: previewTotal,
      mode:         mode || 'libre',
      date:         p.date,
      designation:  (p.note || '').trim() || null,
      cashierName:  p.recorded_by_name || null,
    };
  };

  // `duplicate` : tout tirage fait depuis l'HISTORIQUE est un duplicata. Seul le
  // tirage qui suit immédiatement l'encaissement est l'original.
  const print = (p, format, duplicate) => onPrintReceipt({ ...receiptDataFor(p), duplicate }, format);

  const handleAddPayment = async () => {
    const parsed = parseInt(montant, 10) || 0;
    if (!parsed) return;
    if (parsed > remaining) return; // garde-fou : jamais au-delà du reste dû
    setSaving(true);
    // Fige le mode au 1er versement selon le montant (si une grille existe et
    // qu'aucun mode n'a encore été déterminé).
    let appliedMode = mode;
    if (!mode && grid) {
      appliedMode = detectMode(parsed);
      await setStudentPaymentMode(student.id, appliedMode);
    }
    const rec = await onAddPayment(student.id, { amount: parsed, date, note });
    setSaving(false);
    if (rec) {
      setLastPaymentId(rec.id);
      setMontant(''); setNote('');
    }
  };

  // Annulation = contre-passation. Le motif est OBLIGATOIRE : c'est lui qui
  // distingue une erreur de saisie d'un encaissement escamoté, et il part dans
  // l'audit avec le nom de celui qui annule.
  const handleVoidPayment = async (p) => {
    const motif = window.prompt(
      t(`Annuler le versement de ${money(p.amount)} ?\n\nLe versement n'est PAS supprimé : une écriture d'annulation est ajoutée, et les deux restent visibles.\n\nMotif (obligatoire) :`,
        `Void the payment of ${money(p.amount)}?\n\nThe payment is NOT deleted: a reversing entry is added and both stay visible.\n\nReason (required):`,
        `¿Anular el pago de ${money(p.amount)}?\n\nEl pago NO se elimina: se añade un asiento de anulación y ambos siguen visibles.\n\nMotivo (obligatorio):`),
      '',
    );
    if (motif == null) return;
    if (!motif.trim()) {
      window.alert(t('Motif obligatoire : annulation abandonnée.', 'Reason required: cancellation aborted.', 'Motivo obligatorio: anulación cancelada.'));
      return;
    }
    setVoiding(p.id);
    const rec = await onReversePayment(p.id, student.id, motif);
    setVoiding(null);
    if (!rec) {
      window.alert(t('Annulation impossible (versement déjà annulé ?).', 'Cannot void (already voided?).', 'No se puede anular (¿ya anulado?).'));
      return;
    }
    if (p.id === lastPaymentId) setLastPaymentId(null);
  };

  // Paiement RATTACHÉ à un frais optionnel précis (student_fee_item_id) : règle son
  // solde, la note = son nom → le reçu porte automatiquement ce nom.
  const payOptional = async (item) => {
    const bal = Math.max(0, (Number(item.amount) || 0) - paidForItem(item.id, payments));
    if (bal <= 0) return;
    setSaving(true);
    const rec = await onAddPayment(student.id, { amount: bal, date: todayISO(), note: item.name, student_fee_item_id: item.id });
    setSaving(false);
    if (rec) setLastPaymentId(rec.id);
  };

  return (
    <Modal
      title={<>{t('Gestion des frais', 'Fee management')} — <span className="text-brand-700">{student.name}</span></>}
      onClose={onClose}
      size="lg"
    >
        <div className="space-y-4">

          {/* Résumé : le système détecte le montant dû ; le mode est figé au 1er versement */}
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('Frais de scolarité', 'Tuition fees')}</p>
              {mode ? (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={`px-2 py-0.5 rounded-full font-semibold ${mode === 'comptant' ? 'bg-emerald-100 text-emerald-700' : mode === 'echelonne' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                    {t(...MODE_LABEL[mode])}
                  </span>
                  {isAdmin && (
                    <button onClick={() => setStudentPaymentMode(student.id, null)} title={t('Réinitialiser le mode (admin)', 'Reset mode (admin)')}
                      className="text-gray-300 hover:text-brand-600">↺</button>
                  )}
                </span>
              ) : grid ? (
                <span className="text-[11px] text-gray-400">{t('Mode déterminé au 1er versement', 'Mode set on first payment')}</span>
              ) : null}
            </div>

            {/* Frais d'inscription (nouveau dans l'établissement) : rappel visuel */}
            {inscription > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                <span className="font-semibold text-amber-700">
                  🎒 {t("Frais d'inscription", 'Registration fee', 'Matrícula')} ({t('nouveau', 'new', 'nuevo')})
                </span>
                <span className="font-bold text-amber-800">+ {money(inscription)}</span>
              </div>
            )}

            {/* Frais du catalogue (obligatoires + optionnels) inclus dans le Dû. */}
            {catalogDue > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs">
                <span className="font-semibold text-indigo-700">
                  🧾 {t('Frais additionnels (catalogue)', 'Additional fees (catalog)', 'Tasas adicionales (catálogo)')}
                </span>
                <span className="font-bold text-indigo-800">+ {money(catalogDue)}</span>
              </div>
            )}

            {/* Frais optionnels du catalogue : cliquer pour AJOUTER directement à
                l'élève (ou retirer si non payé). Toujours affiché quand un catalogue
                d'optionnels existe pour la classe de l'élève. */}
            {onAttachOptional && (
              <div className="mb-3 rounded-lg border border-gray-200 p-2.5">
                <div className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">
                  {t('Frais optionnels', 'Optional fees', 'Tasas opcionales')}
                  <span className="ml-1 font-normal text-gray-400 lowercase">— {t('cliquez pour ajouter', 'click to add', 'clic para añadir')}</span>
                </div>
                {optionalItems.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">{t('Aucun frais optionnel configuré pour cette classe.', 'No optional fee configured for this class.', 'Sin tasas opcionales configuradas.')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {optionalItems.map((opt) => {
                      const attached = attachedByCatalogId.get(opt.id) || null;
                      const paidAmt = attached ? paidForItem(attached.id, payments) : 0;
                      const bal = attached ? Math.max(0, (Number(attached.amount) || 0) - paidAmt) : 0;
                      const fullyPaid = attached && bal <= 0;
                      if (attached) {
                        return (
                          <span key={opt.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold">
                            ✓ {opt.name} · {money(opt.amount)}
                            {fullyPaid ? (
                              <span className="text-[10px] text-emerald-600 font-bold">{t('payé', 'paid', 'pagado')}</span>
                            ) : (
                              <>
                                <button type="button" onClick={() => payOptional(attached)} disabled={saving}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                  {t('Payer', 'Pay', 'Pagar')} {money(bal)}
                                </button>
                                {paidAmt === 0 && (
                                  <button type="button" onClick={() => onDetachOptional(student.id, attached)} title={t('Retirer', 'Remove', 'Quitar')} className="text-indigo-400 hover:text-rose-600">✕</button>
                                )}
                              </>
                            )}
                          </span>
                        );
                      }
                      return (
                        <button key={opt.id} type="button" onClick={() => onAttachOptional(student.id, opt)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-white border border-dashed border-gray-300 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 font-medium">
                          + {opt.name} · <span className="font-semibold">{money(opt.amount)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tarifs de la grille tant que le mode n'est pas figé */}
            {!mode && grid && (grid.amount_comptant > 0 || grid.amount_echelonne > 0) && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className={`rounded-lg border p-2.5 ${previewMode === 'comptant' && typed > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`}>
                  <div className="text-[11px] text-emerald-700 font-semibold">{t('Comptant', 'Lump sum')}</div>
                  <div className="text-sm font-bold text-gray-900">{money(grid.amount_comptant)}</div>
                </div>
                <div className={`rounded-lg border p-2.5 ${previewMode === 'echelonne' && typed > 0 ? 'border-brand-400 bg-brand-50' : 'border-gray-200'}`}>
                  <div className="text-[11px] text-brand-700 font-semibold">{t('Échelonné', 'Installments')}</div>
                  <div className="text-sm font-bold text-gray-900">{money(grid.amount_echelonne)}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[11px] text-gray-400">{t('Dû', 'Due')}</div>
                <div className="text-sm font-bold text-gray-900">{money(previewTotal)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">{t('Payé', 'Paid')}</div>
                <div className="text-sm font-bold text-emerald-600">{money(fee?.frais_payes ?? 0)}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-400">{t('Reste', 'Balance')}</div>
                <div className={`text-sm font-bold ${Math.max(0, previewTotal - (fee?.frais_payes ?? 0)) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {money(Math.max(0, previewTotal - (fee?.frais_payes ?? 0)))}
                </div>
              </div>
            </div>

            {mode && (() => {
              const su = STATUS_UI[situation.status] || STATUS_UI.none;
              if (situation.status === 'none') return null;
              return (
                <div className="mt-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${su.chip}`}>
                    {su.icon} {t(...su.label)}
                    {situation.status === 'late' && situation.daysLate > 0 && (
                      <span className="font-normal">· {situation.daysLate} {t('j de retard', 'days late')}</span>
                    )}
                  </span>
                </div>
              );
            })()}

            {/* Échéancier : tranches payées / en cours / restantes (paiement échelonné) */}
            {situation.tranches.length > 1 && (
              <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
                {situation.tranches.map((tr) => {
                  const ui = TRANCHE_UI[tr.status] || TRANCHE_UI.upcoming;
                  const isCurrent = situation.current && tr.id === situation.current.id;
                  return (
                    <div key={tr.id} className={`flex items-center gap-2.5 text-xs ${isCurrent ? 'bg-brand-50/50 -mx-1.5 px-1.5 py-1 rounded-md' : ''}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ui.dot}`} />
                      <span className="font-medium text-gray-700 truncate flex-1">
                        {tr.label}
                        {isCurrent && <span className="ml-1.5 text-[9px] font-bold text-brand-600 uppercase">{t('attendue', 'expected')}</span>}
                      </span>
                      {tr.due_date && (
                        <span className="text-[10px] text-gray-400 shrink-0">{new Date(tr.due_date).toLocaleDateString(localeForLang())}</span>
                      )}
                      <span className="font-mono text-gray-700 shrink-0 w-28 text-right">
                        {tr.status === 'covered'
                          ? money.amount(tr.amount)
                          : `${money.amount(tr.allocated)} / ${money.amount(tr.amount)}`}
                      </span>
                      <span className={`text-[10px] font-semibold shrink-0 w-16 text-right ${ui.text}`}>{t(...ui.label)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Aucune grille : inviter à configurer la grille tarifaire de la classe */}
            {!grid && (
              <div className="mt-3 pt-3 border-t border-gray-50">
                <div className="flex items-center justify-between gap-3 bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-brand-800/80">
                    {t('Cette classe n’a pas encore de grille tarifaire.', 'This class has no fee grid yet.', 'Esta clase aún no tiene tarifa.')}
                  </p>
                  {onConfigureGrid && (
                    <button onClick={() => onConfigureGrid(student.class_id)}
                      className="shrink-0 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline underline-offset-2">
                      {t('Configurer la grille', 'Configure grid', 'Configurar tarifa')} →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
              {/* Nouveau versement */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Nouveau versement', 'New payment')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="form-label">{t('Montant', 'Amount')} ({money.code})</label>
                    <input
                      type="number" min="0" step="500"
                      className="form-input"
                      placeholder={t('Ex : 50 000', 'E.g. 50,000')}
                      value={montant}
                      onChange={(e) => setMontant(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('Date', 'Date')}</label>
                    <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">{t('Note (optionnelle)', 'Note (optional)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('Ex : espèces', 'E.g. cash')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>
                {montant && (
                  <p className="text-xs text-gray-500 mb-3">
                    {t('Total après ce versement', 'Total after this payment')} :&nbsp;
                    <strong className="text-gray-800">{money((fee?.frais_payes ?? 0) + typed)}</strong>
                    {previewTotal > 0 && (
                      <span className="ml-2 text-gray-400">
                        ({t('reste', 'balance')} {money(Math.max(0, previewTotal - ((fee?.frais_payes ?? 0) + typed)))})
                      </span>
                    )}
                    {!mode && grid && (
                      <span className="ml-2 text-brand-500 font-medium">
                        → {t(...MODE_LABEL[previewMode])}
                      </span>
                    )}
                  </p>
                )}
                {overpay && (
                  <p className="text-xs text-red-600 font-medium mb-3">
                    ⚠ {t('Le versement dépasse le reste dû', 'Payment exceeds the balance due', 'El pago supera el saldo')} ({money(remaining)}).{' '}
                    <button type="button" onClick={() => setMontant(String(remaining))} className="underline font-semibold">
                      {t('Ajuster au reste', 'Set to balance', 'Ajustar al saldo')}
                    </button>
                  </p>
                )}
                <button
                  onClick={handleAddPayment}
                  disabled={saving || !montant || overpay}
                  className="btn-primary"
                  style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                >
                  {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer le versement', 'Record payment')}
                </button>
              </div>

              {/* Confirmation + reçu (original : ni l'un ni l'autre n'est marqué duplicata) */}
              {lastPaymentId && (() => {
                const rec = payments.find((p) => p.id === lastPaymentId);
                if (!rec) return null;
                return (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex-wrap">
                    <svg className="w-5 h-5 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm text-emerald-700 font-medium flex-1 min-w-[8rem]">
                      {t('Versement enregistré', 'Payment saved')} — {money(rec.amount)}
                    </span>
                    <button
                      onClick={() => print(rec, 'ticket', false)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-1h8v1H6zm8-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd"/></svg>
                      {t('Imprimer le ticket', 'Print ticket', 'Imprimir tique')}
                    </button>
                    <button
                      onClick={() => print(rec, 'a5', false)}
                      className="text-xs font-semibold px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                    >
                      {t('Reçu A5', 'A5 receipt', 'Recibo A5')}
                    </button>
                  </div>
                );
              })()}

              {/* Historique */}
              {payments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/60">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t('Historique des versements', 'Payment history')} · {payments.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {payments.map((p) => {
                      const isReversal = !!p.reversal_of;   // ligne d'annulation (montant négatif)
                      const isVoided   = reversedIds.has(p.id); // versement annulé par une autre ligne
                      return (
                      <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 group ${isReversal ? 'bg-rose-50/40' : ''}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isReversal ? 'bg-rose-400' : isVoided ? 'bg-gray-300' : 'bg-emerald-400'}`} />
                        <span className="text-xs text-gray-500 shrink-0 w-24">
                          {new Date(p.date).toLocaleDateString(localeForLang())}
                        </span>
                        <span className={`font-mono font-semibold text-sm shrink-0 ${isReversal ? 'text-rose-700' : isVoided ? 'text-gray-400 line-through' : 'text-emerald-700'}`}>
                          {isReversal ? '−' : '+'} {money(Math.abs(p.amount))}
                        </span>
                        <span className="flex-1 min-w-0 truncate text-xs">
                          {isVoided && (
                            <span className="mr-1.5 text-[10px] font-bold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {t('annulé', 'voided', 'anulado')}
                            </span>
                          )}
                          {p.note && <span className={isReversal ? 'text-rose-700 font-medium' : 'text-gray-500'}>{p.note}</span>}
                          {/* Qui a encaissé — figé à l'encaissement. Vide = versement
                              antérieur à la traçabilité (ou import). */}
                          {p.recorded_by_name && (
                            <span className="text-gray-400">{p.note ? ' · ' : ''}{t('par', 'by', 'por')} {p.recorded_by_name}</span>
                          )}
                        </span>
                        {/* Réimpression à tout moment : ces deux boutons restent
                            disponibles des années après l'encaissement. */}
                        <button
                          onClick={() => print(p, 'ticket', true)}
                          title={t('Réimprimer le ticket (duplicata)', 'Reprint ticket (duplicate)', 'Reimprimir tique (duplicado)')}
                          className="shrink-0 text-xs font-semibold text-gray-500 hover:text-emerald-700 px-2 py-0.5 rounded hover:bg-emerald-50 transition-colors"
                        >
                          🧾 {t('Ticket', 'Ticket', 'Tique')}
                        </button>
                        <button
                          onClick={() => print(p, 'a5', true)}
                          title={t('Réimprimer le reçu A5 (duplicata)', 'Reprint A5 receipt (duplicate)', 'Reimprimir recibo A5 (duplicado)')}
                          className="shrink-0 text-xs font-semibold text-gray-400 hover:text-brand-700 px-2 py-0.5 rounded hover:bg-brand-50 transition-colors"
                        >
                          A5
                        </button>
                        {/* Annulation : ADMIN uniquement, jamais sur une ligne déjà
                            annulée ni sur une écriture d'annulation. Il n'existe
                            plus aucun chemin de suppression d'un versement. */}
                        {isAdmin && !isReversal && !isVoided && (
                          <button
                            onClick={() => handleVoidPayment(p)}
                            disabled={voiding === p.id}
                            title={t('Annuler ce versement (contre-passation tracée)', 'Void this payment (traced reversing entry)', 'Anular este pago (asiento de anulación trazado)')}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-xs font-semibold text-rose-500 hover:text-rose-700 px-2 py-0.5 rounded hover:bg-rose-50 transition-all disabled:opacity-50"
                          >
                            {voiding === p.id ? '…' : t('Annuler', 'Void', 'Anular')}
                          </button>
                        )}
                      </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40 text-right">
                    <span className="text-xs text-gray-500">
                      {t('Total versé', 'Total paid')} : <strong className="text-gray-800">{money(fee?.frais_payes ?? 0)}</strong>
                    </span>
                  </div>
                </div>
              )}

              {payments.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('Aucun versement enregistré.', 'No payments recorded.')}</p>
              )}
            </div>

        </div>
    </Modal>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Fees() {
  const t = useT();
  const money = useMoney();
  const { f } = usePlan();
  const { school, role, fullName } = useAuthStore();
  const isAdmin = role === 'admin';
  const classes      = useSchoolStore((s) => s.classes);
  const students     = useSchoolStore((s) => s.students);
  const fees         = useSchoolStore((s) => s.fees);
  const classFeeGrids = useSchoolStore((s) => s.classFeeGrids);
  const feePayments  = useSchoolStore((s) => s.feePayments);
  const addPayment   = useSchoolStore((s) => s.addPayment);
  const reversePayment = useSchoolStore((s) => s.reversePayment);
  const saveFee      = useSchoolStore((s) => s.saveFee);

  const activeYear = school?.current_year || '';
  const schoolId = school?.id;
  const [importMsg, setImportMsg] = useState(null);
  const [feeItems, setFeeItems] = useState([]);   // frais catalogue de TOUS les élèves (année active)
  const [catalog, setCatalog]   = useState([]);   // catalogue de frais de l'école
  const fileRef = useRef(null);

  const [mainTab,      setMainTab]      = useState('suivi'); // suivi | echeances | grilles
  const [filterClass,  setFilterClass]  = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search,       setSearch]       = useState('');
  const [openRow,      setOpenRow]      = useState(null);
  const [page,         setPage]         = useState(1);
  const [gridFocusClass, setGridFocusClass] = useState(null); // classe à éditer dans l'onglet Grilles

  // Depuis le panneau d'un élève : aller configurer la grille de sa classe.
  const goConfigureGrid = (classId) => {
    setOpenRow(null);
    setGridFocusClass(classId);
    setMainTab('grilles');
  };

  // Ouvre le panneau d'un élève depuis le tableau de bord (peut changer d'onglet).
  const openStudentPanel = (sid) => {
    const stu = students.find((s) => s.id === sid);
    setMainTab('suivi');
    if (stu?.class_id) setFilterClass(stu.class_id);
    setOpenRow(sid);
  };

  // Arrivée depuis la fiche d'un élève (/app/fees?student=<id>) :
  // ouvrir directement le panneau de paiement de cet élève.
  const [searchParams] = useSearchParams();
  const handledStudentParam = useRef(false);
  useEffect(() => {
    if (handledStudentParam.current) return;
    const sid = searchParams.get('student');
    if (!sid) return;
    const stu = students.find((s) => s.id === sid);
    if (!stu) return;
    handledStudentParam.current = true;
    if (stu.class_id) setFilterClass(stu.class_id);
    setOpenRow(sid);
  }, [searchParams, students]);

  const feeMap = useMemo(() => {
    const map = {};
    fees.forEach((f) => { map[f.student_id] = f; });
    return map;
  }, [fees]);

  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);

  // Frais du CATALOGUE (obligatoires + optionnels) de tous les élèves + catalogue
  // de l'école : intégrés au Dû/Reste/statut de la liste ET du panneau (source unique).
  const loadFeeItems = useCallback(async () => {
    if (!schoolId) return;
    const rows = await fetchStudentFeeItems(schoolId, { yearLabel: activeYear });
    setFeeItems(Array.isArray(rows) ? rows : []);
  }, [schoolId, activeYear]);
  const loadCatalog = useCallback(async () => {
    if (!schoolId) return;
    const rows = await fetchCatalog(schoolId, { yearLabel: activeYear });
    setCatalog(Array.isArray(rows) ? rows : (rows?.rows || []));
  }, [schoolId, activeYear]);
  useEffect(() => { loadFeeItems(); loadCatalog(); }, [loadFeeItems, loadCatalog]);
  // Rafraîchit à l'ouverture d'un panneau élève (catalogue récemment configuré).
  useEffect(() => { if (openRow) { loadFeeItems(); loadCatalog(); } }, [openRow, loadFeeItems, loadCatalog]);

  // Dû catalogue par élève (items actifs).
  const catalogDueByStudent = useMemo(() => {
    const byStudent = {};
    for (const it of feeItems) {
      if (!it || it.status === 'removed') continue;
      (byStudent[it.student_id] || (byStudent[it.student_id] = [])).push(it);
    }
    const map = {};
    for (const [sid, list] of Object.entries(byStudent)) map[sid] = studentTotals(list).due;
    return map;
  }, [feeItems]);

  // Attribution / retrait d'un frais optionnel depuis le panneau « gérer ».
  const attachOptional = useCallback(async (studentId, opt) => {
    const saved = await upsertStudentFeeItem({ id: uuid(), ...snapshotItem(opt, { studentId, schoolId, academicYear: activeYear }) });
    if (saved) await loadFeeItems();
  }, [schoolId, activeYear, loadFeeItems]);
  const detachOptional = useCallback(async (studentId, item) => {
    if (!item) return;
    if (paidForItem(item.id, feePayments) > 0) { window.alert(t('Frais déjà payé : impossible de le retirer.', 'Already paid: cannot remove.', 'Ya pagado: no se puede quitar.')); return; }
    if (await deleteStudentFeeItem(item.id)) await loadFeeItems();
  }, [feePayments, loadFeeItems, t]);

  // Grille tarifaire applicable par classe (année active) : permet d'afficher le
  // montant dû dès qu'une grille est définie, AVANT tout versement.
  const gridMap = useMemo(() => {
    const map = {};
    classFeeGrids.forEach((g) => {
      if (!activeYear || g.academic_year === activeYear) map[g.class_id] = g;
    });
    return map;
  }, [classFeeGrids, activeYear]);

  // Montant dû effectif d'un élève : tarif figé (après 1er versement) sinon, à
  // défaut, l'échelonné de la grille de classe (estimation tant que le mode
  // n'est pas déterminé).
  const effectiveDue = (student, fee) => {
    const grid = gridMap[student.class_id];
    // Frais d'inscription en plus pour un nouveau dans l'établissement.
    const inscription = inscriptionApplies(student) ? (grid?.amount_inscription || 0) : 0;
    const base = fee?.frais_annuels || grid?.amount_echelonne || grid?.amount_comptant || 0;
    // + frais du catalogue attribués à l'élève (obligatoires + optionnels).
    return base + inscription + (catalogDueByStudent[student.id] || 0);
  };

  // Statut d'un élève basé sur le Dû TOTAL (scolarité + inscription + catalogue).
  // Conserve « non défini » tant qu'aucune scolarité n'est figée ET qu'aucun frais
  // catalogue n'est attribué (comportement historique préservé).
  const rowStatus = (student, fee) => {
    const catDue = catalogDueByStudent[student.id] || 0;
    if (!fee?.frais_annuels && catDue === 0) return 'none';
    const due = effectiveDue(student, fee);
    const paid = fee?.frais_payes || 0;
    if (due <= 0) return 'none';
    if (paid >= due) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  };

  const classNameById = (id) => classes.find((c) => c.id === id)?.name || '—';

  const visible = useMemo(() => {
    setPage(1);
    return students
      .filter((s) => !filterClass  || s.class_id === filterClass)
      .filter((s) => !filterSection || inSection(classes.find((c) => c.id === s.class_id), filterSection))
      .filter((s) => !search        || s.name.toLowerCase().includes(search.toLowerCase()) || (s.matricule || '').toLowerCase().includes(search.toLowerCase()))
      .filter((s) => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'overdue') return isOverdue(feeMap[s.id]);
        return rowStatus(s, feeMap[s.id]) === filterStatus;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, filterClass, filterSection, filterStatus, search, feeMap, classes, catalogDueByStudent]);

  const totalPages = Math.ceil(visible.length / PAGE_SIZE);
  const paginated  = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Statistiques globales ──
  const stats = useMemo(() => {
    const all      = students.filter((s) => !filterClass || s.class_id === filterClass);
    // Dû = tarif figé ou, à défaut, échelonné de la grille de classe.
    const totalDu   = all.reduce((n, s) => n + effectiveDue(s, feeMap[s.id]), 0);
    // Encaissé IMPUTÉ aux frais : borné au dû par élève (un éventuel trop-perçu
    // n'est pas compté → recouvrement plafonné à 100 %, jamais > le dû).
    const totalPaye = all.reduce((n, s) => {
      const due = effectiveDue(s, feeMap[s.id]);
      return n + Math.min(feeMap[s.id]?.frais_payes || 0, due);
    }, 0);
    const countPaid = all.filter((s) => rowStatus(s, feeMap[s.id]) === 'paid').length;
    const countUnpaid = all.filter((s) => ['unpaid', 'none'].includes(rowStatus(s, feeMap[s.id]))).length;
    return { totalDu, totalPaye, countPaid, countUnpaid, effectif: all.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, filterClass, feeMap, gridMap, catalogDueByStudent]);

  const statusLabel = (status) => ({
    paid:    t('Payé intégral', 'Paid in full'),
    partial: t('Partiel',       'Partial'),
    unpaid:  t('Non payé',      'Unpaid'),
    none:    t('Non défini',    'Not set'),
  }[status] || '');

  const handleExport = () => {
    const rows = [
      [t('Élève', 'Student'), t('Matricule', 'Student ID'), t('Classe', 'Class'),
        t('Frais annuels', 'Annual fees'), t('Payé', 'Paid'), t('Reste', 'Remaining'),
        t('Statut', 'Status'), t('Dernière date', 'Last date')],
      ...visible.map((s) => {
        const f = feeMap[s.id];
        const due = effectiveDue(s, f);
        return [
          s.name,
          s.matricule || '',
          classNameById(s.class_id),
          due || '',
          f?.frais_payes ?? '',
          due ? Math.max(0, due - (f?.frais_payes || 0)) : '',
          statusLabel(rowStatus(s, f)),
          f?.date_dernier_paiement || '',
        ];
      }),
    ];
    const suffix = filterClass ? classNameById(filterClass).replace(/\s+/g, '_') : 'tous';
    downloadCSV(`frais_${suffix}_${activeYear.replace('/', '-')}.csv`, rows);
  };

  // Impression de la liste des frais (fenêtre dédiée).
  const handlePrint = () => {
    const scope = filterClass ? classNameById(filterClass) : t('Toutes les classes', 'All classes', 'Todas las clases');
    const rows = visible.map((s) => {
      const fe = feeMap[s.id];
      const due = effectiveDue(s, fe);
      const reste = due ? Math.max(0, due - (fe?.frais_payes || 0)) : '';
      return `<tr>
        <td>${s.name}</td><td>${s.matricule || ''}</td><td>${classNameById(s.class_id)}</td>
        <td style="text-align:right">${due ? money.amount(due) : '—'}</td>
        <td style="text-align:right">${fe?.frais_payes ? money.amount(fe.frais_payes) : '—'}</td>
        <td style="text-align:right">${reste !== '' ? money.amount(reste) : '—'}</td>
        <td>${statusLabel(rowStatus(s, fe))}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${t('Frais scolaires', 'School Fees')} — ${scope}</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;margin:24px}
        h1{font-size:18px;margin:0}h2{font-size:13px;color:#666;font-weight:normal;margin:2px 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        thead th{background:#f3f4f6}
        tfoot td{font-weight:bold;background:#f9fafb}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${school?.name || ''} — ${t('Frais scolaires', 'School Fees')}</h1>
      <h2>${scope} · ${activeYear}</h2>
      <table><thead><tr>
        <th>${t('Élève', 'Student')}</th><th>${t('Matricule', 'ID')}</th><th>${t('Classe', 'Class')}</th>
        <th>${t('Frais annuels', 'Annual fees')} (${money.code})</th><th>${t('Payé', 'Paid')}</th><th>${t('Reste', 'Remaining')}</th><th>${t('Statut', 'Status')}</th>
      </tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">${t('Total', 'Total')} (${stats.effectif})</td>
        <td style="text-align:right">${money.amount(stats.totalDu)}</td>
        <td style="text-align:right">${money.amount(stats.totalPaye)}</td>
        <td style="text-align:right">${money.amount(Math.max(0, stats.totalDu - stats.totalPaye))}</td><td></td></tr></tfoot>
      </table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setImportMsg(t('Autorisez les pop-ups pour imprimer.', 'Allow pop-ups to print.', 'Permita las ventanas emergentes.')); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 350);
  };

  // Import des frais annuels depuis un CSV (colonnes : Matricule/Élève + Frais annuels).
  const handleImportFile = async (file) => {
    if (!file) return;
    setImportMsg(t('Importation…', 'Importing…', 'Importando…'));
    try {
      const text  = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setImportMsg(t('Fichier vide.', 'Empty file.', 'Archivo vacío.')); return; }
      const delim = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
      const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
      const idxMat    = header.findIndex((h) => h.includes('matricule') || h === 'id');
      const idxName   = header.findIndex((h) => h.includes('élève') || h.includes('eleve') || h.includes('nom') || h.includes('student'));
      const idxAmount = header.findIndex((h) => h.includes('frais') || h.includes('annuel') || h.includes('montant') || h.includes('fees') || h.includes('amount'));
      if (idxAmount === -1) { setImportMsg(t('Colonne « Frais annuels » introuvable.', '“Annual fees” column not found.', 'Columna no encontrada.')); return; }
      const norm = (v) => (v || '').toString().trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const byMat  = new Map(students.filter((s) => s.matricule).map((s) => [norm(s.matricule), s]));
      const byName = new Map(students.map((s) => [norm(s.name), s]));
      let ok = 0, skip = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delim);
        const stu = (idxMat >= 0 && byMat.get(norm(cols[idxMat]))) || (idxName >= 0 && byName.get(norm(cols[idxName])));
        const amount = parseInt(String(cols[idxAmount] || '').replace(/[^\d]/g, ''), 10);
        if (!stu || isNaN(amount)) { skip++; continue; }
        await saveFee(stu.id, { frais_annuels: amount, payment_mode: 'libre' });
        ok++;
      }
      setImportMsg(t(`${ok} frais importés${skip ? `, ${skip} ignorés` : ''}.`, `${ok} fees imported${skip ? `, ${skip} skipped` : ''}.`, `${ok} importados.`));
    } catch (e) {
      setImportMsg(t('Échec de l’import.', 'Import failed.', 'Error de importación.'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (!f.hasFees) {
    return <Layout><UpgradeBanner requiredPlan="ecole" featureName={t('Frais scolaires', 'School fees')} /></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Frais scolaires', 'School Fees')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('Suivi des paiements', 'Payment tracking')} — {activeYear}</p>
          </div>
          {mainTab === 'suivi' && (
            <div className="flex gap-2 flex-wrap items-center">
              {importMsg && <span className="text-xs font-medium text-emerald-600">{importMsg}</span>}
              {visible.length > 0 && (
                <>
                  <button onClick={handleExport} className="btn-secondary">{t('Exporter CSV', 'Export CSV')}</button>
                  <button onClick={handlePrint} className="btn-secondary">{t('Imprimer', 'Print', 'Imprimir')}</button>
                </>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => fileRef.current?.click()} className="btn-secondary">{t('Importer', 'Import', 'Importar')}</button>
                  <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleImportFile(e.target.files?.[0])} />
                </>
              )}
            </div>
          )}
        </div>

        {/* Onglets principaux */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit text-sm">
          {[
            { id: 'suivi',     label: t('Suivi des paiements', 'Payment tracking', 'Seguimiento') },
            { id: 'echeances', label: t('Échéances', 'Schedule', 'Vencimientos') },
            { id: 'catalogue', label: t('Catalogue des frais', 'Fee catalog', 'Catálogo de tasas') },
            { id: 'grilles',   label: t('Grilles tarifaires', 'Fee grids', 'Tarifas') },
            { id: 'caisse',    label: t('Arrêté de caisse', 'Till closing', 'Arqueo de caja') },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={`px-4 py-1.5 rounded-lg font-semibold transition-colors ${
                mainTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Onglet Échéances (tableau de bord) ── */}
        {mainTab === 'echeances' && (
          <FeeDashboard
            students={students.filter((s) => !filterClass || s.class_id === filterClass)}
            feeMap={feeMap}
            classNameById={classNameById}
            onOpenStudent={openStudentPanel}
          />
        )}

        {/* ── Onglet Catalogue des frais (intégré, sans Layout) ── */}
        {mainTab === 'catalogue' && <FeeCatalog embedded />}

        {/* ── Onglet Arrêté de caisse (rapprochement espèces ↔ écritures) ── */}
        {mainTab === 'caisse' && <CashControlTab />}

        {/* ── Onglet Grilles tarifaires ── */}
        {mainTab === 'grilles' && (
          <FeeGridsTab
            classes={classes}
            students={students}
            focusClassId={gridFocusClass}
            onFocusHandled={() => setGridFocusClass(null)}
          />
        )}

        {mainTab === 'suivi' && (<>
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border-l-4 border-brand-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">{money(stats.totalDu)}</div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Total dû', 'Total due')}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.effectif} {t('élèves', 'students')}</div>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-emerald-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">{money(stats.totalPaye)}</div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Total encaissé', 'Total collected')}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {stats.totalDu > 0 ? `${Math.round((stats.totalPaye / stats.totalDu) * 100)}% ${t('recouvré', 'recovered')}` : '—'}
            </div>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-amber-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">{money(Math.max(0, stats.totalDu - stats.totalPaye))}</div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Restant à percevoir', 'Outstanding balance')}</div>
            {stats.totalDu > 0 && (
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${Math.round((stats.totalPaye / stats.totalDu) * 100)}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border-l-4 border-red-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">{stats.countUnpaid}</div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Élèves impayés', 'Unpaid students')}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.countPaid} {t('entièrement réglés', 'fully paid')}</div>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3">
          <SectionFilterSelect
            classes={classes}
            value={filterSection}
            onChange={(v) => { setFilterSection(v); if (filterClass && !inSection(classes.find((c) => c.id === filterClass), v)) setFilterClass(''); setPage(1); }}
            className="form-input max-w-[180px]"
          />
          <select
            className="form-input max-w-xs"
            value={filterClass}
            onChange={(e) => { setFilterClass(e.target.value); setPage(1); }}
          >
            <option value="">{t('Toutes les classes', 'All classes')}</option>
            {classes.filter((c) => inSection(c, filterSection)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({students.filter((s) => s.class_id === c.id).length})
              </option>
            ))}
          </select>

          <select
            className="form-input max-w-[180px]"
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          >
            <option value="all">{t('Tous les statuts', 'All statuses')}</option>
            <option value="overdue">{t('⚠️ En retard', '⚠️ Overdue')}</option>
            <option value="paid">{t('Payé intégral', 'Paid in full')}</option>
            <option value="partial">{t('Partiel', 'Partial')}</option>
            <option value="unpaid">{t('Non payé', 'Unpaid')}</option>
            <option value="none">{t('Non défini', 'Not defined')}</option>
          </select>

          <input
            type="text"
            className="form-input max-w-xs"
            placeholder={t('Rechercher élève…', 'Search student…')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />

          {(filterClass || filterSection || filterStatus !== 'all' || search) && (
            <button
              onClick={() => { setFilterClass(''); setFilterSection(''); setFilterStatus('all'); setSearch(''); setPage(1); }}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {t('Réinitialiser', 'Reset')}
            </button>
          )}
        </div>

        {/* Empty states */}
        {students.length === 0 && (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-4xl mb-3">💰</div>
            <p className="text-gray-500 text-sm">{t('Aucun élève. Ajoutez des élèves pour gérer les frais.', 'No students. Add students to manage fees.')}</p>
          </div>
        )}

        {students.length > 0 && visible.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
            <p className="text-gray-400 text-sm">{t('Aucun élève ne correspond aux filtres.', 'No students match the filters.')}</p>
          </div>
        )}

        {/* Tableau */}
        {visible.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {visible.length} {t(`élève${visible.length !== 1 ? 's' : ''}`, `student${visible.length !== 1 ? 's' : ''}`)}
                {totalPages > 1 && ` · ${t('page', 'page')} ${page}/${totalPages}`}
              </span>
              <span className="text-xs text-gray-400">{t('Cliquez "Gérer" pour saisir un paiement', 'Click "Manage" to enter a payment')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">{t('Élève', 'Student')}</th>
                    <th className="px-4 py-3 text-left">{t('Classe', 'Class')}</th>
                    <th className="px-4 py-3 text-right">{t('Dû', 'Due')} ({money.code})</th>
                    <th className="px-4 py-3 text-right">{t('Payé', 'Paid')}</th>
                    <th className="px-4 py-3 text-right">{t('Reste', 'Balance')}</th>
                    <th className="px-4 py-3 text-center">{t('Statut', 'Status')}</th>
                    <th className="px-4 py-3 text-center">{t('Dernier paiement', 'Last payment')}</th>
                    <th className="px-4 py-3 text-center">{t('Action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((student) => {
                    const fee    = feeMap[student.id];
                    const status = rowStatus(student, fee);
                    const cfg    = STATUS_CONFIG[status];
                    const grid   = gridMap[student.class_id];
                    // Grille définie mais mode pas encore figé → on prévisualise les deux tarifs.
                    const showGridPreview = !fee?.frais_annuels && grid && (grid.amount_comptant > 0 || grid.amount_echelonne > 0);
                    const due    = effectiveDue(student, fee);
                    const reste  = due > 0 ? Math.max(0, due - (fee?.frais_payes || 0)) : null;
                    const isOpen = openRow === student.id;
                    const color  = avatarColor(student.name);

                    const overdue = isOverdue(fee);
                    return (
                      <tr
                        key={student.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isOpen ? 'bg-brand-50/30' : ''}`}
                      >
                        {/* Élève avec avatar */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {initials(student.name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-900">{student.name}</span>
                                {overdue && (
                                  <span title={t('Tranche en retard', 'Overdue installment')} className="text-amber-500 text-sm leading-none">⚠️</span>
                                )}
                              </div>
                              {student.matricule && (
                                <div className="text-xs text-gray-400 font-mono">{student.matricule}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{classNameById(student.class_id)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                          {fee?.frais_annuels ? (
                            money.amount(fee.frais_annuels)
                          ) : showGridPreview ? (
                            <div className="flex flex-col items-end gap-0.5 leading-tight">
                              {grid.amount_comptant > 0 && (
                                <span className="text-xs whitespace-nowrap">
                                  <span className="text-emerald-600 font-semibold">{money.amount(grid.amount_comptant)}</span>
                                  <span className="text-gray-400 ml-1 font-sans">{t('comptant', 'lump sum')}</span>
                                </span>
                              )}
                              {grid.amount_echelonne > 0 && (
                                <span className="text-xs whitespace-nowrap">
                                  <span className="text-brand-600 font-semibold">{money.amount(grid.amount_echelonne)}</span>
                                  <span className="text-gray-400 ml-1 font-sans">{t('échelonné', 'installments')}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          {inscriptionApplies(student) && grid?.amount_inscription > 0 && (
                            <div className="text-[10px] text-amber-600 font-sans mt-0.5 whitespace-nowrap">
                              + {money.amount(grid.amount_inscription)} {t('inscription', 'registration', 'matrícula')}
                            </div>
                          )}
                          {catalogDueByStudent[student.id] > 0 && (
                            <div className="text-[10px] text-indigo-600 font-sans mt-0.5 whitespace-nowrap">
                              + {money.amount(catalogDueByStudent[student.id])} {t('catalogue', 'catalog', 'catálogo')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            {fee?.frais_payes
                              ? <span className="font-mono text-emerald-600 font-semibold">{money.amount(fee.frais_payes)}</span>
                              : <span className="text-gray-300 font-mono">0</span>}
                            <PayProgress fee={fee} due={due} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {reste !== null && !showGridPreview
                            ? <span className={reste === 0 ? 'text-emerald-600' : 'text-red-500 font-semibold'}>{money.amount(reste)}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                            {status === 'paid'    ? t('Payé intégral', 'Paid in full')
                           : status === 'partial' ? t('Partiel',       'Partial')
                           : status === 'unpaid'  ? t('Non payé',      'Unpaid')
                           :                        t('Non défini',    'Not defined')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">
                          {fee?.date_dernier_paiement
                            ? new Date(fee.date_dernier_paiement).toLocaleDateString(localeForLang())
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setOpenRow(isOpen ? null : student.id)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              isOpen
                                ? 'bg-gray-200 text-gray-600'
                                : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                            }`}
                          >
                            {isOpen ? t('Fermer', 'Close') : t('Gérer', 'Manage')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} {t('sur', 'of')} {visible.length}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ←
                  </button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let p;
                    if (totalPages <= 7) {
                      p = i + 1;
                    } else if (page <= 4) {
                      p = i + 1;
                    } else if (page >= totalPages - 3) {
                      p = totalPages - 6 + i;
                    } else {
                      p = page - 3 + i;
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          p === page
                            ? 'bg-brand-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>)}

        {/* Modal gestion des frais (élève sélectionné) */}
        {openRow && (() => {
          const student = students.find((s) => s.id === openRow);
          if (!student) return null;
          const studentItems = feeItems.filter((i) => i.student_id === student.id && i.status !== 'removed');
          const ctx = { academicYear: activeYear, level: classSectionKey(classById[student.class_id]), classId: student.class_id };
          const optionalItems = optionalItemsFor(catalog, ctx);
          return (
            <PaymentPanel
              student={student}
              fee={feeMap[student.id]}
              payments={feePayments
                .filter((p) => p.student_id === student.id && p.academic_year === activeYear)
                .sort((a, b) => b.date.localeCompare(a.date))}
              isAdmin={isAdmin}
              studentItems={studentItems}
              optionalItems={optionalItems}
              onAttachOptional={attachOptional}
              onDetachOptional={detachOptional}
              onAddPayment={addPayment}
              onReversePayment={reversePayment}
              onClose={() => setOpenRow(null)}
              onConfigureGrid={isAdmin ? goConfigureGrid : null}
              // `data` porte déjà le caissier d'ORIGINE (figé sur la ligne de
              // versement) ; `reprintBy` n'apparaît que sur un duplicata.
              onPrintReceipt={(data, format) =>
                (format === 'a5' ? printReceipt : printTicket)({
                  school,
                  student,
                  className: classNameById(student.class_id),
                  lang: school?.language,
                  reprintBy: fullName,
                  ...data,
                })
              }
            />
          );
        })()}

      </div>
    </Layout>
  );
}
