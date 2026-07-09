// Module RESSOURCES HUMAINES. Réutilise le DOSSIER PERSONNEL existant (staff /
// module Personnel) et lui adjoint : contrats, congés, évaluations, présences,
// historique professionnel. PAS de paie.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { HR_ENTITIES } from '../lib/hrService';
import {
  currentContract, isContractActive, leaveBalance, attendanceSummary, evaluationAverage,
} from '../lib/hrEngine';
import { HR_TABS, HR_TAB_BY_KEY, OPTION_LABELS } from '../components/hr/hrEntities';
import HrRecordModal from '../components/hr/HrRecordModal';

const EMPTY = { contracts: [], leaves: [], evaluations: [], attendance: [], career: [] };

export default function HR() {
  const t = useT();
  const money = useMoney();
  const staff = useSchoolStore((s) => s.staff);
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const schoolId = school?.id;
  const canManage = role === 'admin';
  const year = String(school?.current_year || '').slice(0, 4);

  const [query, setQuery] = useState('');
  const [staffId, setStaffId] = useState(null);
  const [tabKey, setTabKey] = useState('contracts');
  const [data, setData] = useState(EMPTY);
  const [modal, setModal] = useState(null); // { record } | { record:null }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [...staff].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return q ? rows.filter((s) => String(s.name || '').toLowerCase().includes(q)) : rows;
  }, [staff, query]);

  useEffect(() => { if (!staffId && list.length) setStaffId(list[0].id); }, [list, staffId]);

  const selected = staff.find((s) => s.id === staffId) || null;

  const load = useCallback(async (sid) => {
    if (!schoolId || !sid) { setData(EMPTY); return; }
    const keys = Object.keys(HR_ENTITIES);
    const results = await Promise.all(keys.map((k) => HR_ENTITIES[k].fetch(schoolId, sid)));
    const next = {};
    keys.forEach((k, i) => { next[k] = results[i] || []; });
    setData(next);
  }, [schoolId]);

  useEffect(() => { load(staffId); }, [staffId, load]);

  // Synthèse du dossier (moteur).
  const summary = useMemo(() => {
    const contract = currentContract(data.contracts);
    return {
      contract,
      active: contract ? isContractActive(contract) : false,
      leave: leaveBalance(30, data.leaves, year, 'annuel'),
      att: attendanceSummary(data.attendance),
      evalAvg: evaluationAverage(data.evaluations),
    };
  }, [data, year]);

  const tab = HR_TAB_BY_KEY[tabKey];
  const rows = data[tabKey] || [];

  const saveRecord = async (rec) => {
    const saved = await HR_ENTITIES[tabKey].upsert({
      ...rec, school_id: schoolId, staff_id: staffId,
    });
    setModal(null);
    if (saved) await load(staffId);
  };
  const removeRecord = async (rec) => {
    if (!window.confirm(t('Supprimer cet enregistrement ?', 'Delete this record?', '¿Eliminar este registro?'))) return;
    if (await HR_ENTITIES[tabKey].remove(rec.id)) await load(staffId);
  };

  const cell = (f, r) => {
    const v = r[f];
    if (v == null || v === '') return '—';
    if (OPTION_LABELS[v]) return t(...OPTION_LABELS[v]);
    return String(v);
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">{t('Ressources Humaines', 'Human Resources', 'Recursos Humanos')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('Dossiers du personnel — contrats, congés, évaluations, présences, carrière.',
            'Staff files — contracts, leaves, evaluations, attendance, career.',
            'Expedientes — contratos, permisos, evaluaciones, asistencia, carrera.')}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Liste du personnel */}
          <div className="lg:col-span-1">
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
              placeholder={t('Rechercher…', 'Search…', 'Buscar…')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {list.map((s) => (
                <button key={s.id} onClick={() => setStaffId(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    s.id === staffId ? 'bg-indigo-50 border border-indigo-300' : 'hover:bg-gray-50 border border-transparent'}`}>
                  <div className="font-medium text-gray-800 truncate">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.fonction || s.department || ''}</div>
                </button>
              ))}
              {list.length === 0 && <p className="text-xs text-gray-400 py-4 text-center">{t('Aucun personnel.', 'No staff.', 'Sin personal.')}</p>}
            </div>
          </div>

          {/* Dossier */}
          <div className="lg:col-span-3">
            {!selected ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
                {t('Sélectionnez un membre du personnel.', 'Select a staff member.', 'Seleccione un miembro del personal.')}
              </div>
            ) : (
              <>
                {/* Synthèse */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-gray-900">{selected.name}</h2>
                      <p className="text-xs text-gray-500">{selected.fonction || ''}{selected.department ? ` · ${selected.department}` : ''}</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${summary.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {summary.active ? t('Contrat actif', 'Active contract', 'Contrato activo') : t('Sans contrat actif', 'No active contract', 'Sin contrato activo')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-center">
                    <Stat label={t('Contrat', 'Contract', 'Contrato')} value={summary.contract ? (OPTION_LABELS[summary.contract.type] ? t(...OPTION_LABELS[summary.contract.type]) : summary.contract.type) : '—'} />
                    <Stat label={t('Congés restants', 'Leave balance', 'Saldo permisos')} value={`${summary.leave.remaining} ${t('j', 'd', 'd')}`} />
                    <Stat label={t('Taux de présence', 'Presence rate', 'Asistencia')} value={summary.att.total ? `${summary.att.presenceRate}%` : '—'} />
                    <Stat label={t('Note moyenne', 'Avg. score', 'Nota media')} value={summary.evalAvg == null ? '—' : `${summary.evalAvg}/20`} />
                  </div>
                </div>

                {/* Onglets */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {HR_TABS.map((tb) => (
                    <button key={tb.key} onClick={() => setTabKey(tb.key)}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                        tb.key === tabKey ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {t(...tb.label)}
                    </button>
                  ))}
                </div>

                {/* Tableau générique de l'onglet */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 flex justify-end border-b border-gray-100">
                    {canManage && (
                      <button onClick={() => setModal({ record: null })}
                        className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">
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
                          {tab.columns.map((c) => {
                            const f = tab.fields.find((x) => x.key === c);
                            return <th key={c} className="text-left px-4 py-2 font-semibold">{f ? t(...f.label) : c}</th>;
                          })}
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                            {tab.columns.map((c) => (
                              <td key={c} className="px-4 py-2 text-gray-700">
                                {c === 'salary' ? (r.salary != null ? money(r.salary) : '—') : cell(c, r)}
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right">
                              {canManage && (
                                <span className="flex items-center justify-end gap-2">
                                  <button onClick={() => setModal({ record: r })} className="text-xs text-gray-400 hover:text-gray-700">✎</button>
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
              </>
            )}
          </div>
        </div>
      </div>

      {modal && selected && (
        <HrRecordModal tab={tab} record={modal.record} onSave={saveRecord} onClose={() => setModal(null)} />
      )}
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-base font-bold text-gray-800">{value}</div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}
