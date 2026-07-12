// ÉDITEUR du catalogue de rôles (Personnel → Gouvernance → Catalogue). Permet de
// créer / modifier / dupliquer / (dés)activer / supprimer des rôles, entièrement
// en base : ajouter un rôle ne demande AUCUNE modification de code. Les rôles
// système sont protégés (non supprimables) mais restent modifiables/désactivables.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Modal from './Modal';
import { useT } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { useConfirm } from './ConfirmDialog';
import {
  fetchGovernanceCatalog, upsertGovernanceRole, deleteGovernanceRole,
} from '../governance/governanceService';
import {
  PERMISSION_OPTIONS, WORKFLOW_OPTIONS, DASHBOARD_OPTIONS, SCOPE_OPTIONS, validateRoleDraft,
} from '../governance/permissionCatalog';
import { CAP_GROUPS } from '../config/capabilities';
import { SECTOR_LABELS } from './budgets/budgetUi';

const SECTORS = Object.keys(SECTOR_LABELS);
const asArray = (v) => (Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? JSON.parse(v) : []));

export default function GovernanceCatalogManager() {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { draft, isNew }

  const reload = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    setRoles(await fetchGovernanceCatalog(schoolId));
    setLoading(false);
  }, [schoolId]);
  useEffect(() => { reload(); }, [reload]);

  const codes = useMemo(() => roles.map((r) => r.code), [roles]);
  const secLabel = (s) => (s ? t(...(SECTOR_LABELS[s] || [s])) : '—');

  const toDraft = (r) => ({
    id: r.id, code: r.code, name: r.name, description: r.description || '',
    rank: r.rank ?? 0, scope: r.scope || 'complex', sector: r.sector || '',
    permissions: asArray(r.permissions), pages: asArray(r.pages),
    dashboards: asArray(r.dashboards), workflows: asArray(r.workflows), active: r.active !== false,
  });

  const openNew = () => setModal({ isNew: true, draft: {
    id: null, code: '', name: '', description: '', rank: 0, scope: 'complex', sector: '',
    permissions: [], pages: [], dashboards: [], workflows: [], active: true,
  } });
  const openEdit = (r) => setModal({ isNew: false, draft: toDraft(r) });
  const openDuplicate = (r) => setModal({ isNew: true, draft: {
    ...toDraft(r), id: null, code: `${r.code}_copie`, name: `${r.name} (copie)`,
  } });

  const toggleActive = async (r) => {
    const res = await upsertGovernanceRole({ ...toDraft(r), active: !(r.active !== false) });
    if (res?.error) toast.error(t('Échec', 'Failed', 'Error'));
    else { toast.success(t('Mis à jour', 'Updated', 'Actualizado')); reload(); }
  };

  const remove = async (r) => {
    if (!(await confirm({ tone: 'danger', title: t('Supprimer le rôle', 'Delete role', 'Eliminar rol'),
      message: t('Supprimer ce rôle du catalogue ? Les attributions existantes de ce rôle deviendront inertes.',
        'Delete this role from the catalog? Existing assignments of this role will become inert.',
        '¿Eliminar este rol del catálogo?'),
      confirmLabel: t('Supprimer', 'Delete', 'Eliminar') }))) return;
    const res = await deleteGovernanceRole(r.id);
    if (res?.error) toast.error(res.error.message || t('Échec', 'Failed', 'Error'));
    else { toast.success(t('Rôle supprimé', 'Role deleted', 'Rol eliminado')); reload(); }
  };

  if (loading) return <div className="text-gray-400 text-sm py-12 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">
          {t('Définissez les rôles de direction et leurs droits. Ajouter un rôle ne nécessite aucune intervention technique.',
             'Define leadership roles and their rights. Adding a role needs no technical work.',
             'Defina los roles y sus permisos. Añadir un rol no requiere intervención técnica.')}
        </p>
        <button onClick={openNew} className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg whitespace-nowrap">
          + {t('Nouveau rôle', 'New role', 'Nuevo rol')}
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-800">
          {t('Catalogue vide. Exécutez la migration supabase_governance_catalog.sql pour amorcer les rôles.',
             'Empty catalog. Run supabase_governance_catalog.sql to seed the roles.',
             'Catálogo vacío. Ejecute la migración para inicializar los roles.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {roles.map((r) => {
            const nperm = asArray(r.permissions).length + asArray(r.workflows).length;
            const inactive = r.active === false;
            return (
              <div key={r.id} className={`bg-white rounded-xl border p-4 ${inactive ? 'border-gray-200 opacity-60' : 'border-gray-100 shadow-sm'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 flex items-center gap-2">
                      {r.name}
                      {r.is_system ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{t('système', 'system', 'sistema')}</span> : null}
                      {inactive ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">{t('inactif', 'inactive', 'inactivo')}</span> : null}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono">{r.code} · {t('rang', 'rank', 'rango')} {r.rank}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                  <div>{t('Portée', 'Scope', 'Alcance')} : {r.scope === 'sector' ? `${t('Secteur', 'Sector', 'Sector')} (${secLabel(r.sector)})` : t('Transverse', 'Complex-wide', 'Transversal')}</div>
                  <div>{nperm} {t('droit(s)', 'right(s)', 'permiso(s)')} · {asArray(r.pages).length} {t('page(s)', 'page(s)', 'página(s)')} · {asArray(r.dashboards).length} {t('dashboard(s)', 'dashboard(s)', 'panel(es)')}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button onClick={() => openEdit(r)} className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">{t('Modifier', 'Edit', 'Editar')}</button>
                  <button onClick={() => openDuplicate(r)} className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">{t('Dupliquer', 'Duplicate', 'Duplicar')}</button>
                  <button onClick={() => toggleActive(r)} className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold">
                    {inactive ? t('Activer', 'Activate', 'Activar') : t('Désactiver', 'Deactivate', 'Desactivar')}
                  </button>
                  {!r.is_system && (
                    <button onClick={() => remove(r)} className="text-[11px] px-2 py-1 rounded text-rose-600 hover:bg-rose-50 font-semibold">{t('Supprimer', 'Delete', 'Eliminar')}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <RoleEditor draft={modal.draft} isNew={modal.isNew}
          existingCodes={codes.filter((c) => c !== modal.draft.code)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
      {dialog}
    </div>
  );
}

// ── Modale d'édition d'un rôle ───────────────────────────────────────────────
function RoleEditor({ draft, isNew, existingCodes, onClose, onSaved }) {
  const t = useT();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState([]);

  const set = (patch) => setD((s) => ({ ...s, ...patch }));
  const toggle = (field, key) => setD((s) => {
    const arr = new Set(s[field] || []);
    arr.has(key) ? arr.delete(key) : arr.add(key);
    return { ...s, [field]: [...arr] };
  });
  const has = (field, key) => (d[field] || []).includes(key);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateRoleDraft(d, { existingCodes: isNew ? existingCodes : [] });
    setErrs(v);
    if (v.length || busy) return;
    setBusy(true);
    const res = await upsertGovernanceRole({ ...d, sector: d.scope === 'sector' ? d.sector : null });
    setBusy(false);
    if (res?.error) toast.error(res.error.message || t('Échec de l’enregistrement', 'Save failed', 'Error al guardar'));
    else { toast.success(t('Rôle enregistré', 'Role saved', 'Rol guardado')); onSaved(); }
  };

  const fld = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  const err = (k) => errs.includes(k);

  return (
    <Modal title={isNew ? t('Nouveau rôle', 'New role', 'Nuevo rol') : t('Modifier le rôle', 'Edit role', 'Editar rol')} onClose={onClose} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Nom', 'Name', 'Nombre')}</label>
            <input className={`${fld} ${err('name') ? 'border-rose-400' : ''}`} value={d.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Rang', 'Rank', 'Rango')}</label>
            <input type="number" className={fld} value={d.rank} onChange={(e) => set({ rank: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Code', 'Code', 'Código')}</label>
            <input className={`${fld} font-mono ${err('code') || err('code_unique') ? 'border-rose-400' : ''}`} value={d.code}
              disabled={!isNew} onChange={(e) => set({ code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="econome" />
            {err('code_unique') && <p className="text-[11px] text-rose-600 mt-0.5">{t('Code déjà utilisé', 'Code already used', 'Código ya usado')}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Portée', 'Scope', 'Alcance')}</label>
            <select className={fld} value={d.scope} onChange={(e) => set({ scope: e.target.value })}>
              {SCOPE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{t(...o.label)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Secteur', 'Sector', 'Sector')}</label>
            <select className={`${fld} ${err('sector') ? 'border-rose-400' : ''}`} value={d.sector} disabled={d.scope !== 'sector'} onChange={(e) => set({ sector: e.target.value })}>
              <option value="">—</option>
              {SECTORS.map((s) => <option key={s} value={s}>{t(...(SECTOR_LABELS[s] || [s]))}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Description', 'Description', 'Descripción')}</label>
          <input className={fld} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CheckGroup title={t('Permissions', 'Permissions', 'Permisos')} options={PERMISSION_OPTIONS} has={(k) => has('permissions', k)} onToggle={(k) => toggle('permissions', k)} t={t} />
          <CheckGroup title={t('Workflows de validation', 'Approval workflows', 'Flujos de validación')} options={WORKFLOW_OPTIONS} has={(k) => has('workflows', k)} onToggle={(k) => toggle('workflows', k)} t={t} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">{t('Menus / pages', 'Menus / pages', 'Menús / páginas')}</div>
            <div className="border border-gray-200 rounded-lg p-2 max-h-52 overflow-y-auto space-y-2">
              {CAP_GROUPS.map((g) => (
                <div key={g.module[0]}>
                  <div className="text-[10px] font-bold text-gray-400 uppercase">{t(...g.module)}</div>
                  {g.caps.map((c) => (
                    <label key={c.to} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer hover:bg-gray-50 rounded">
                      <input type="checkbox" checked={has('pages', c.to)} onChange={() => toggle('pages', c.to)} />
                      <span className="text-gray-700">{t(...c.label)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <CheckGroup title={t('Dashboards', 'Dashboards', 'Paneles')} options={DASHBOARD_OPTIONS} has={(k) => has('dashboards', k)} onToggle={(k) => toggle('dashboards', k)} t={t} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Annuler', 'Cancel', 'Cancelar')}</button>
          <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {busy ? t('Enregistrement…', 'Saving…', 'Guardando…') : t('Enregistrer', 'Save', 'Guardar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CheckGroup({ title, options, has, onToggle, t }) {
  return (
    <div>
      <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">{title}</div>
      <div className="border border-gray-200 rounded-lg p-2 max-h-52 overflow-y-auto">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer hover:bg-gray-50 rounded">
            <input type="checkbox" checked={has(o.key)} onChange={() => onToggle(o.key)} />
            <span className="text-gray-700">{t(...o.label)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
