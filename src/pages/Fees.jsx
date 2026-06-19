import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { downloadCSV } from '../lib/exportCsv';
import { uuid } from '../lib/uuid';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { useT, localeForLang } from '../lib/i18n';
import { usePlan } from '../lib/plan';
import UpgradeBanner from '../components/UpgradeBanner';
import { resolveCountryCode } from '../countries';

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

function feeStatus(fee) {
  if (!fee || fee.frais_annuels === 0) return 'none';
  if (fee.frais_payes >= fee.frais_annuels) return 'paid';
  if (fee.frais_payes > 0) return 'partial';
  return 'unpaid';
}

function isOverdue(fee) {
  if (!fee?.tranches?.length) return false;
  const today = todayISO();
  const amountDue = fee.tranches
    .filter((t) => t.due_date && t.due_date <= today)
    .reduce((s, t) => s + (t.amount || 0), 0);
  return amountDue > 0 && amountDue > (fee.frais_payes || 0);
}

function trancheStatus(tranche, fee) {
  const today = todayISO();
  const idx = (fee?.tranches ?? []).findIndex((t) => t.id === tranche.id);
  const amountDueHere = (fee?.tranches ?? [])
    .slice(0, idx + 1)
    .reduce((s, t) => s + (t.amount || 0), 0);
  if ((fee?.frais_payes || 0) >= amountDueHere) return 'covered';
  if (tranche.due_date && tranche.due_date < today) return 'overdue';
  return 'upcoming';
}

function fmt(n) {
  if (n == null || n === 0) return '0';
  return Number(n).toLocaleString('fr-FR');
}

const STATUS_CONFIG = {
  paid:    { label: 'Payé intégral', color: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'Partiel',       color: 'bg-amber-100 text-amber-700' },
  unpaid:  { label: 'Non payé',      color: 'bg-red-100 text-red-600' },
  none:    { label: 'Non défini',    color: 'bg-gray-100 text-gray-500' },
};

const TRANCHE_STATUS_CFG = {
  covered:  { label: 'Couverte',   dot: 'bg-emerald-500', text: 'text-emerald-700' },
  upcoming: { label: 'À venir',    dot: 'bg-gray-300',    text: 'text-gray-500' },
  overdue:  { label: 'En retard',  dot: 'bg-red-500',     text: 'text-red-600' },
};

const PAGE_SIZE = 25;

// ── Barre de progression paiement ─────────────────────────────────────────────

function PayProgress({ fee }) {
  if (!fee || !fee.frais_annuels) return null;
  const pct = Math.min(100, Math.round(((fee.frais_payes || 0) / fee.frais_annuels) * 100));
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

// ── Modal tarification en masse ────────────────────────────────────────────────

function BulkFeeModal({ classes, students, activeYear, saveFee, onClose }) {
  const t = useT();
  const [classId, setClassId] = useState('');
  const [amount,  setAmount]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);

  const affected = classId ? students.filter((s) => s.class_id === classId) : [];

  const handleApply = async () => {
    if (!amount || !classId || !affected.length) return;
    setSaving(true);
    for (const s of affected) {
      await saveFee(s.id, { frais_annuels: parseInt(amount, 10), academic_year: activeYear });
    }
    setSaving(false);
    setDone(true);
  };

  if (done) {
    return (
      <Modal title={t('Tarification en masse', 'Bulk Fee Setting')} onClose={onClose} size="sm">
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-gray-800 font-semibold">{t('Frais appliqués', 'Fees applied')}</p>
          <p className="text-gray-500 text-sm mt-1">
            {affected.length} {t('élèves mis à jour avec', 'students updated with')} {fmt(parseInt(amount, 10))} FCFA.
          </p>
          <button onClick={onClose} className="btn-primary mt-4" style={{ width: 'auto', paddingLeft: '2rem', paddingRight: '2rem' }}>
            {t('Fermer', 'Close')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t('Tarification en masse', 'Bulk Fee Setting')} onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          {t(
            "Définir le même montant de frais annuels pour tous les élèves d'une classe. Les paiements déjà enregistrés ne sont pas modifiés.",
            "Set the same annual fee amount for all students in a class. Existing payments are not affected.",
            "Definir el mismo importe de cuota anual para todos los alumnos de una clase. Los pagos ya registrados no se modifican."
          )}
        </p>
        <div>
          <label className="form-label">{t('Classe', 'Class')}</label>
          <select className="form-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{t('Sélectionner une classe…', 'Select a class…')}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({students.filter((s) => s.class_id === c.id).length} {t('élèves', 'students')})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">{t('Frais annuels (FCFA)', 'Annual fees (FCFA)')}</label>
          <input
            type="number" min="0" step="500"
            className="form-input"
            placeholder={t('Ex : 150 000', 'E.g. 150,000')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {classId && amount && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            {t('Appliquera', 'Will apply')} <strong>{fmt(parseInt(amount, 10) || 0)} FCFA</strong> {t('à', 'to')}{' '}
            <strong>{affected.length} {t(`élève${affected.length !== 1 ? 's' : ''}`, `student${affected.length !== 1 ? 's' : ''}`)}</strong>.
          </div>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="btn-secondary">{t('Annuler', 'Cancel')}</button>
          <button
            onClick={handleApply}
            disabled={saving || !classId || !amount || !affected.length}
            className="btn-primary"
            style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
          >
            {saving ? t('Application…', 'Applying…') : `${t('Appliquer', 'Apply')} (${affected.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Panneau de gestion étendu ─────────────────────────────────────────────────

function PaymentPanel({ student, fee, payments, activeYear, onAddPayment, onDeletePayment, onSaveFee, onClose, onPrintReceipt }) {
  const t = useT();

  const [tab,          setTab]          = useState('versements');
  const [fraisAnnuels, setFraisAnnuels] = useState(String(fee?.frais_annuels ?? ''));
  const [savingFrais,  setSavingFrais]  = useState(false);
  const [lastPayment,  setLastPayment]  = useState(null);

  // Versements
  const [montant,  setMontant]  = useState('');
  const [date,     setDate]     = useState(todayISO());
  const [note,     setNote]     = useState('');
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Tranches
  const [tranches,      setTranches]      = useState(fee?.tranches ?? []);
  const [tLabel,        setTLabel]        = useState('');
  const [tAmount,       setTAmount]       = useState('');
  const [tDate,         setTDate]         = useState('');
  const [savingTranche, setSavingTranche] = useState(false);

  const handleSaveFrais = async () => {
    setSavingFrais(true);
    await onSaveFee(student.id, { frais_annuels: parseInt(fraisAnnuels, 10) || 0, academic_year: activeYear });
    setSavingFrais(false);
  };

  const handleAddPayment = async () => {
    const parsed = parseInt(montant, 10) || 0;
    if (!parsed) return;
    setSaving(true);
    const rec = await onAddPayment(student.id, { amount: parsed, date, note });
    setSaving(false);
    if (rec) {
      setLastPayment({
        versement: parsed,
        newTotal: (fee?.frais_payes ?? 0) + parsed,
        fraisAnnuels: parseInt(fraisAnnuels, 10) || (fee?.frais_annuels ?? 0),
        date,
      });
      setMontant(''); setNote('');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    setDeleting(paymentId);
    await onDeletePayment(paymentId, student.id);
    setDeleting(null);
    setLastPayment(null);
  };

  const handleAddTranche = async () => {
    const parsed = parseInt(tAmount, 10) || 0;
    if (!parsed) return;
    const newT = {
      id:       uuid(),
      label:    tLabel.trim() || `Tranche ${tranches.length + 1}`,
      amount:   parsed,
      due_date: tDate || null,
    };
    const updated = [...tranches, newT];
    setTranches(updated);
    setTLabel(''); setTAmount(''); setTDate('');
    setSavingTranche(true);
    await onSaveFee(student.id, { tranches: updated, academic_year: activeYear });
    setSavingTranche(false);
  };

  const handleDeleteTranche = async (id) => {
    const updated = tranches.filter((t) => t.id !== id);
    setTranches(updated);
    await onSaveFee(student.id, { tranches: updated, academic_year: activeYear });
  };

  const feeForTranches = { ...fee, tranches };
  const totalTranches  = tranches.reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <Modal
      title={<>{t('Gestion des frais', 'Fee management')} — <span className="text-brand-700">{student.name}</span></>}
      onClose={onClose}
      size="lg"
    >
        <div className="space-y-4">

          {/* Frais annuels */}
          <div className="flex items-end gap-3 bg-white rounded-xl border border-gray-100 p-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Frais annuels (FCFA)', 'Annual fees (FCFA)')}</label>
              <input
                type="number" min="0" step="500"
                className="form-input"
                placeholder={t('Ex : 150 000', 'E.g. 150,000')}
                value={fraisAnnuels}
                onChange={(e) => setFraisAnnuels(e.target.value)}
              />
            </div>
            <button
              onClick={handleSaveFrais}
              disabled={savingFrais}
              className="btn-secondary"
              style={{ width: 'auto', paddingLeft: '1rem', paddingRight: '1rem', marginBottom: '0' }}
            >
              {savingFrais ? '…' : t('Sauvegarder', 'Save')}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit text-xs">
            {[
              { id: 'versements', label: `${t('Versements', 'Payments')} (${payments.length})` },
              { id: 'tranches',   label: `${t('Tranches', 'Installments')} (${tranches.length})` },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-1.5 rounded-lg font-semibold transition-colors ${
                  tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Tab Versements ── */}
          {tab === 'versements' && (
            <div className="space-y-3">
              {/* Nouveau versement */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Nouveau versement', 'New payment')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="form-label">{t('Montant (FCFA)', 'Amount (FCFA)')}</label>
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
                    <strong className="text-gray-800">{fmt((fee?.frais_payes ?? 0) + (parseInt(montant, 10) || 0))} FCFA</strong>
                    {(parseInt(fraisAnnuels, 10) || fee?.frais_annuels) > 0 && (
                      <span className="ml-2 text-gray-400">
                        ({t('reste', 'balance')} {fmt(Math.max(0, (parseInt(fraisAnnuels, 10) || fee?.frais_annuels || 0) - ((fee?.frais_payes ?? 0) + (parseInt(montant, 10) || 0))))} FCFA)
                      </span>
                    )}
                  </p>
                )}
                <button
                  onClick={handleAddPayment}
                  disabled={saving || !montant}
                  className="btn-primary"
                  style={{ width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                >
                  {saving ? t('Enregistrement…', 'Saving…') : t('Enregistrer le versement', 'Record payment')}
                </button>
              </div>

              {/* Confirmation + reçu */}
              {lastPayment && (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <svg className="w-5 h-5 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-sm text-emerald-700 font-medium flex-1">
                    {t('Versement enregistré', 'Payment saved')} — {fmt(lastPayment.versement)} FCFA
                  </span>
                  <button
                    onClick={() => onPrintReceipt(lastPayment)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9v-1h8v1H6zm8-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd"/></svg>
                    {t('Imprimer le reçu', 'Print receipt')}
                  </button>
                </div>
              )}

              {/* Historique */}
              {payments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/60">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t('Historique des versements', 'Payment history')} · {payments.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/50 group">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-xs text-gray-500 shrink-0 w-24">
                          {new Date(p.date).toLocaleDateString(localeForLang())}
                        </span>
                        <span className="font-mono font-semibold text-emerald-700 text-sm">
                          + {fmt(p.amount)} FCFA
                        </span>
                        {p.note && (
                          <span className="text-xs text-gray-400 flex-1 truncate">{p.note}</span>
                        )}
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          disabled={deleting === p.id}
                          title={t('Supprimer ce versement', 'Delete this payment')}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-all disabled:opacity-50"
                        >
                          {deleting === p.id ? '…' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40 text-right">
                    <span className="text-xs text-gray-500">
                      {t('Total versé', 'Total paid')} : <strong className="text-gray-800">{fmt(fee?.frais_payes ?? 0)} FCFA</strong>
                    </span>
                  </div>
                </div>
              )}

              {payments.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('Aucun versement enregistré.', 'No payments recorded.')}</p>
              )}
            </div>
          )}

          {/* ── Tab Tranches ── */}
          {tab === 'tranches' && (
            <div className="space-y-3">
              {/* Formulaire ajout */}
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('Ajouter une tranche', 'Add installment')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="form-label">{t('Libellé', 'Label')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('Ex : 1ère tranche', 'E.g. 1st installment')}
                      value={tLabel}
                      onChange={(e) => setTLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('Montant (FCFA)', 'Amount (FCFA)')}</label>
                    <input
                      type="number" min="0" step="500"
                      className="form-input"
                      placeholder="0"
                      value={tAmount}
                      onChange={(e) => setTAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('Date d\'échéance', 'Due date')}</label>
                    <input type="date" className="form-input" value={tDate} onChange={(e) => setTDate(e.target.value)} />
                  </div>
                </div>
                <button
                  onClick={handleAddTranche}
                  disabled={savingTranche || !tAmount}
                  className="btn-secondary"
                  style={{ width: 'auto', paddingLeft: '1rem', paddingRight: '1rem' }}
                >
                  {savingTranche ? '…' : `+ ${t('Ajouter', 'Add')}`}
                </button>
              </div>

              {/* Liste tranches */}
              {tranches.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="divide-y divide-gray-50">
                    {tranches.map((tr) => {
                      const st  = trancheStatus(tr, feeForTranches);
                      const cfg = TRANCHE_STATUS_CFG[st];
                      return (
                        <div key={tr.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 group">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                          <span className={`text-xs font-semibold w-20 shrink-0 ${cfg.text}`}>{cfg.label}</span>
                          <span className="text-sm font-medium text-gray-800 flex-1">{tr.label}</span>
                          <span className="font-mono text-sm text-gray-700">{fmt(tr.amount)} FCFA</span>
                          <span className="text-xs text-gray-400 w-24 text-right shrink-0">
                            {tr.due_date ? new Date(tr.due_date).toLocaleDateString(localeForLang()) : '—'}
                          </span>
                          <button
                            onClick={() => handleDeleteTranche(tr.id)}
                            title={t('Supprimer', 'Delete')}
                            className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 transition-all"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/40 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {t('Total tranches', 'Total installments')} : <strong className="text-gray-700">{fmt(totalTranches)} FCFA</strong>
                    </span>
                    {(fee?.frais_annuels ?? 0) > 0 && totalTranches !== (fee?.frais_annuels ?? 0) && (
                      <span className="text-xs text-amber-600">
                        ≠ {fmt(fee.frais_annuels)} FCFA {t('frais annuels', 'annual fees')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {tranches.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('Aucune tranche définie.', 'No installments defined.')}</p>
              )}
            </div>
          )}

        </div>
    </Modal>
  );
}

// ── Reçu de paiement ─────────────────────────────────────────────────────────

function receiptNumber(studentMatricule, date) {
  const d = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const code = (studentMatricule || 'STU').toUpperCase().replace(/\s/g, '').slice(0, 6);
  return `${d}-${code}`;
}

function printReceipt({ school, student, className, versement, newTotal, fraisAnnuels, date, lang }) {
  const isGE   = resolveCountryCode(school) === 'guinea_eq';
  const isEn   = !isGE && lang === 'anglophone';
  const t      = (fr, en, es) => isGE ? (es ?? fr) : isEn ? en : fr;
  const locale = isGE ? 'es-ES' : isEn ? 'en-GB' : 'fr-FR';
  const fmtNum = (n) => Number(n || 0).toLocaleString(locale);
  const reste  = Math.max(0, (fraisAnnuels || 0) - (newTotal || 0));
  const num    = receiptNumber(student.matricule, date);
  const dateStr = date
    ? new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  const logoHtml = school?.logo_url
    ? `<img src="${school.logo_url}" alt="logo" style="height:60px;width:60px;object-fit:contain;border-radius:6px;">`
    : `<div style="width:60px;height:60px;background:#e0e7ff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#6366f1;">${(school?.name || 'E').charAt(0).toUpperCase()}</div>`;

  const stampHtml = school?.stamp_url
    ? `<img src="${school.stamp_url}" alt="cachet" style="height:70px;opacity:0.85;">`
    : '';

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>${t('Reçu', 'Receipt', 'Recibo')} — ${student.name}</title>
<style>
  @page { size: A5 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; margin: 0; padding: 0; background: #fff; }

  /* Receipt card wrapper */
  .receipt { border: 1.5px solid #333; border-radius: 6px; padding: 0; overflow: hidden; }

  /* School header */
  .header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 2px solid #111; background: #f8f8f8; }
  .school-name { font-size: 14px; font-weight: 800; letter-spacing: 0.3px; line-height: 1.2; }
  .school-meta { font-size: 9px; color: #555; margin-top: 2px; }

  /* Receipt title bar */
  .title-bar { background: #111; color: #fff; text-align: center; padding: 7px 16px; letter-spacing: 2px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .receipt-num { background: #f0f0f0; text-align: center; padding: 4px; font-size: 9px; color: #555; border-bottom: 1px solid #ddd; }

  /* Body */
  .body { padding: 14px 16px; }

  .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 5px; margin-top: 12px; }
  .section-title:first-child { margin-top: 0; }

  .info-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e5e5e5; }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #555; }
  .info-val { font-weight: 600; text-align: right; }

  /* Amount highlight */
  .amount-box { background: #f0fdf4; border: 1.5px solid #22c55e; border-radius: 6px; padding: 10px 14px; margin: 12px 0; }
  .amount-main { font-size: 18px; font-weight: 800; color: #16a34a; }
  .amount-label { font-size: 9px; color: #555; margin-bottom: 3px; }
  .amount-currency { font-size: 11px; font-weight: 600; color: #16a34a; }

  /* Balance row */
  .balance-row { display: flex; gap: 8px; margin-top: 8px; }
  .balance-cell { flex: 1; border: 1px solid #e5e5e5; border-radius: 4px; padding: 6px 8px; text-align: center; }
  .balance-cell .bc-label { font-size: 8px; color: #777; }
  .balance-cell .bc-val { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .bc-paid { color: #16a34a; }
  .bc-due  { color: #111; }
  .bc-rest { color: ${reste === 0 ? '#16a34a' : '#dc2626'}; }

  /* Footer */
  .footer { display: flex; justify-content: space-between; align-items: flex-end; padding: 10px 16px 14px; border-top: 1px solid #ddd; margin-top: 4px; }
  .sign-area { text-align: center; }
  .sign-line { border-top: 1px solid #333; width: 110px; margin: 32px auto 4px; }
  .sign-label { font-size: 8px; color: #555; }
  .date-area { font-size: 9px; color: #555; }
  .date-val  { font-weight: 600; font-size: 10px; color: #111; }

  .notice { font-size: 8px; color: #aaa; text-align: center; padding: 6px 16px; border-top: 1px solid #eee; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .receipt { border: 1.5px solid #333 !important; }
  }
</style>
</head><body>
<div class="receipt">

  <!-- Header -->
  <div class="header">
    ${logoHtml}
    <div>
      <div class="school-name">${school?.name || '—'}</div>
      <div class="school-meta">${school?.type || ''} ${school?.region ? '· ' + school.region : ''}</div>
      <div class="school-meta">${t('Année scolaire', 'Academic Year', 'Año escolar')} : ${school?.current_year || '—'}</div>
    </div>
  </div>

  <!-- Title bar -->
  <div class="title-bar">${t('Reçu de paiement', 'Payment Receipt', 'Recibo de pago')}</div>
  <div class="receipt-num">${t('N°', 'No.', 'Nº')} ${num}</div>

  <!-- Body -->
  <div class="body">

    <!-- Élève -->
    <div class="section-title">${t('Élève', 'Student', 'Alumno')}</div>
    <div class="info-row"><span class="info-label">${t('Nom complet', 'Full name', 'Apellidos y nombre')}</span><span class="info-val">${student.name}</span></div>
    ${student.matricule ? `<div class="info-row"><span class="info-label">${t('Matricule', 'Student ID', 'Matrícula')}</span><span class="info-val" style="font-family:monospace">${student.matricule}</span></div>` : ''}
    <div class="info-row"><span class="info-label">${t('Classe', 'Class', 'Clase')}</span><span class="info-val">${className}</span></div>

    <!-- Versement -->
    <div class="amount-box">
      <div class="amount-label">${t('Montant encaissé ce jour', 'Amount received today', 'Importe recibido hoy')}</div>
      <div><span class="amount-main">${fmtNum(versement)}</span> <span class="amount-currency">FCFA</span></div>
    </div>

    <!-- Récap -->
    <div class="balance-row">
      <div class="balance-cell">
        <div class="bc-label">${t('Frais annuels', 'Annual fees', 'Tasas anuales')}</div>
        <div class="bc-val bc-due">${fmtNum(fraisAnnuels)}</div>
      </div>
      <div class="balance-cell">
        <div class="bc-label">${t('Total versé', 'Total paid', 'Total pagado')}</div>
        <div class="bc-val bc-paid">${fmtNum(newTotal)}</div>
      </div>
      <div class="balance-cell">
        <div class="bc-label">${t('Solde restant', 'Balance due', 'Saldo pendiente')}</div>
        <div class="bc-val bc-rest">${fmtNum(reste)}</div>
      </div>
    </div>

  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="date-area">
      <div>${t('Date', 'Date', 'Fecha')}</div>
      <div class="date-val">${dateStr}</div>
    </div>
    <div class="sign-area">
      ${stampHtml}
      <div class="sign-line"></div>
      <div class="sign-label">${t('Le Caissier / La Caissière', 'Cashier', 'El Cajero / La Cajera')}</div>
    </div>
  </div>

  <div class="notice">${t('Ce reçu fait foi de paiement. Conservez-le précieusement.', 'This receipt is proof of payment. Keep it carefully.', 'Este recibo justifica el pago. Consérvelo.')}</div>

</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Fees() {
  const t = useT();
  const { f } = usePlan();
  const { school } = useAuthStore();
  const classes      = useSchoolStore((s) => s.classes);
  const students     = useSchoolStore((s) => s.students);
  const fees         = useSchoolStore((s) => s.fees);
  const feePayments  = useSchoolStore((s) => s.feePayments);
  const saveFee      = useSchoolStore((s) => s.saveFee);
  const addPayment   = useSchoolStore((s) => s.addPayment);
  const deletePayment = useSchoolStore((s) => s.deletePayment);

  const activeYear = school?.current_year || '';

  const [filterClass,  setFilterClass]  = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [search,       setSearch]       = useState('');
  const [openRow,      setOpenRow]      = useState(null);
  const [page,         setPage]         = useState(1);
  const [showBulk,     setShowBulk]     = useState(false);

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

  const classNameById = (id) => classes.find((c) => c.id === id)?.name || '—';

  const visible = useMemo(() => {
    setPage(1);
    return students
      .filter((s) => !filterClass  || s.class_id === filterClass)
      .filter((s) => !search        || s.name.toLowerCase().includes(search.toLowerCase()) || (s.matricule || '').toLowerCase().includes(search.toLowerCase()))
      .filter((s) => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'overdue') return isOverdue(feeMap[s.id]);
        return feeStatus(feeMap[s.id]) === filterStatus;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, filterClass, filterStatus, search, feeMap]);

  const totalPages = Math.ceil(visible.length / PAGE_SIZE);
  const paginated  = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Statistiques globales ──
  const stats = useMemo(() => {
    const all      = students.filter((s) => !filterClass || s.class_id === filterClass);
    const withFees = all.map((s) => feeMap[s.id]).filter(Boolean);
    const totalDu   = withFees.reduce((n, f) => n + (f.frais_annuels || 0), 0);
    const totalPaye = withFees.reduce((n, f) => n + (f.frais_payes   || 0), 0);
    const countPaid = withFees.filter((f) => feeStatus(f) === 'paid').length;
    const countUnpaid = all.filter((s) => ['unpaid', 'none'].includes(feeStatus(feeMap[s.id]))).length;
    return { totalDu, totalPaye, countPaid, countUnpaid, effectif: all.length };
  }, [students, filterClass, feeMap]);

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
        return [
          s.name,
          s.matricule || '',
          classNameById(s.class_id),
          f?.frais_annuels ?? '',
          f?.frais_payes ?? '',
          f ? Math.max(0, f.frais_annuels - f.frais_payes) : '',
          statusLabel(feeStatus(f)),
          f?.date_dernier_paiement || '',
        ];
      }),
    ];
    const suffix = filterClass ? classNameById(filterClass).replace(/\s+/g, '_') : 'tous';
    downloadCSV(`frais_${suffix}_${activeYear.replace('/', '-')}.csv`, rows);
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
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowBulk(true)} className="btn-secondary">
              {t('Tarification en masse', 'Bulk Fee Setting')}
            </button>
            {visible.length > 0 && (
              <button onClick={handleExport} className="btn-secondary">
                {t('Exporter CSV', 'Export CSV')}
              </button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border-l-4 border-brand-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">
              {fmt(stats.totalDu)} <span className="text-xs font-normal text-gray-400">FCFA</span>
            </div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Total dû', 'Total due')}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.effectif} {t('élèves', 'students')}</div>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-emerald-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">
              {fmt(stats.totalPaye)} <span className="text-xs font-normal text-gray-400">FCFA</span>
            </div>
            <div className="text-sm font-semibold text-gray-700 mt-1">{t('Total encaissé', 'Total collected')}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {stats.totalDu > 0 ? `${Math.round((stats.totalPaye / stats.totalDu) * 100)}% ${t('recouvré', 'recovered')}` : '—'}
            </div>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-amber-400 p-5 shadow-sm">
            <div className="text-xl font-bold text-gray-900">
              {fmt(Math.max(0, stats.totalDu - stats.totalPaye))} <span className="text-xs font-normal text-gray-400">FCFA</span>
            </div>
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
          <select
            className="form-input max-w-xs"
            value={filterClass}
            onChange={(e) => { setFilterClass(e.target.value); setPage(1); }}
          >
            <option value="">{t('Toutes les classes', 'All classes')}</option>
            {classes.map((c) => (
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

          {(filterClass || filterStatus !== 'all' || search) && (
            <button
              onClick={() => { setFilterClass(''); setFilterStatus('all'); setSearch(''); setPage(1); }}
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
                    <th className="px-4 py-3 text-right">{t('Dû (FCFA)', 'Due (FCFA)')}</th>
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
                    const status = feeStatus(fee);
                    const cfg    = STATUS_CONFIG[status];
                    const reste  = fee ? Math.max(0, fee.frais_annuels - fee.frais_payes) : null;
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
                          {fee?.frais_annuels ? fmt(fee.frais_annuels) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            {fee?.frais_payes
                              ? <span className="font-mono text-emerald-600 font-semibold">{fmt(fee.frais_payes)}</span>
                              : <span className="text-gray-300 font-mono">0</span>}
                            <PayProgress fee={fee} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {reste !== null && fee?.frais_annuels > 0
                            ? <span className={reste === 0 ? 'text-emerald-600' : 'text-red-500 font-semibold'}>{fmt(reste)}</span>
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

        {/* Modal tarification en masse */}
        {showBulk && (
          <BulkFeeModal
            classes={classes}
            students={students}
            activeYear={activeYear}
            saveFee={saveFee}
            onClose={() => setShowBulk(false)}
          />
        )}

        {/* Modal gestion des frais (élève sélectionné) */}
        {openRow && (() => {
          const student = students.find((s) => s.id === openRow);
          if (!student) return null;
          return (
            <PaymentPanel
              student={student}
              fee={feeMap[student.id]}
              payments={feePayments
                .filter((p) => p.student_id === student.id && p.academic_year === activeYear)
                .sort((a, b) => b.date.localeCompare(a.date))}
              activeYear={activeYear}
              onAddPayment={addPayment}
              onDeletePayment={deletePayment}
              onSaveFee={saveFee}
              onClose={() => setOpenRow(null)}
              onPrintReceipt={(payment) =>
                printReceipt({
                  school,
                  student,
                  className: classNameById(student.class_id),
                  lang: school?.language,
                  ...payment,
                })
              }
            />
          );
        })()}

      </div>
    </Layout>
  );
}
