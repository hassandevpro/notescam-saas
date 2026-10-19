// JOURNAL DE CAISSE — une caisse, un mois, un solde.
//
// Pourquoi cet écran existe. /app/depenses répond à « où en est la LIGNE
// budgétaire ? » : il part d'une ligne active du budget de l'année en cours, et
// une dépense sans ligne (ou hors de cette année) n'y apparaît pas. Ce n'est pas
// un défaut — c'est l'exécution budgétaire. Mais une école tient aussi un
// cahier de caisse, qui répond à une autre question : « qu'est-il entré, qu'est-il
// sorti, et combien reste-t-il dans le tiroir ? »
//
// Cet écran-là lit donc les DEUX tables (`cash_movements` + `budget_expenses`),
// par caisse et par mois, et confronte le solde recalculé à celui inscrit dans
// le document d'origine. Il n'écrit rien dans les dépenses : c'est une vue de
// contrôle et de consultation.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { fetchSchoolUnits } from '../lib/schoolUnitService';
import { fetchExpenses } from '../lib/expenseService';
import { fetchCashMovements } from '../lib/cashBookService';
import { cashLedger, cashTotals, monthlySummary, reconcile, pendingBalances } from '../lib/cashBookEngine';
import { unitLabel } from '../components/budgets/BudgetHierarchyModals';
import { downloadCSV } from '../lib/exportCsv';

// Sentinelle de la caisse du COMPLEXE (school_unit_id = NULL). Une chaîne vide
// dans un <select> ne distingue pas « complexe » de « rien choisi ».
const COMPLEXE = '__complexe__';

const TYPE_UI = {
  report:  { label: ['Report', 'Carry-over', 'Arrastre'],            color: 'bg-gray-100 text-gray-700' },
  entree:  { label: ['Entrée', 'Cash in', 'Entrada'],                color: 'bg-emerald-100 text-emerald-800' },
  depense: { label: ['Dépense', 'Expense', 'Gasto'],                 color: 'bg-rose-100 text-rose-800' },
  sortie:  { label: ['Sortie', 'Cash out', 'Salida'],                color: 'bg-amber-100 text-amber-800' },
};

export default function CashBook() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;

  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caisse, setCaisse] = useState(COMPLEXE);
  const [fMonth, setFMonth] = useState('all');
  const [fType, setFType] = useState('all');
  const [fText, setFText] = useState('');

  const load = useCallback(async () => {
    if (!schoolId) { setLoading(false); return; }
    setLoading(true);
    const [un, mv, ex] = await Promise.all([
      fetchSchoolUnits(schoolId),
      fetchCashMovements(schoolId),
      // Toutes les dépenses de l'école, sans filtre de budget : le journal de
      // caisse ne connaît pas les exercices budgétaires, seulement des dates.
      fetchExpenses(schoolId),
    ]);
    setUnits(un || []); setMovements(mv || []); setExpenses(ex || []);
    setLoading(false);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  // Caisses réellement alimentées : on n'offre pas un onglet vide.
  const caisses = useMemo(() => {
    const used = new Set();
    for (const m of movements) used.add(m.school_unit_id || COMPLEXE);
    for (const e of expenses) if (e.status === 'paid') used.add(e.school_unit_id || COMPLEXE);
    const list = (units || [])
      .filter((u) => used.has(u.id))
      .map((u) => ({ value: u.id, label: unitLabel(t, u) }));
    if (used.has(COMPLEXE) || !list.length) {
      list.unshift({ value: COMPLEXE, label: t('Complexe (caisse générale)', 'Complex (general cash)', 'Complejo (caja general)') });
    }
    return list;
  }, [units, movements, expenses, t]);

  // Si la caisse sélectionnée n'existe pas (ou plus), on retombe sur la première
  // réellement disponible plutôt que d'afficher un écran vide sans explication.
  useEffect(() => {
    if (!caisses.length) return;
    if (!caisses.some((c) => c.value === caisse)) setCaisse(caisses[0].value);
  }, [caisses, caisse]);

  const unitId = caisse === COMPLEXE ? null : caisse;
  const rows = useMemo(
    () => cashLedger({ movements, expenses, unitId }),
    [movements, expenses, unitId],
  );
  const totals = useMemo(() => cashTotals(rows), [rows]);
  const months = useMemo(() => monthlySummary(rows), [rows]);
  const ecarts = useMemo(() => reconcile(rows), [rows]);
  // Balances du document illisibles : ni comparables, ni converties. Elles
  // attendent un arbitrage humain, et doivent donc être VISIBLES.
  const aArbitrer = useMemo(() => pendingBalances(rows), [rows]);

  // IMPORTANT : le solde affiché par ligne est TOUJOURS celui du journal complet.
  // Filtrer puis recalculer donnerait un solde qui repart de zéro au milieu de
  // l'exercice — un chiffre faux, et personne ne verrait pourquoi.
  const filtered = useMemo(() => rows.filter((r) => {
    if (fMonth !== 'all' && (r.date || '').slice(0, 7) !== fMonth) return false;
    if (fType !== 'all' && r.type !== fType) return false;
    if (fText.trim()) {
      const q = fText.trim().toLowerCase();
      if (!`${r.label} ${r.reference} ${r.sourceFile || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rows, fMonth, fType, fText]);

  const caisseLabel = caisses.find((c) => c.value === caisse)?.label || '';

  const exporter = () => {
    const head = [
      t('Caisse', 'Cash box', 'Caja'), t('Date', 'Date', 'Fecha'),
      t('Type', 'Type', 'Tipo'), t('Référence', 'Reference', 'Referencia'),
      t('Libellé', 'Description', 'Concepto'), t('Entrée', 'In', 'Entrada'),
      t('Sortie', 'Out', 'Salida'), t('Solde', 'Balance', 'Saldo'),
      t('Solde source', 'Source balance', 'Saldo origen'),
      t('Provenance', 'Origin', 'Procedencia'),
    ];
    const body = filtered.map((r) => [
      caisseLabel, r.date || '', t(...TYPE_UI[r.type].label), r.reference, r.label,
      r.type === 'entree' ? r.amount : '',
      r.type === 'depense' || r.type === 'sortie' ? r.amount : '',
      r.balance,
      r.sourceBalance ?? '',
      r.sourceFile ? `${r.sourceFile} #${r.sourceRow}` : t('Saisie NotesCam', 'Entered in NotesCam', 'Registro NotesCam'),
    ]);
    const pied = [
      [], [t('TOTAUX', 'TOTALS', 'TOTALES'), '', '', '', '', totals.entrees, totals.sorties, totals.solde, '', ''],
    ];
    downloadCSV(`caisse-${caisseLabel.replace(/\s+/g, '-').toLowerCase()}.csv`, [head, ...body, ...pied]);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('Journal de caisse', 'Cash book', 'Libro de caja')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('Entrées, reports et dépenses payées — par caisse et par mois',
                 'Cash in, carry-overs and paid expenses — by cash box and month',
                 'Entradas, arrastres y gastos pagados — por caja y mes')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={caisse} onChange={(e) => setCaisse(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold">
              {caisses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <button onClick={exporter} disabled={!filtered.length}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
              {t('Exporter', 'Export', 'Exportar')}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
        ) : (
          <>
            {/* Solde de LA caisse sélectionnée : jamais une somme des deux. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label={t('Entrées', 'Cash in', 'Entradas')} value={money(totals.entrees)} hint={`${totals.nEntrees}`} />
              <Tile label={t('Dépenses payées', 'Paid expenses', 'Gastos pagados')} value={money(totals.depenses)} hint={`${totals.nDepenses}`} />
              <Tile label={t('Autres sorties', 'Other cash out', 'Otras salidas')} value={money(totals.sorties - totals.depenses)} hint={`${totals.nSorties}`} />
              <Tile label={t('Solde de caisse', 'Cash balance', 'Saldo de caja')} value={money(totals.solde)} strong />
            </div>

            {ecarts.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">
                  {t('Écarts avec le document d’origine', 'Variances against the source document', 'Diferencias con el documento de origen')} ({ecarts.length})
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  {t('Le solde inscrit sur la pièce diffère du solde recalculé. La valeur source est conservée telle quelle : rien n’est corrigé automatiquement.',
                     'The balance written on the document differs from the recomputed one. The source value is kept as is: nothing is corrected automatically.',
                     'El saldo del documento difiere del recalculado. El valor de origen se conserva tal cual.')}
                </p>
                <ul className="mt-2 space-y-1">
                  {ecarts.map((e) => (
                    <li key={e.id} className="text-xs text-amber-900 tabular-nums">
                      {e.date} — {e.sourceFile ? `${e.sourceFile} #${e.sourceRow}` : e.label} :
                      {' '}{t('inscrit', 'written', 'inscrito')} {money(e.sourceBalance)} /
                      {' '}{t('recalculé', 'recomputed', 'recalculado')} {money(e.computed)}
                      {' '}({e.delta > 0 ? '+' : ''}{money(e.delta)})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aArbitrer.length > 0 && (
              <div className="rounded-xl border border-sky-300 bg-sky-50 p-4">
                <p className="text-sm font-bold text-sky-900">
                  {t('Balances du document à arbitrer', 'Source balances to arbitrate', 'Saldos de origen por decidir')} ({aArbitrer.length})
                </p>
                <p className="text-xs text-sky-800 mt-1">
                  {t('La balance inscrite sur la pièce n’est pas un nombre lisible. Elle est conservée telle quelle et n’a PAS été convertie : le solde recalculé est donné en regard, à vous de trancher.',
                     'The balance written on the document is not a readable number. It is kept as is and has NOT been converted: the recomputed balance is shown alongside for you to decide.',
                     'El saldo del documento no es un número legible. Se conserva tal cual y NO se ha convertido.')}
                </p>
                <ul className="mt-2 space-y-1">
                  {aArbitrer.map((a) => (
                    <li key={a.id} className="text-xs text-sky-900 tabular-nums">
                      {a.date} — {a.sourceFile ? `${a.sourceFile} #${a.sourceRow}` : a.label} :
                      {' '}{t('inscrit', 'written', 'inscrito')} « {a.raw} » /
                      {' '}{t('recalculé', 'recomputed', 'recalculado')} {money(a.computed)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Récapitulatif par mois : ouverture → entrées − sorties → clôture. */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-900">{t('Par mois', 'By month', 'Por mes')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <Th>{t('Mois', 'Month', 'Mes')}</Th>
                      <Th right>{t('Ouverture', 'Opening', 'Apertura')}</Th>
                      <Th right>{t('Entrées', 'In', 'Entradas')}</Th>
                      <Th right>{t('Sorties', 'Out', 'Salidas')}</Th>
                      <Th right>{t('Clôture', 'Closing', 'Cierre')}</Th>
                      <Th right>{t('Écritures', 'Entries', 'Asientos')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {months.map((m) => (
                      <tr key={m.month} className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setFMonth(m.month === fMonth ? 'all' : m.month)}>
                        <td className="px-4 py-2 font-semibold text-gray-900">{m.month}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{money(m.opening)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{money(m.entrees)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-rose-700">{money(m.sorties)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold text-gray-900">{money(m.closing)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{m.count}</td>
                      </tr>
                    ))}
                    {!months.length && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                        {t('Aucune écriture dans cette caisse', 'No entries in this cash box', 'Sin asientos en esta caja')}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Journal détaillé */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-end gap-3">
                <h2 className="text-sm font-bold text-gray-900 mr-auto">{t('Détail', 'Details', 'Detalle')}</h2>
                <Filter label={t('Mois', 'Month', 'Mes')}>
                  <select value={fMonth} onChange={(e) => setFMonth(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="all">{t('Tous', 'All', 'Todos')}</option>
                    {months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
                  </select>
                </Filter>
                <Filter label={t('Type', 'Type', 'Tipo')}>
                  <select value={fType} onChange={(e) => setFType(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="all">{t('Tous', 'All', 'Todos')}</option>
                    {Object.entries(TYPE_UI).map(([k, ui]) => <option key={k} value={k}>{t(...ui.label)}</option>)}
                  </select>
                </Filter>
                <Filter label={t('Recherche', 'Search', 'Buscar')}>
                  <input value={fText} onChange={(e) => setFText(e.target.value)}
                    placeholder={t('Libellé, référence, fichier…', 'Description, reference, file…', 'Concepto, referencia…')}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </Filter>
                <span className="text-xs text-gray-400 self-center tabular-nums">{filtered.length}/{rows.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <Th>{t('Date', 'Date', 'Fecha')}</Th>
                      <Th>{t('Type', 'Type', 'Tipo')}</Th>
                      <Th>{t('Réf.', 'Ref.', 'Ref.')}</Th>
                      <Th>{t('Libellé', 'Description', 'Concepto')}</Th>
                      <Th right>{t('Entrée', 'In', 'Entrada')}</Th>
                      <Th right>{t('Sortie', 'Out', 'Salida')}</Th>
                      <Th right>{t('Solde', 'Balance', 'Saldo')}</Th>
                      <Th>{t('Provenance', 'Origin', 'Procedencia')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => {
                      const ui = TYPE_UI[r.type];
                      const ecart = r.sourceBalance !== null && r.sourceBalance !== r.balance;
                      return (
                        <tr key={`${r.origin}-${r.id}`} className="hover:bg-gray-50">
                          <td className="px-4 py-2 whitespace-nowrap text-gray-600 tabular-nums">{r.date || '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ui.color}`}>{t(...ui.label)}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-500 tabular-nums">{r.reference || '—'}</td>
                          <td className="px-4 py-2 text-gray-900 max-w-md">{r.label || '—'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{r.type === 'entree' ? money(r.amount) : ''}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-rose-700">{r.type === 'depense' || r.type === 'sortie' ? money(r.amount) : ''}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">
                            {money(r.balance)}
                            {ecart && (
                              <span className="ml-1 text-[10px] font-bold text-amber-700" title={t('Solde inscrit sur la pièce', 'Balance on the document', 'Saldo del documento') + ` : ${money(r.sourceBalance)}`}>⚠</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {r.sourceFile
                              ? <span title={`${r.sourceFile} — ligne ${r.sourceRow}`}>{t('Importé', 'Imported', 'Importado')} · {r.sourceFile} #{r.sourceRow}</span>
                              : t('Saisie NotesCam', 'NotesCam entry', 'Registro NotesCam')}
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                        {t('Aucune écriture', 'No entries', 'Sin asientos')}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function Tile({ label, value, hint, strong }) {
  return (
    <div className={`rounded-xl border p-4 ${strong ? 'border-brand-200 bg-brand-50' : 'border-gray-200 bg-white'}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums font-bold ${strong ? 'text-xl text-brand-800' : 'text-lg text-gray-900'}`}>{value}</p>
      {hint !== undefined && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

const Th = ({ children, right }) => (
  <th className={`px-4 py-2 font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

function Filter({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}
