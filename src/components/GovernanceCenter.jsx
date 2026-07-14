// Centre de gouvernance (Personnel → onglet « Gouvernance »). Deux vues :
//   • Attributions : donner des rôles aux comptes (GovernanceRolesManager) ;
//   • Catalogue    : définir les rôles et leurs droits (GovernanceCatalogManager).
import { useState } from 'react';
import { useT } from '../lib/i18n';
import GovernanceRolesManager from './GovernanceRolesManager';
import GovernanceCatalogManager from './GovernanceCatalogManager';

export default function GovernanceCenter() {
  const t = useT();
  const [view, setView] = useState('assign');
  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)}
      className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
        view === id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Tab id="assign" label={t('Attributions', 'Assignments', 'Asignaciones')} />
        <Tab id="catalog" label={t('Catalogue des rôles', 'Role catalog', 'Catálogo de roles')} />
      </div>
      {view === 'assign' ? <GovernanceRolesManager /> : <GovernanceCatalogManager />}
    </div>
  );
}
