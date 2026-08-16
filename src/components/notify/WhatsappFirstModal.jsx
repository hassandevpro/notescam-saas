import { useEffect, useState } from 'react';
import { whatsappLinkFor } from '../../lib/parentLinks';
import { fetchSmsSettings } from '../../lib/smsSettingsService';
import { notify } from '../../lib/notificationService';

// ── Campagne « WhatsApp d'abord, SMS en secours » ────────────────────────────
// WhatsApp (lien wa.me) est GRATUIT et ne demande aucun fournisseur, mais c'est
// un lien qu'un HUMAIN doit ouvrir puis confirmer l'envoi dans l'app — rien ne
// permet de savoir programmatiquement si le message est réellement parti (pas
// d'accusé de réception côté wa.me). On track donc seulement les familles pour
// lesquelles le staff a CLIQUÉ le lien ; les autres restent candidates au SMS,
// qui lui reste le seul canal qu'on puisse déclencher automatiquement en masse
// (donc payant, cf. supabase_sms_budget.sql — d'où l'estimation avant envoi).
//
// `families` : [{ id, name, phone, message }]. `message` sert aux DEUX canaux.
export default function WhatsappFirstModal({ schoolId, families = [], smsType, smsTitle, t, onDone, onClose }) {
  const [attempted, setAttempted] = useState(() => new Set());
  const [smsSettings, setSmsSettings] = useState(null);
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState(null);

  useEffect(() => {
    if (!schoolId) return;
    fetchSmsSettings(schoolId).then(setSmsSettings);
  }, [schoolId]);

  const markAttempted = (id) => setAttempted((prev) => new Set(prev).add(id));

  const remaining = families.filter((f) => !attempted.has(f.id));
  const estimatedFcfa = remaining.length * (Number(smsSettings?.cost_per_sms_fcfa) || 20);
  const remainingBudgetFcfa = smsSettings
    ? Math.max(0, (Number(smsSettings.budget_fcfa) || 0) - (Number(smsSettings.spent_fcfa) || 0))
    : null;
  const overBudget = remainingBudgetFcfa != null && estimatedFcfa > remainingBudgetFcfa;

  const handleSendRemainingSms = async () => {
    if (!remaining.length) return;
    if (!window.confirm(t(
      `Envoyer par SMS aux ${remaining.length} famille${remaining.length > 1 ? 's' : ''} restante${remaining.length > 1 ? 's' : ''} (~${estimatedFcfa} FCFA) ?`,
      `Send by SMS to the ${remaining.length} remaining famil${remaining.length > 1 ? 'ies' : 'y'} (~${estimatedFcfa} FCFA)?`,
    ))) return;
    setSending(true);
    await Promise.all(remaining.map((f) => notify({
      schoolId, recipients: [{ phone: f.phone }], channels: ['sms'], priority: 'important',
      type: smsType, title: smsTitle, body: f.message,
    })));
    setSending(false);
    setResultMsg(t(
      `${remaining.length} SMS mis en file.`,
      `${remaining.length} SMS queued.`,
    ));
    onDone?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {t(
          "Ouvrez WhatsApp pour chaque famille (gratuit) — le message est prérempli, il ne reste qu'à l'envoyer. Les familles restantes pourront être jointes par SMS.",
          "Open WhatsApp for each family (free) — the message is pre-filled, just send it. Remaining families can be reached by SMS.",
        )}
      </p>

      <ul className="max-h-72 overflow-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
        {families.map((f) => {
          const link = whatsappLinkFor(f.phone, f.message);
          const done = attempted.has(f.id);
          return (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{f.name}</span>
              {done ? (
                <span className="shrink-0 text-xs font-semibold text-emerald-600">✓ {t('WhatsApp ouvert', 'WhatsApp opened')}</span>
              ) : link ? (
                <a href={link} target="_blank" rel="noreferrer" onClick={() => markAttempted(f.id)}
                  className="shrink-0 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200">
                  WhatsApp
                </a>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">{t('numéro invalide', 'invalid number')}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
        <p className="text-xs text-slate-500">
          {t(
            `${remaining.length} famille${remaining.length > 1 ? 's' : ''} restante${remaining.length > 1 ? 's' : ''} — coût SMS estimé ~${estimatedFcfa} FCFA${remainingBudgetFcfa != null ? ` (budget SMS restant : ${remainingBudgetFcfa} FCFA)` : ''}.`,
            `${remaining.length} remaining famil${remaining.length > 1 ? 'ies' : 'y'} — estimated SMS cost ~${estimatedFcfa} FCFA${remainingBudgetFcfa != null ? ` (remaining SMS budget: ${remainingBudgetFcfa} FCFA)` : ''}.`,
          )}
        </p>
        {overBudget && (
          <p className="text-xs font-semibold text-amber-600">
            {t('⚠️ Dépasse le budget SMS restant : une partie sera automatiquement bloquée.', '⚠️ Exceeds the remaining SMS budget: some will be automatically blocked.')}
          </p>
        )}
        <button type="button" onClick={handleSendRemainingSms} disabled={sending || !remaining.length}
          className="btn-secondary text-sm disabled:opacity-50" style={{ width: 'auto' }}>
          {sending
            ? t('Envoi…', 'Sending…')
            : t(`Envoyer par SMS (${remaining.length})`, `Send by SMS (${remaining.length})`)}
        </button>
        {resultMsg && <p className="text-xs text-emerald-600">{resultMsg}</p>}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
          {t('Fermer', 'Close')}
        </button>
      </div>
    </div>
  );
}
