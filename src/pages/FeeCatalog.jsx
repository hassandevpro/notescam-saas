// Catalogue de frais (obligatoires / optionnels) + liste de frais PAR ÉLÈVE +
// statistiques. Configurable par établissement. Compatible avec le système de
// paiements existant (réutilise schoolStore.addPayment, lié au frais).
import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import {
  fetchCatalog, upsertCatalogItem, deleteCatalogItem,
  fetchStudentFeeItems, upsertStudentFeeItem, deleteStudentFeeItem,
} from '../lib/feeCatalogService';
import {
  mandatoryItemsFor, optionalItemsFor, snapshotItem, itemBalance, paidForItem,
  balanceByCategory, studentTotals, revenueByFeeType,
} from '../lib/feeCatalogEngine';
import { FEE_CATEGORY_LABELS } from '../components/fees/feeCatalogUi';
import FeeCatalogItemModal from '../components/fees/FeeCatalogItemModal';
import { loadWithCache } from '../lib/offlineCache';
import { printTicket } from '../lib/receiptDoc';
import { classSectionKey } from '../core/engineResolver';
import { uuid } from '../lib/uuid';

const todayISO = () => new Date().toISOString().slice(0, 10);

// `embedded` : rendu comme onglet de la page Frais scolaires (sans le Layout
// global), au lieu d'une page autonome.
export default function FeeCatalog({ embedded = false }) {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const role = useAuthStore((s) => s.role);
  const schoolId = school?.id;
  const year = school?.current_year || '';
  const canManage = ['admin', 'censeur'].includes(role);

  const students = useSchoolStore((s) => s.students);
  const classes = useSchoolStore((s) => s.classes);
  const feePayments = useSchoolStore((s) => s.feePayments);
  const addPayment = useSchoolStore((s) => s.addPayment);
  const classById = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);

  const [view, setView] = useState('catalog');
  const [catalog, setCatalog] = useState([]);
  const [catModal, setCatModal] = useState(null);
  const [studentId, setStudentId] = useState(null);
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const catLabel = (c) => t(...(FEE_CATEGORY_LABELS[c] || [c]));

  const loadCatalog = useCallback(async () => {
    if (!schoolId) return;
    const { rows } = await loadWithCache(`nc_feecatalog_${schoolId}_${year}`, () => fetchCatalog(schoolId, { yearLabel: year }));
    setCatalog(rows);
  }, [schoolId, year]);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Contexte d'un élève (année / SECTION / classe) pour l'applicabilité des frais.
  // `level` porte la SECTION de la classe (maternelle/primaire/…) pour matcher le
  // champ « Section concernée » du catalogue.
  const ctxFor = useCallback((stu) => ({
    academicYear: year, level: classSectionKey(classById[stu?.class_id]), classId: stu?.class_id || null,
  }), [year, classById]);

  // Charge la liste d'un élève + ATTRIBUE AUTOMATIQUEMENT les frais obligatoires manquants.
  const loadStudent = useCallback(async (sid) => {
    if (!schoolId || !sid) { setItems([]); return; }
    let rows = await fetchStudentFeeItems(schoolId, { studentId: sid, yearLabel: year }) || [];
    const stu = students.find((s) => s.id === sid);
    const have = new Set(rows.map((r) => r.fee_catalog_id));
    const missing = mandatoryItemsFor(catalog, ctxFor(stu)).filter((m) => !have.has(m.id));
    if (missing.length) {
      for (const m of missing) {
        const saved = await upsertStudentFeeItem({ id: uuid(), ...snapshotItem(m, { studentId: sid, schoolId, academicYear: year }) });
        if (saved) rows.push(saved);
      }
    }
    setItems(rows);
  }, [schoolId, year, students, catalog, ctxFor]);
  useEffect(() => { if (view === 'students') loadStudent(studentId); }, [studentId, view, loadStudent]);

  // Toutes les listes de l'école (statistiques recettes par type).
  useEffect(() => {
    if (view === 'stats' && schoolId) fetchStudentFeeItems(schoolId, { yearLabel: year }).then((r) => setAllItems(r || []));
  }, [view, schoolId, year]);

  const selectedStudent = students.find((s) => s.id === studentId) || null;
  const activeItems = items.filter((i) => i.status !== 'removed');
  const totals = useMemo(() => studentTotals(items, feePayments), [items, feePayments]);
  const cats = useMemo(() => balanceByCategory(items, feePayments), [items, feePayments]);
  const optional = selectedStudent ? optionalItemsFor(catalog, ctxFor(selectedStudent)) : [];
  const revenue = useMemo(() => revenueByFeeType(allItems, feePayments), [allItems, feePayments]);

  // — Catalogue —
  const saveCat = async (row) => {
    const saved = await upsertCatalogItem({ ...row, school_id: schoolId });
    setCatModal(null);
    if (saved) await loadCatalog();
  };
  const removeCat = async (item) => {
    if (!window.confirm(t('Supprimer ce frais du catalogue ?', 'Delete this catalog fee?', '¿Eliminar del catálogo?'))) return;
    if (await deleteCatalogItem(item.id)) await loadCatalog();
  };

  // — Frais par élève —
  const toggleOptional = async (opt, checked) => {
    if (checked) {
      const saved = await upsertStudentFeeItem({ id: uuid(), ...snapshotItem(opt, { studentId, schoolId, academicYear: year }) });
      if (saved) setItems((xs) => [...xs, saved]);
    } else {
      const existing = items.find((i) => i.fee_catalog_id === opt.id && i.status !== 'removed');
      if (!existing) return;
      if (paidForItem(existing.id, feePayments) > 0) { window.alert(t('Frais déjà payé partiellement : impossible de le retirer.', 'Already partly paid: cannot remove.', 'Ya pagado parcialmente: no se puede quitar.')); return; }
      if (await deleteStudentFeeItem(existing.id)) setItems((xs) => xs.filter((i) => i.id !== existing.id));
    }
  };
  const editAmount = async (item) => {
    const v = window.prompt(t('Nouveau montant', 'New amount', 'Nuevo importe'), item.amount);
    if (v == null) return;
    const saved = await upsertStudentFeeItem({ ...item, amount: Number(v) || 0 });
    if (saved) setItems((xs) => xs.map((i) => i.id === item.id ? saved : i));
  };
  const pay = async (item) => {
    const b = itemBalance(item, feePayments);
    const v = window.prompt(`${item.name} — ${t('Montant à payer', 'Amount to pay', 'Importe a pagar')} (${t('solde', 'balance', 'saldo')} ${money(b.balance)})`, b.balance > 0 ? b.balance : '');
    if (v == null) return;
    const amount = Number(v) || 0;
    if (amount <= 0) return;
    const rec = await addPayment(studentId, { amount, date: todayISO(), note: item.name, student_fee_item_id: item.id });
    // Tout encaissement donne son ticket, quel que soit l'écran d'où il part.
    // Le totaux portés par le ticket sont ceux du CATALOGUE de l'élève (c'est le
    // périmètre de cet écran), pas la scolarité globale.
    if (rec && selectedStudent) {
      printTicket({
        school,
        student: selectedStudent,
        className: classById[selectedStudent.class_id]?.name || '',
        lang: school?.language,
        payment: rec,
        versement: amount,
        newTotal: totals.paid + amount,
        fraisAnnuels: totals.due,
        mode: 'libre',
        designation: item.name,
        date: rec.date,
        cashierName: rec.recorded_by_name || null,
      });
    }
  };

  // — Reçu détaillé (frais payés) —
  const printReceipt = () => {
    const paidRows = activeItems.map((i) => ({ ...i, ...itemBalance(i, feePayments) })).filter((r) => r.paid > 0);
    const rows = paidRows.map((r) => `<tr><td>${r.name}</td><td>${catLabel(r.category)}</td><td style="text-align:right">${money.amount(r.paid)}</td><td style="text-align:right">${money.amount(r.balance)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Reçu ${selectedStudent?.name || ''}</title></head><body style="font-family:sans-serif;padding:24px">
      <h2>${school?.name || ''}</h2><h3>${t('Reçu de frais', 'Fee receipt', 'Recibo de tasas')} — ${selectedStudent?.name || ''}</h3>
      <p>${t('Année', 'Year', 'Año')} : ${year} · ${todayISO()}</p>
      <table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
      <thead><tr><th>${t('Frais', 'Fee', 'Tasa')}</th><th>${t('Catégorie', 'Category', 'Categoría')}</th><th>${t('Payé', 'Paid', 'Pagado')}</th><th>${t('Reste', 'Balance', 'Saldo')}</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="text-align:right;margin-top:12px"><b>${t('Total payé', 'Total paid', 'Total pagado')} : ${money(totals.paid)}</b></p>
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)} className={`px-3 py-1.5 text-sm rounded-lg font-medium ${view === id ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{label}</button>
  );

  const Wrapper = embedded ? Fragment : Layout;
  return (
    <Wrapper>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('Catalogue des frais', 'Fee catalog', 'Catálogo de tasas')}</h1>
            <p className="text-sm text-gray-500 mt-1">{year || '—'}</p>
          </div>
          <div className="flex gap-1">
            <Tab id="catalog" label={t('Catalogue', 'Catalog', 'Catálogo')} />
            <Tab id="students" label={t('Frais par élève', 'Per student', 'Por alumno')} />
            <Tab id="stats" label={t('Statistiques', 'Statistics', 'Estadísticas')} />
          </div>
        </div>

        {/* CATALOGUE */}
        {view === 'catalog' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 flex justify-end border-b border-gray-100">
              {canManage && <button onClick={() => setCatModal({ item: null })} className="text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg">+ {t('Frais', 'Fee', 'Tasa')}</button>}
            </div>
            {catalog.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">{t('Catalogue vide.', 'Empty catalog.', 'Catálogo vacío.')}</p> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                  <th className="text-left px-4 py-2">{t('Nom', 'Name', 'Nombre')}</th>
                  <th className="text-left px-4 py-2">{t('Catégorie', 'Category', 'Categoría')}</th>
                  <th className="text-right px-4 py-2">{t('Montant', 'Amount', 'Importe')}</th>
                  <th className="text-left px-4 py-2">{t('Type', 'Type', 'Tipo')}</th>
                  <th className="text-left px-4 py-2">{t('Portée', 'Scope', 'Alcance')}</th>
                  <th className="px-4 py-2" /></tr></thead>
                <tbody>{catalog.map((c) => (
                  <tr key={c.id} className={`border-t border-gray-100 ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-2">{catLabel(c.category)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(c.amount)}</td>
                    <td className="px-4 py-2">
                      {c.mandatory ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">{t('Obligatoire', 'Mandatory', 'Obligatorio')}</span>
                        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{t('Optionnel', 'Optional', 'Opcional')}</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{c.class_id ? (classById[c.class_id]?.name || '—') : c.level || t('École', 'School', 'Escuela')}</td>
                    <td className="px-4 py-2 text-right">{canManage && (<span className="flex justify-end gap-2">
                      <button onClick={() => setCatModal({ item: c })} className="text-xs text-gray-400 hover:text-gray-700">✎</button>
                      <button onClick={() => removeCat(c)} className="text-xs text-rose-400 hover:text-rose-600">✕</button></span>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {/* FRAIS PAR ÉLÈVE */}
        {view === 'students' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2" value={studentId || ''} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{t('— choisir un élève —', '— select a student —', '— elegir alumno —')}</option>
                {[...students].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{classById[s.class_id] ? ` · ${classById[s.class_id].name}` : ''}</option>
                ))}
              </select>
              {selectedStudent && (
                <div className="bg-white rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">{t('Total dû', 'Total due', 'Total')}</span><b>{money(totals.due)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('Payé', 'Paid', 'Pagado')}</span><b className="text-emerald-700">{money(totals.paid)}</b></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('Solde', 'Balance', 'Saldo')}</span><b className="text-rose-600">{money(totals.balance)}</b></div>
                  <button onClick={printReceipt} className="mt-2 w-full text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50">{t('Reçu détaillé', 'Detailed receipt', 'Recibo detallado')}</button>
                </div>
              )}
              {cats.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-3 mt-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">{t('Solde par catégorie', 'Balance by category', 'Saldo por categoría')}</h4>
                  {cats.map((c) => (
                    <div key={c.category} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-600">{catLabel(c.category)}</span>
                      <span className={c.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(c.balance)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2">
              {!selectedStudent ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">{t('Sélectionnez un élève.', 'Select a student.', 'Seleccione un alumno.')}</div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                    <div className="px-4 py-2 text-xs font-bold text-gray-500 border-b border-gray-100">{t('Frais attribués', 'Assigned fees', 'Tasas asignadas')}</div>
                    <table className="w-full text-sm">
                      <tbody>{activeItems.map((i) => {
                        const b = itemBalance(i, feePayments);
                        return (
                          <tr key={i.id} className="border-t border-gray-100">
                            <td className="px-4 py-2">
                              <div className="font-medium text-gray-800">{i.name}
                                {i.mandatory ? <span className="ml-2 text-[10px] text-rose-600">({t('obligatoire', 'mandatory', 'obligatorio')})</span> : null}</div>
                              <div className="text-xs text-gray-400">{catLabel(i.category)}</div>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-700">{money(i.amount)}
                              {canManage && <button onClick={() => editAmount(i)} className="ml-1 text-xs text-gray-300 hover:text-gray-600">✎</button>}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{money(b.paid)}</td>
                            <td className={`px-4 py-2 text-right tabular-nums ${b.balance > 0 ? 'text-rose-600' : 'text-gray-400'}`}>{money(b.balance)}</td>
                            <td className="px-4 py-2 text-right">{canManage && b.balance > 0 && <button onClick={() => pay(i)} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded">{t('Payer', 'Pay', 'Pagar')}</button>}</td>
                          </tr>
                        );
                      })}
                      {activeItems.length === 0 && <tr><td className="px-4 py-6 text-center text-sm text-gray-400" colSpan={5}>{t('Aucun frais.', 'No fee.', 'Sin tasas.')}</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  {optional.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">{t('Frais optionnels', 'Optional fees', 'Tasas opcionales')}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {optional.map((o) => {
                          const checked = items.some((i) => i.fee_catalog_id === o.id && i.status !== 'removed');
                          return (
                            <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2">
                              <input type="checkbox" checked={checked} disabled={!canManage} onChange={(e) => toggleOptional(o, e.target.checked)} className="w-4 h-4" />
                              <span className="flex-1">{o.name}</span>
                              <span className="text-xs text-gray-400">{money(o.amount)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* STATISTIQUES */}
        {view === 'stats' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">{t('Recettes par type de frais', 'Revenue by fee type', 'Ingresos por tipo')}</h3>
            {revenue.length === 0 ? <p className="text-sm text-gray-400">{t('Aucune recette typée.', 'No typed revenue.', 'Sin ingresos.')}</p> : (
              <div className="space-y-2">
                {(() => { const max = revenue[0]?.collected || 1; return revenue.map((r) => (
                  <div key={r.category}>
                    <div className="flex justify-between text-xs text-gray-600 mb-0.5"><span>{catLabel(r.category)}</span><span className="tabular-nums">{money(r.collected)}</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round((r.collected / max) * 100)}%` }} /></div>
                  </div>
                )); })()}
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-100 mt-2"><span>{t('Total', 'Total', 'Total')}</span><span>{money(revenue.reduce((s, r) => s + r.collected, 0))}</span></div>
              </div>
            )}
          </div>
        )}
      </div>

      {catModal && <FeeCatalogItemModal item={catModal.item} classes={classes} academicYear={year} onSave={saveCat} onClose={() => setCatModal(null)} />}
    </Wrapper>
  );
}
