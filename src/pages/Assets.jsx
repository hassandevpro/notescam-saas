// Module IMMOBILISATIONS (patrimoine). Registre des actifs (véhicules, bâtiments,
// ordinateurs, imprimantes, groupes électrogènes, mobilier) + journaux : pannes,
// réparations, dépenses. Réutilise le modal générique HrRecordModal.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchAssets, upsertAsset, deleteAsset, ASSET_ENTITIES } from '../lib/assetService';
import { assetSummary, fleetStats, ASSET_CATEGORIES } from '../lib/assetEngine';
import { ASSET_FORM, ASSET_TABS, ASSET_TAB_BY_KEY, CATEGORY_LABELS, STATUS_LABELS, OPTION_LABELS } from '../components/assets/assetEntities';
import HrRecordModal from '../components/hr/HrRecordModal';

const EMPTY = { breakdowns: [], repairs: [], expenses: [] };

export default function Assets() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const schoolId = school?.id;
  const canManage = role === 'admin';

  const [assets, setAssets] = useState([]);
  const [cat, setCat] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [journals, setJournals] = useState(EMPTY);
  const [tabKey, setTabKey] = useState('breakdowns');
  const [loading, setLoading] = useState(true);
  const [assetModal, setAssetModal] = useState(null);   // { record }
  const [recordModal, setRecordModal] = useState(null); // { record }

  const loadAssets = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const rows = await fetchAssets(schoolId) || [];
    setAssets(rows);
    setSelectedId((cur) => cur && rows.some((a) => a.id === cur) ? cur : (rows[0]?.id || null));
    setLoading(false);
  }, [schoolId]);
  useEffect(() => { loadAssets(); }, [loadAssets]);

  const selected = assets.find((a) => a.id === selectedId) || null;

  const loadJournals = useCallback(async (id) => {
    if (!schoolId || !id) { setJournals(EMPTY); return; }
    const keys = Object.keys(ASSET_ENTITIES);
    const res = await Promise.all(keys.map((k) => ASSET_ENTITIES[k].fetch(schoolId, id)));
    const next = {}; keys.forEach((k, i) => { next[k] = res[i] || []; });
    setJournals(next);
  }, [schoolId]);
  useEffect(() => { loadJournals(selectedId); }, [selectedId, loadJournals]);

  const list = useMemo(() => (cat === 'all' ? assets : assets.filter((a) => a.category === cat)), [assets, cat]);
  const fleet = useMemo(() => fleetStats(assets), [assets]);
  const summary = useMemo(() => selected ? assetSummary(selected, journals.breakdowns, journals.repairs, journals.expenses) : null, [selected, journals]);
  const tab = ASSET_TAB_BY_KEY[tabKey];
  const rows = journals[tabKey] || [];

  const saveAsset = async (rec) => {
    const saved = await upsertAsset({ ...rec, school_id: schoolId });
    setAssetModal(null);
    if (saved) { await loadAssets(); setSelectedId(saved.id); }
  };
  const removeAsset = async () => {
    if (!window.confirm(t('Supprimer cette immobilisation et ses journaux ?', 'Delete this asset and its logs?', '¿Eliminar este activo y sus registros?'))) return;
    if (await deleteAsset(selected.id)) { setSelectedId(null); await loadAssets(); }
  };
  const saveRecord = async (rec) => {
    const saved = await ASSET_ENTITIES[tabKey].upsert({ ...rec, school_id: schoolId, asset_id: selectedId });
    setRecordModal(null);
    if (saved) await loadJournals(selectedId);
  };
  const removeRecord = async (rec) => {
    if (!window.confirm(t('Supprimer cet enregistrement ?', 'Delete this record?', '¿Eliminar este registro?'))) return;
    if (await ASSET_ENTITIES[tabKey].remove(rec.id)) await loadJournals(selectedId);
  };

  const cell = (f, r) => {
    if (f === 'cost' || f === 'amount') return r[f] != null ? money(r[f]) : '—';
    const v = r[f];
    if (v == null || v === '') return '—';
    return OPTION_LABELS[v] ? t(...OPTION_LABELS[v]) : String(v);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Immobilisations', 'Fixed assets', 'Inmovilizado')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {fleet.count} {t('actifs', 'assets', 'activos')} · {money(fleet.value)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">{t('Toutes catégories', 'All categories', 'Todas')}</option>
              {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{t(...CATEGORY_LABELS[c])}</option>)}
            </select>
            {canManage && (
              <button className="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                onClick={() => setAssetModal({ record: null })}>+ {t('Immobilisation', 'Asset', 'Activo')}</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm py-16 text-center animate-pulse">{t('Chargement…', 'Loading…', 'Cargando…')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Liste */}
            <div className="space-y-2">
              {list.length === 0 && <p className="text-xs text-gray-400 py-6 text-center">{t('Aucune immobilisation.', 'No asset.', 'Sin activos.')}</p>}
              {list.map((a) => (
                <button key={a.id} onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${a.id === selectedId ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-gray-900 truncate">{a.name}</span>
                    <span className="text-[10px] text-gray-400">{a.asset_number || ''}</span>
                  </div>
                  <div className="text-xs text-gray-500">{t(...(CATEGORY_LABELS[a.category] || [a.category]))} · {t(...(STATUS_LABELS[a.status] || [a.status]))}</div>
                </button>
              ))}
            </div>

            {/* Détail */}
            <div className="lg:col-span-2">
              {selected && summary && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-bold text-gray-900">{selected.name}</h2>
                      <p className="text-xs text-gray-500">
                        {t(...(CATEGORY_LABELS[selected.category] || [selected.category]))}
                        {selected.asset_number ? ` · ${selected.asset_number}` : ''}
                        {selected.location ? ` · ${selected.location}` : ''}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-2">
                        <button onClick={() => setAssetModal({ record: selected })} className="text-xs text-gray-500 hover:text-gray-800">{t('Modifier', 'Edit', 'Editar')}</button>
                        <button onClick={removeAsset} className="text-xs text-rose-500 hover:text-rose-700">{t('Supprimer', 'Delete', 'Eliminar')}</button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-center">
                    <Stat label={t('Valeur', 'Value', 'Valor')} value={money(summary.value)} />
                    <Stat label={t('Pannes ouvertes', 'Open faults', 'Averías abiertas')} value={summary.open} tone={summary.open ? 'text-rose-600' : 'text-gray-800'} />
                    <Stat label={t('Coût entretien', 'Maintenance cost', 'Coste mant.')} value={money(summary.maintenanceCost)} tone="text-amber-600" />
                    <Stat label={t('Coût total', 'Total cost', 'Coste total')} value={money(summary.tco)} />
                  </div>

                  {/* Onglets journaux */}
                  <div className="flex flex-wrap gap-1 mt-4 mb-3">
                    {ASSET_TABS.map((tb) => (
                      <button key={tb.key} onClick={() => setTabKey(tb.key)}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${tb.key === tabKey ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {t(...tb.label)}
                      </button>
                    ))}
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 flex justify-end border-b border-gray-100">
                      {canManage && (
                        <button onClick={() => setRecordModal({ record: null })} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">
                          + {t('Ajouter', 'Add', 'Añadir')}
                        </button>
                      )}
                    </div>
                    {rows.length === 0 ? (
                      <p className="text-sm text-gray-400 py-8 text-center">{t('Aucun enregistrement.', 'No record.', 'Sin registros.')}</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr>
                            {tab.columns.map((c) => { const f = tab.fields.find((x) => x.key === c); return <th key={c} className="text-left px-4 py-2 font-semibold">{f ? t(...f.label) : c}</th>; })}
                            <th className="px-4 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                              {tab.columns.map((c) => <td key={c} className="px-4 py-2 text-gray-700">{cell(c, r)}</td>)}
                              <td className="px-4 py-2 text-right">
                                {canManage && (
                                  <span className="flex items-center justify-end gap-2">
                                    <button onClick={() => setRecordModal({ record: r })} className="text-xs text-gray-400 hover:text-gray-700">✎</button>
                                    <button onClick={() => removeRecord(r)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {assetModal && <HrRecordModal tab={ASSET_FORM} record={assetModal.record} onSave={saveAsset} onClose={() => setAssetModal(null)} />}
      {recordModal && selected && <HrRecordModal tab={tab} record={recordModal.record} onSave={saveRecord} onClose={() => setRecordModal(null)} />}
    </Layout>
  );
}

function Stat({ label, value, tone = 'text-gray-800' }) {
  return (
    <div>
      <div className={`text-base font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}
