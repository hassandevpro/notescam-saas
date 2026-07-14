// Écran d'attribution des RÔLES DE GOUVERNANCE (Personnel → « Gouvernance »).
// L'admin attribue à chaque compte un ou plusieurs rôles du catalogue, avec
// secteur, fenêtre de validité (dates) et statut. Les permissions/menus/dashboards
// en découlent automatiquement (moteur governanceEngine, au prochain chargement
// du compte concerné). Écriture réservée admin (RPC SECURITY DEFINER / handler LAN).
import { useEffect, useMemo, useState, useCallback } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { fetchStaff } from '../lib/staffAccounts';
import {
  fetchGovernanceCatalog, fetchGovernanceRoles, fetchGovernanceHistory,
  assignGovernanceRole, revokeGovernanceRole,
} from '../governance/governanceService';
import { catalogOrDefault } from '../governance/defaultCatalog';
import { SECTOR_LABELS } from './budgets/budgetUi';

const SECTORS = Object.keys(SECTOR_LABELS);

export default function GovernanceRolesManager() {
  const t = useT();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;

  const [accounts, setAccounts] = useState([]);      // comptes de direction
  const [catalog, setCatalog]   = useState([]);      // catalogue de rôles
  const [assignments, setAssignments] = useState([]); // toutes les attributions de l'école
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);    // { account }
  const [showHistory, setShowHistory] = useState(false);

  const roles = useMemo(() => catalogOrDefault(catalog).filter((r) => r.active !== false), [catalog]);
  const roleByCode = useMemo(() => new Map(roles.map((r) => [r.code, r])), [roles]);

  const reload = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    const [censeurs, surveillants, cat, asg, hist] = await Promise.all([
      fetchStaff('censeur'), fetchStaff('surveillant'),
      fetchGovernanceCatalog(schoolId), fetchGovernanceRoles(schoolId), fetchGovernanceHistory(schoolId),
    ]);
    // Dédoublonne par user_id (un compte peut apparaître une fois).
    const seen = new Set();
    const accs = [...(censeurs || []), ...(surveillants || [])].filter((a) => {
      if (!a.user_id || seen.has(a.user_id)) return false;
      seen.add(a.user_id); return true;
    });
    setAccounts(accs);
    setCatalog(cat || []);
    setAssignments(asg || []);
    setHistory(hist || []);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { reload(); }, [reload]);

  const assignmentsFor = (userId) => assignments.filter((a) => a.user_id === userId);

  const removeAssignment = async (row) => {
    const ok = await revokeGovernanceRole(row.id);
    if (ok) { toast.success(t('Rôle retiré', 'Role removed', 'Rol retirado')); reload(); }
    else toast.error(t('Échec du retrait', 'Removal failed', 'Error al retirar'));
  };

  const roleName = (code) => roleByCode.get(code)?.name || code;
  const secLabel = (s) => (s ? t(...(SECTOR_LABELS[s] || [s])) : '');

  if (loading) return <div className="text-gray-400 text-sm py-12 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          {t('Attribuez des rôles de direction aux comptes. Les menus, autorisations et validations en découlent automatiquement. La personne concernée voit ses nouveaux droits à sa prochaine connexion.',
             'Assign leadership roles to accounts. Menus, permissions and approvals follow automatically. The person sees their new rights at next login.',
             'Asigne roles de dirección a las cuentas. Menús, permisos y validaciones se derivan automáticamente.')}
        </p>
        <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 whitespace-nowrap">
          🕑 {showHistory ? t('Masquer l’historique', 'Hide history', 'Ocultar historial') : t('Historique', 'History', 'Historial')}
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          {t('Aucun compte de direction. Créez-en dans « Rôles & accès ».', 'No leadership account yet. Create one under “Roles & access”.', 'Sin cuentas de dirección todavía.')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {accounts.map((a) => {
            const rows = assignmentsFor(a.user_id);
            return (
              <div key={a.user_id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{a.full_name || '—'}{a.active ? '' : <span className="ml-2 text-[11px] text-gray-400">({t('désactivé', 'disabled', 'desactivado')})</span>}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rows.length === 0 && <span className="text-xs text-gray-400 italic">{t('Aucun rôle de gouvernance', 'No governance role', 'Sin rol')}</span>}
                    {rows.map((r) => (
                      <span key={r.id} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${r.status === 'inactive' ? 'bg-gray-100 text-gray-400 line-through' : 'bg-indigo-50 text-indigo-700'}`}>
                        {roleName(r.role)}{r.sector ? ` · ${secLabel(r.sector)}` : ''}
                        {(r.start_date || r.end_date) ? ` · ${r.start_date || '…'}→${r.end_date || '…'}` : ''}
                        <button onClick={() => removeAssignment(r)} className="ml-0.5 text-indigo-400 hover:text-rose-600" title={t('Retirer', 'Remove', 'Retirar')}>✕</button>
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setModal({ account: a })}
                  className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg whitespace-nowrap">
                  + {t('Attribuer un rôle', 'Assign a role', 'Asignar rol')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showHistory && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">{t('Historique des changements', 'Change history', 'Historial de cambios')}</div>
          {history.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">{t('Aucun changement enregistré.', 'No change recorded.', 'Sin cambios.')}</div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50 text-gray-400 text-xs"><tr>
                <th className="text-left px-4 py-2 font-semibold">{t('Date', 'Date', 'Fecha')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('Action', 'Action', 'Acción')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('Rôle', 'Role', 'Rol')}</th>
                <th className="text-left px-4 py-2 font-semibold">{t('Par', 'By', 'Por')}</th>
              </tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{String(h.at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-2">{h.action}</td>
                  <td className="px-4 py-2 text-gray-700">{roleName(h.role_code)}{h.sector ? ` · ${secLabel(h.sector)}` : ''}</td>
                  <td className="px-4 py-2 text-gray-500">{h.actor_name || '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {modal && (
        <AssignModal account={modal.account} roles={roles} sectors={SECTORS}
          existing={assignmentsFor(modal.account.user_id).map((r) => r.role)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
    </div>
  );
}

// Modale : attribuer un ou plusieurs rôles + secteur/dates/statut.
function AssignModal({ account, roles, sectors, existing, onClose, onSaved }) {
  const t = useT();
  const [selected, setSelected] = useState(new Set());
  const [sector, setSector] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);

  const toggle = (code) => setSelected((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  // Un secteur n'a de sens que pour les rôles de secteur sélectionnés.
  const needsSector = [...selected].some((c) => roles.find((r) => r.code === c)?.scope === 'sector');

  const submit = async (e) => {
    e.preventDefault();
    if (busy || selected.size === 0) return;
    setBusy(true);
    let okAll = true;
    for (const code of selected) {
      const res = await assignGovernanceRole(account.user_id, code, {
        sector: sector || null, startDate: startDate || null, endDate: endDate || null, status,
      });
      if (res?.error) okAll = false;
    }
    setBusy(false);
    if (okAll) { toast.success(t('Rôle(s) attribué(s)', 'Role(s) assigned', 'Rol(es) asignado(s)')); onSaved(); }
    else toast.error(t('Échec de l’attribution (droits admin requis).', 'Assignment failed (admin required).', 'Error de asignación.'));
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  return (
    <Modal title={`${t('Attribuer un rôle', 'Assign a role', 'Asignar rol')} — ${account.full_name || ''}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Rôle(s)', 'Role(s)', 'Rol(es)')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {roles.map((r) => (
              <label key={r.code} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm ${selected.has(r.code) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={selected.has(r.code)} onChange={() => toggle(r.code)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-gray-800">{r.name}</span>
                  {existing.includes(r.code) && <span className="ml-1 text-[10px] text-amber-600">({t('déjà attribué → mise à jour', 'already assigned → update', 'ya asignado')})</span>}
                  {r.description && <span className="block text-[11px] text-gray-400">{r.description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Secteur', 'Sector', 'Sector')} {needsSector ? '' : <span className="text-gray-300">({t('facultatif', 'optional', 'opcional')})</span>}</label>
            <select className={fld} value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">{t('— natif du rôle —', '— role default —', '— por defecto —')}</option>
              {sectors.map((s) => <option key={s} value={s}>{t(...(SECTOR_LABELS[s] || [s]))}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Statut', 'Status', 'Estado')}</label>
            <select className={fld} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{t('Actif', 'Active', 'Activo')}</option>
              <option value="inactive">{t('Inactif', 'Inactive', 'Inactivo')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Début', 'Start', 'Inicio')} <span className="text-gray-300">({t('facultatif', 'optional', 'opcional')})</span></label>
            <input type="date" className={fld} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Fin', 'End', 'Fin')} <span className="text-gray-300">({t('facultatif', 'optional', 'opcional')})</span></label>
            <input type="date" className={fld} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={busy || selected.size === 0} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {busy ? t('Attribution…', 'Assigning…', 'Asignando…') : t('Attribuer', 'Assign', 'Asignar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
