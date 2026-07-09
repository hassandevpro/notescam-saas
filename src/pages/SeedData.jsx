// Module « Seed Data » — RÉSERVÉ AU MODE DÉVELOPPEMENT.
// Génère des données fictives mais cohérentes (3 scénarios) et permet de les
// supprimer sans jamais toucher les données réelles (suppression par registre).
// Totalement désactivé en production (import.meta.env.DEV).
import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useT } from '../lib/i18n';
import { SCENARIOS } from '../lib/seed/seedData';
import { generateSeed } from '../lib/seed/seedEngine';
import { writeSeed, deleteAllDemo, demoCount } from '../lib/seed/seedService';

const IS_DEV = (() => { try { return !!import.meta.env?.DEV; } catch { return false; } })();

export default function SeedData() {
  const t = useT();
  const [scenario, setScenario] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [count, setCount] = useState(demoCount());

  // Aperçu de volumétrie (généré à sec, sans écriture).
  const preview = useMemo(() => generateSeed(scenario, { seed: 1 }).stats, [scenario]);

  if (!IS_DEV) {
    return <Layout><div className="max-w-xl mx-auto py-20 text-center text-gray-500">
      {t('Module réservé au mode Développement.', 'Development mode only.', 'Solo en modo desarrollo.')}
    </div></Layout>;
  }

  const addLog = (line) => setLog((l) => [...l, line]);

  const create = async () => {
    if (busy) return;
    setBusy(true); setLog([]);
    try {
      const dataset = generateSeed(scenario, { seed: Date.now() & 0xffff });
      addLog(t('Génération…', 'Generating…', 'Generando…'));
      await writeSeed(dataset, (table, ok, total) => addLog(`${table}: ${ok}/${total}`));
      addLog('✅ ' + t('Données de démonstration créées.', 'Demo data created.', 'Datos de demostración creados.'));
    } catch (e) { addLog('❌ ' + (e?.message || String(e))); }
    setCount(demoCount()); setBusy(false);
  };

  const wipe = async () => {
    if (busy) return;
    if (!window.confirm(t('Supprimer TOUTES les données de démonstration ? (les données réelles ne sont pas affectées)', 'Delete ALL demo data? (real data is not affected)', '¿Eliminar TODOS los datos de demostración?'))) return;
    setBusy(true); setLog([]);
    try {
      const n = await deleteAllDemo((table, total) => addLog(`${table}: −${total}`));
      addLog('✅ ' + `${n} ` + t('enregistrements de démo supprimés.', 'demo records deleted.', 'registros eliminados.'));
    } catch (e) { addLog('❌ ' + (e?.message || String(e))); }
    setCount(demoCount()); setBusy(false);
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{t('Données de démonstration', 'Seed Data', 'Datos de demostración')}</h1>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">DEV</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {t('Génère des données fictives cohérentes pour tester l’application.', 'Generates coherent fake data to test the app.', 'Genera datos ficticios coherentes.')}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-xs font-semibold text-gray-500 mb-1">{t('Scénario', 'Scenario', 'Escenario')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {Object.entries(SCENARIOS).map(([k, s]) => (
              <button key={k} onClick={() => setScenario(k)} disabled={busy}
                className={`text-left p-3 rounded-xl border transition-colors ${scenario === k ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="font-semibold text-sm text-gray-800">{t(...s.label)}</div>
                <div className="text-xs text-gray-400">{s.units.length} {t('unité(s)', 'unit(s)', 'unidad(es)')}</div>
              </button>
            ))}
          </div>

          {/* Aperçu volumétrie */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
            {Object.entries(preview).map(([tb, n]) => (
              <div key={tb} className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                <div className="text-sm font-bold text-gray-800">{n}</div>
                <div className="text-[10px] text-gray-400 truncate">{tb}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={create} disabled={busy}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {busy ? t('En cours…', 'Working…', 'Procesando…') : t('Créer des données de démonstration', 'Create demo data', 'Crear datos de demostración')}
            </button>
            <button onClick={wipe} disabled={busy || count === 0}
              className="px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 disabled:opacity-50">
              {t('Supprimer toutes les données de démonstration', 'Delete all demo data', 'Eliminar todos los datos')}
              {count > 0 ? ` (${count})` : ''}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {t('La suppression n’affecte jamais les données réelles (registre des id créés).',
               'Deletion never affects real data (registry of created ids).',
               'La eliminación nunca afecta los datos reales.')}
          </p>
        </div>

        {log.length > 0 && (
          <div className="bg-gray-900 text-gray-100 rounded-xl p-4 mt-4 text-xs font-mono max-h-72 overflow-y-auto">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </Layout>
  );
}
