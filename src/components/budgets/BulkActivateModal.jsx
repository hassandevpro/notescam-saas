// Activation en lot des lignes prêtes : UN aperçu, UNE confirmation, un résultat
// par ligne. Le plan (lignes retenues, lignes exclues, marge sous l'enveloppe)
// vient de lib/budgetLineView.planBulkActivation, qui rejoue le contrôle du
// moteur ligne après ligne. Le serveur reste l'autorité : un refus est affiché
// tel quel, ligne par ligne.
import { useState } from 'react';
import Modal from '../Modal';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { LINE_ERROR_LABELS } from './budgetUi';

export default function BulkActivateModal({ plan, remote, onActivate, onDone, onClose }) {
  const t = useT();
  const money = useMoney();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);   // [{ id, label, status: 'ok'|'pending'|'refused', message }]

  const n = plan.accepted.length;
  const run = async () => {
    if (running) return;
    setRunning(true);
    const out = [];
    for (const raw of plan.accepted) {   // en série : le plafond annuel est cumulatif
      try {
        const res = await onActivate(raw);
        if (res?.error) out.push({ id: raw.id, label: raw.label, status: 'refused', message: res.error.message || String(res.error) });
        else out.push({ id: raw.id, label: raw.label, status: res?.pending ? 'pending' : 'ok' });
      } catch (e) {
        out.push({ id: raw.id, label: raw.label, status: 'refused', message: e?.message || String(e) });
      }
      setResults([...out]);
    }
    setRunning(false);
    onDone?.(out);
  };

  const okCount = (results || []).filter((r) => r.status === 'ok').length;
  const pendingCount = (results || []).filter((r) => r.status === 'pending').length;
  const refusedCount = (results || []).filter((r) => r.status === 'refused').length;
  const finished = results && !running;

  return (
    <Modal title={t('Activer les lignes prêtes', 'Activate the ready lines', 'Activar las líneas listas')} onClose={running ? () => {} : onClose} size="lg">
      <div className="space-y-4">
        {!results && (
          <>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div><dd className="font-bold text-gray-900 tabular-nums">{n}</dd><dt className="text-xs text-gray-500">{t('lignes activées', 'lines activated', 'líneas activadas')}</dt></div>
              <div><dd className="font-bold text-emerald-700 tabular-nums">{money(plan.total)}</dd><dt className="text-xs text-gray-500">{t('total activé', 'total activated', 'total activado')}</dt></div>
              <div><dd className="font-bold text-gray-900 tabular-nums">{money(plan.envelope)}</dd><dt className="text-xs text-gray-500">{t('enveloppe', 'envelope', 'envolvente')}</dt></div>
              <div><dd className={`font-bold tabular-nums ${plan.remaining < 0 ? 'text-rose-700' : 'text-sky-700'}`}>{money(plan.remaining)}</dd><dt className="text-xs text-gray-500">{t('restant sous l’enveloppe', 'left under the envelope', 'restante bajo la envolvente')}</dt></div>
            </dl>

            {remote && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('Ici, chaque activation est envoyée comme une demande au poste de l’école, qui l’applique. Elles peuvent mettre quelques minutes à apparaître.',
                   'Here, each activation is sent as a request to the school workstation, which applies it. They can take a few minutes to appear.',
                   'Aquí cada activación se envía como solicitud al puesto de la escuela. Pueden tardar unos minutos.')}
              </p>
            )}

            <section>
              <h3 className="text-sm font-bold text-gray-800 mb-1">{t('Lignes retenues', 'Lines included', 'Líneas incluidas')} ({n})</h3>
              <ul className="max-h-48 overflow-auto text-sm divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {plan.accepted.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 px-3 py-1.5">
                    <span className="min-w-0 truncate">{l.label}</span>
                    <span className="tabular-nums text-gray-600 shrink-0">{money(l.planned_amount)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {plan.excluded.length > 0 && (
              <section>
                <h3 className="text-sm font-bold text-rose-800 mb-1">{t('Lignes exclues', 'Lines excluded', 'Líneas excluidas')} ({plan.excluded.length})</h3>
                <ul className="text-sm divide-y divide-rose-100 border border-rose-200 bg-rose-50 rounded-lg">
                  {plan.excluded.map((l) => (
                    <li key={l.id} className="px-3 py-1.5">
                      <b>{l.label}</b> — {l.errs.map((e) => t(...(LINE_ERROR_LABELS[e] || [e, e, e]))).join(' · ')}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg min-h-9">{t('Annuler', 'Cancel', 'Cancelar')}</button>
              <button type="button" onClick={run} disabled={n === 0 || running}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50 min-h-9">
                {remote
                  ? t(`Envoyer ${n} demandes d’activation`, `Send ${n} activation requests`, `Enviar ${n} solicitudes de activación`)
                  : t(`Activer ${n} lignes`, `Activate ${n} lines`, `Activar ${n} líneas`)}
              </button>
            </div>
          </>
        )}

        {results && (
          <>
            <p className="text-sm" role="status" aria-live="polite">
              {running
                ? t(`Activation en cours… ${results.length} sur ${n}`, `Activating… ${results.length} of ${n}`, `Activando… ${results.length} de ${n}`)
                : t(`Terminé : ${okCount} activée(s), ${pendingCount} en attente d’application, ${refusedCount} refusée(s).`,
                    `Done: ${okCount} activated, ${pendingCount} pending, ${refusedCount} refused.`,
                    `Terminado: ${okCount} activadas, ${pendingCount} pendientes, ${refusedCount} rechazadas.`)}
            </p>
            <ul className="max-h-64 overflow-auto text-sm divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {results.map((r) => (
                <li key={r.id} className="px-3 py-1.5 flex items-start justify-between gap-3">
                  <span className="min-w-0">{r.label}{r.message && <span className="block text-xs text-rose-700">{r.message}</span>}</span>
                  <span className={`shrink-0 text-xs font-semibold ${r.status === 'refused' ? 'text-rose-700' : r.status === 'pending' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {r.status === 'ok' && `✓ ${t('Activée', 'Activated', 'Activada')}`}
                    {r.status === 'pending' && `⏳ ${t('En attente d’application', 'Pending', 'Pendiente')}`}
                    {r.status === 'refused' && `✕ ${t('Refusée', 'Refused', 'Rechazada')}`}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-1">
              <button type="button" onClick={onClose} disabled={!finished}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 min-h-9">
                {t('Fermer', 'Close', 'Cerrar')}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
