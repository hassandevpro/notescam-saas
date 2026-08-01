// Écran « Décisions à approuver » (gouvernance financière distante, H3-b).
// Le Cloud N'ÉCRIT PAS la finance : il ÉMET une intention (RPC submit_governance_decision) ;
// le serveur LAN de l'école re-vérifie (accès distant + permission + plafond de montant +
// version + état) puis APPLIQUE et renvoie une confirmation. Ce composant est un mince
// consommateur : toute la sécurité vit dans la RPC + le LAN.
import { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { toast } from '../store/toastStore';
import { fetchPendingApprovalRequests, submitGovernanceDecision } from '../lib/governanceDecisionService';

export default function RemoteApprovals() {
  const t = useT();
  const money = useMoney();
  const schoolId = useAuthStore((s) => s.school?.id);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    try { setRequests(await fetchPendingApprovalRequests(schoolId)); }
    catch { setRequests([]); }
    setLoading(false);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const p = (ev) => (typeof ev.payload === 'object' && ev.payload) ? ev.payload : {};

  const decide = async (ev, decision) => {
    const pl = p(ev);
    const expenseId = pl.expense_id || ev.aggregate_id;
    const expectedVersion = pl.expected_version;
    setBusyId(ev.id);
    try {
      const { error } = await submitGovernanceDecision({ expenseId, decision, expectedVersion });
      if (error) { toast.error(error.message || t('Échec de la transmission', 'Submission failed', 'Error de envío')); }
      else {
        toast.success(t(
          'Décision transmise · le serveur de l’école va l’appliquer',
          'Decision submitted · the school server will apply it',
          'Decisión enviada · el servidor de la escuela la aplicará'));
        await load();
      }
    } catch (e) { toast.error(e?.message || 'Erreur'); }
    setBusyId(null);
  };

  return (
    <Layout>
      <div className="max-w-4xl">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Décisions à approuver', 'Decisions to approve', 'Decisiones por aprobar')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Dépenses soumises par l’établissement, en attente de votre décision.',
                 'Expenses submitted by the school, awaiting your decision.',
                 'Gastos enviados por la escuela, en espera de su decisión.')}
            </p>
          </div>
          <button onClick={load} className="btn-secondary" style={{ width: 'auto' }}>
            {t('Rafraîchir', 'Refresh', 'Actualizar')}
          </button>
        </div>

        <div className="text-xs text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-4">
          🛰️ {t(
            'Votre décision est appliquée par le serveur de l’école (LAN), qui re-vérifie vos droits et le plafond de montant.',
            'Your decision is applied by the school server (LAN), which re-checks your rights and amount limit.',
            'Su decisión la aplica el servidor de la escuela (LAN), que revalida sus permisos y el límite de importe.')}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <p className="text-gray-500 text-sm">{t('Aucune demande en attente.', 'No pending requests.', 'Sin solicitudes pendientes.')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((ev) => {
              const pl = p(ev);
              const busy = busyId === ev.id;
              return (
                <div key={ev.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">{money(Number(pl.amount) || 0)}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                        {t('En attente', 'Pending', 'Pendiente')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {pl.requester || ev.actor_name || t('Demandeur inconnu', 'Unknown requester', 'Solicitante desconocido')}
                      {pl.motif ? ` — ${pl.motif}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      {pl.expense_date || (ev.occurred_at ? String(ev.occurred_at).slice(0, 10) : '')}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => decide(ev, 'approve')}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">
                      {t('Approuver', 'Approve', 'Aprobar')}
                    </button>
                    <button
                      onClick={() => decide(ev, 'refuse')}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40">
                      {t('Rejeter', 'Reject', 'Rechazar')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
