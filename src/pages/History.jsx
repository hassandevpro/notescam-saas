// Page Historique : corbeille, journal d'audit, sauvegarde / restauration.
// Toute la logique passe par historyService — pas d'accès direct à l'IDB ici.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import HubTabs from '../components/hubs/HubTabs';
import { useT } from '../lib/i18n';
import { useAuthStore } from '../store/authStore';
import { hasCapability, isAdvancedDelegation } from '../config/capabilities';
import { useUiStore } from '../store/uiStore';
import { useSchoolStore } from '../store/schoolStore';
import {
  listTrash, purgeTrashItem, restoreFromTrash,
  listAudit, describeAction, TRASH_LABELS,
} from '../lib/historyService';

function formatDate(ts, lang) {
  const d = new Date(ts);
  const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'fr-FR';
  return d.toLocaleString(locale);
}

export default function History() {
  const t        = useT();
  const navigate = useNavigate();
  const lang     = useUiStore((s) => s.uiLang);
  const role     = useAuthStore((s) => s.role);
  const schoolId = useAuthStore((s) => s.school?.id);
  const permissions   = useAuthStore((s) => s.permissions);
  // Traçabilité ouverte à tous : réglage PAR ÉCOLE. Ailleurs, la page reste
  // administrative — sauf pour un compte à qui l'admin a confié la page.
  const auditOpenToAll = isAdvancedDelegation(useAuthStore((s) => s.school));
  const store    = useSchoolStore.getState();

  const [trash, setTrash]   = useState([]);
  const [audit, setAudit]   = useState([]);
  const [loading, setLoad]  = useState(false);
  const [msg, setMsg]       = useState(null);

  const refresh = useCallback(async () => {
    setLoad(true);
    try {
      const [tr, ad] = await Promise.all([
        listTrash({ schoolId }),
        listAudit({ schoolId }),
      ]);
      setTrash(tr);
      setAudit(ad);
    } finally { setLoad(false); }
  }, [schoolId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRestore = async (item) => {
    try {
      await restoreFromTrash(item, store);
      setMsg({ type: 'ok', text: t('Élément restauré.', 'Item restored.', 'Elemento restaurado.') });
      refresh();
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    }
  };

  const handlePurge = async (item) => {
    if (!window.confirm(t('Supprimer définitivement ?', 'Permanently delete?', '¿Eliminar definitivamente?'))) return;
    await purgeTrashItem(item.id);
    refresh();
  };

  if (!auditOpenToAll && role !== 'admin' && !hasCapability(permissions, '/app/historique')) {
    return (
      <Layout>
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
          <p className="text-gray-500 text-sm">{t('Accès réservé aux administrateurs.', 'Admin only.', 'Solo administradores.')}</p>
        </div>
      </Layout>
    );
  }

  const labels = TRASH_LABELS[lang] || TRASH_LABELS.fr;

  // Le JOURNAL est ouvert à tous les rôles : chacun peut vérifier qui a fait quoi.
  // Restaurer une donnée supprimée et exporter une copie complète de l'école
  // restent des gestes d'administration → onglets réservés à l'admin.
  const tabs = [
    {
      id: 'journal',
      label: t('Journal', 'Audit log', 'Registro'),
      render: renderAudit,
    },
    ...(role === 'admin' ? [
      {
        id: 'corbeille',
        label: (
          <span className="flex items-center gap-1.5">
            {t('Corbeille', 'Trash', 'Papelera')}
            {trash.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded-full">{trash.length}</span>}
          </span>
        ),
        render: renderTrash,
      },
      {
        id: 'sauvegarde',
        label: t('Sauvegardes', 'Backups', 'Copias'),
        render: renderBackup,
      },
    ] : []),
  ];

  return (
    <Layout>
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}
      <HubTabs
        title={t('Audit & Sauvegardes', 'Audit & Backups', 'Auditoría y copias')}
        subtitle={t(
          'Traçabilité (qui, quand, quoi), corbeille et copies complètes de votre école.',
          'Traceability (who, when, what), trash and full backups of your school data.',
          'Trazabilidad, papelera y copias completas de los datos.'
        )}
        tabs={tabs}
        storageKey="nc_history_tab"
      />
    </Layout>
  );

  function renderTrash() {
    if (loading) return <div className="text-sm text-gray-400 animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>;
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {trash.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {t('La corbeille est vide.', 'Trash is empty.', 'La papelera está vacía.')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                  <th className="text-left px-4 py-2">{t('Type', 'Type', 'Tipo')}</th>
                  <th className="text-left px-4 py-2">{t('Nom', 'Name', 'Nombre')}</th>
                  <th className="text-left px-4 py-2">{t('Supprimé par', 'Deleted by', 'Eliminado por')}</th>
                  <th className="text-left px-4 py-2">{t('Date', 'Date', 'Fecha')}</th>
                  <th className="text-right px-4 py-2">{t('Actions', 'Actions', 'Acciones')}</th>
                </tr>
              </thead>
              <tbody>
                {trash.map((it) => (
                  <tr key={it.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                        {labels[it.table] || it.table}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{it.payload?.name || it.payload?.matricule || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{it.deleted_by_name || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(it.deleted_at, lang)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleRestore(it)} className="text-sm text-emerald-600 hover:text-emerald-800 font-semibold mr-3">
                        {t('Restaurer', 'Restore', 'Restaurar')}
                      </button>
                      <button onClick={() => handlePurge(it)} className="text-sm text-red-500 hover:text-red-700">
                        {t('Supprimer', 'Delete', 'Eliminar')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    );
  }

  function renderAudit() {
    if (loading) return <div className="text-sm text-gray-400 animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>;
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {audit.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              {t('Aucune activité enregistrée.', 'No activity yet.', 'Sin actividad registrada.')}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wider">
                  <th className="text-left px-4 py-2">{t('Action', 'Action', 'Acción')}</th>
                  <th className="text-left px-4 py-2">{t('Cible', 'Target', 'Objeto')}</th>
                  <th className="text-left px-4 py-2">{t('Utilisateur', 'User', 'Usuario')}</th>
                  <th className="text-left px-4 py-2">{t('Date', 'Date', 'Fecha')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((it) => (
                  <tr key={it.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{describeAction(it, lang)}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {(labels[it.table] || it.table)}
                      {it.details?.name ? <span className="text-gray-400"> — {it.details.name}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{it.user_name || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(it.at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    );
  }

  // ── Renvoi vers l'UNIQUE système de sauvegarde ────────────────────────────
  //
  // CE QUI VIVAIT ICI, ET POURQUOI ON L'A RETIRÉ. Cet onglet proposait
  // « Exporter une sauvegarde complète » et annonçait « toutes vos données
  // locales ». L'export énumérait en réalité NEUF magasins, écrits à la main,
  // sur les VINGT-NEUF que la base locale compte. Ne partaient jamais, entre
  // autres : `apc_notes` (toutes les notes du premier cycle), `prim_notes`
  // (tout le primaire APC), `mat_obs`, `staff`, `class_fee_grids`,
  // `academic_periods`, `school_units`, `signalements`. Une école qui exportait,
  // reformatait son poste et restaurait retrouvait ses élèves — sans une seule
  // note. Silencieusement. À la restauration, l'asymétrie doublait la perte :
  // l'export écrivait `trash` et `audit_log`, l'import ne les relisait pas.
  //
  // Paramètres → Sauvegarde & restauration fait désormais le travail, et le
  // fait autrement : les tables sont DÉCOUVERTES dans le schéma réel (toute
  // table portant `school_id`), en cloud comme en LAN. Un module ajouté demain
  // y entre d'office — c'est précisément ce qu'une liste tenue à la main ne
  // sait pas faire, et c'est pourquoi vingt magasins étaient restés dehors.
  //
  // On ne RÉPARE pas cet écran, on le retire : deux systèmes de sauvegarde aux
  // couvertures différentes, c'est la garantie qu'une école restaurera un jour
  // le mauvais. L'onglet survit en PANNEAU DE RENVOI plutôt qu'en page
  // disparue : qui cherche ses sauvegardes ici doit être conduit au bon endroit,
  // pas accueilli par une absence.
  function renderBackup() {
    const ouvrirSauvegardes = () => {
      // HubTabs retient l'onglet actif dans localStorage : on l'y pose avant de
      // naviguer, pour atterrir directement sur le bon onglet des Paramètres.
      try { localStorage.setItem('nc_settings_tab', 'backup'); } catch { /* sans effet */ }
      navigate('/app/settings');
    };
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-1">
          {t('Les sauvegardes ont déménagé', 'Backups have moved', 'Las copias se han movido')}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {t(
            'Sauvegarde automatique, export complet et restauration sont désormais dans Paramètres → Sauvegarde & restauration. Cette page couvrait moins d’un tiers de vos données : elle a été retirée pour qu’il n’existe qu’un seul endroit, et qu’il soit complet.',
            'Automatic backup, full export and restore now live in Settings → Backup & restore. This page covered less than a third of your data: it was removed so that there is a single place, and it is complete.',
            'La copia automática, la exportación completa y la restauración están ahora en Ajustes → Copias y restauración. Esta página cubría menos de un tercio de los datos.'
          )}
        </p>
        {role === 'admin' ? (
          <button onClick={ouvrirSauvegardes} className="btn-primary !w-auto px-5">
            {t('Ouvrir Sauvegarde & restauration', 'Open Backup & restore', 'Abrir Copias y restauración')}
          </button>
        ) : (
          <p className="text-xs text-gray-400">
            {t('Accès réservé aux administrateurs.', 'Admin only.', 'Solo administradores.')}
          </p>
        )}
      </div>
    );
  }
}
