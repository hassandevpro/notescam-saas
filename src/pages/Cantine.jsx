// REGISTRE MENSUEL D'UN SERVICE À ABONNEMENT — cantine, transport, internat…
//
// L'école tient aujourd'hui un tableau Word : une ligne par élève, une colonne
// par mois, quatre conventions de lecture (`15 000`, `7 500`, `/`, `ABANDON`) et
// une ligne de quote-part sous le tableau. Tout cela existait déjà en base ; ce
// qui manquait était la PRÉSENTATION. Cet écran ne fait que la rendre.
//
// AUCUNE ÉCRITURE FINANCIÈRE NOUVELLE. Les recettes passent par `fee_payments`
// (guichet des Frais scolaires), les dépenses par `budget_expenses`. Ici on ne
// peut que LIRE la grille et POSER un statut sur une échéance — ce que l'écran
// des frais permet déjà élève par élève, et que l'école voulait voir en grille.
//
// La quote-part est CALCULÉE à la lecture et n'est écrite nulle part : elle est
// déjà contenue dans ce que paie la famille, l'enregistrer la compterait deux
// fois. Voir docs/MODULE_CANTINE.md § 4 et src/lib/cantineEngine.js.
import { useEffect, useMemo, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useSchoolStore } from '../store/schoolStore';
import { useAuthStore } from '../store/authStore';
import { useT } from '../lib/i18n';
import { useMoney } from '../lib/useMoney';
import { useStrictMatrix } from '../lib/useStrictMatrix';
import { loadWithCache } from '../lib/offlineCache';
import { fetchCatalog, fetchStudentFeeItems } from '../lib/feeCatalogService';
import { fetchSchedule, setScheduleStatus } from '../lib/feeScheduleService';
import { STATUTS_POSABLES, SCHEDULE_STATUS } from '../lib/feeScheduleEngine';
import { SCHEDULE_STATUS_LABELS, FEE_CATEGORY_LABELS } from '../components/fees/feeCatalogUi';
import {
  moisDuService, enteteMois, tarifPleinDe, grilleCantine, etatsMensuels,
  csvEtatsMensuels,
} from '../lib/cantineEngine';

// Services à abonnement MENSUEL : ceux dont l'école tient un registre par mois.
// La scolarité n'en est pas — elle a ses grilles tarifaires et son guichet.
const CATEGORIES_SERVICE = ['cantine', 'transport', 'tenue', 'internat', 'soutien', 'activites'];

// Couleur d'une case. Le cahier se lit d'un coup d'œil ; la grille doit aussi.
const TEINTE = {
  plein:       'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
  demi:        'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  non_inscrit: 'text-slate-300 dark:text-slate-600',
  abandon:     'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  exempte:     'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
};

export default function Cantine() {
  const t = useT();
  const money = useMoney();
  const school = useAuthStore((s) => s.school);
  const schoolId = school?.id;
  const year = school?.current_year || '';
  const { canCollectFees, isFinanceReader } = useStrictMatrix();

  const students = useSchoolStore((s) => s.students);
  const classes = useSchoolStore((s) => s.classes);
  const feePayments = useSchoolStore((s) => s.feePayments);
  const classById = useMemo(
    () => Object.fromEntries((classes || []).map((c) => [c.id, c])), [classes]);

  const [catalog, setCatalog] = useState([]);
  const [serviceId, setServiceId] = useState('');
  const [echeances, setEcheances] = useState([]);
  const [abonnements, setAbonnements] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState(null);
  const [cellule, setCellule] = useState(null);     // case ouverte pour décision

  // ── Chargement ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;
    let vivant = true;
    (async () => {
      const { rows } = await loadWithCache(
        `nc_feecatalog_${schoolId}_${year}`, () => fetchCatalog(schoolId, { yearLabel: year }));
      if (!vivant) return;
      const services = (rows || []).filter((r) => CATEGORIES_SERVICE.includes(r.category));
      setCatalog(services);
      setServiceId((id) => id || services.find((s) => s.category === 'cantine')?.id || services[0]?.id || '');
    })();
    return () => { vivant = false; };
  }, [schoolId, year]);

  const recharger = useCallback(async () => {
    if (!schoolId) { setChargement(false); return; }
    setChargement(true);
    // Les deux ensemble : `fee_schedule_items` ne porte PAS le catalogue, c'est
    // l'abonnement qui fait le lien. Sans les abonnements on ne saurait pas
    // distinguer l'échéance de cantine de celle du transport, du même mois.
    const [lignes, items] = await Promise.all([
      fetchSchedule(schoolId, { yearLabel: year }),
      fetchStudentFeeItems(schoolId, { yearLabel: year }),
    ]);
    setEcheances(lignes || []);
    setAbonnements(items || []);
    setChargement(false);
  }, [schoolId, year]);

  useEffect(() => { recharger(); }, [recharger]);

  // ── Le service choisi, ses mois, son tarif ────────────────────────────────
  const service = useMemo(
    () => catalog.find((c) => c.id === serviceId) || null, [catalog, serviceId]);
  const mois = useMemo(() => moisDuService(service, year), [service, year]);
  const entete = useMemo(() => enteteMois(mois), [mois]);
  const tarifPlein = tarifPleinDe(service);
  const quotePart = service?.quote_part ?? null;

  // Échéances DE CE SERVICE, et d'aucun autre : l'abonnement porte
  // `fee_catalog_id`, l'échéance porte `student_fee_item_id`. On joint les deux.
  const idsAbonnement = useMemo(() => new Set(
    abonnements.filter((a) => a.fee_catalog_id === serviceId).map((a) => a.id),
  ), [abonnements, serviceId]);

  const echeancesDuService = useMemo(
    () => echeances.filter((l) => idsAbonnement.has(l.student_fee_item_id)),
    [echeances, idsAbonnement]);

  // ── Les élèves présents dans la grille ────────────────────────────────────
  const eleves = useMemo(() => {
    const avecEcheance = new Set(echeancesDuService.map((l) => l.student_id));
    return (students || [])
      .filter((e) => avecEcheance.has(e.id))
      .map((e) => ({
        id: e.id,
        name: [e.last_name, e.first_name].filter(Boolean).join(' ') || e.name || '—',
        className: classById[e.class_id]?.name || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [students, echeancesDuService, classById]);

  const grille = useMemo(
    () => grilleCantine({ eleves, echeances: echeancesDuService, paiements: feePayments || [], mois, tarifPlein }),
    [eleves, echeancesDuService, feePayments, mois, tarifPlein]);

  const { parMois, total } = useMemo(
    () => etatsMensuels({ grille, mois, quotePart }), [grille, mois, quotePart]);

  // ── Poser une décision sur une case ───────────────────────────────────────
  const poser = async (statut) => {
    if (!cellule?.echeance_id) return;
    const ligne = echeancesDuService.find((l) => l.id === cellule.echeance_id);
    const r = await setScheduleStatus({
      ligne, statut, schoolId,
      allowExemption: service?.allow_exemption !== 0 && service?.allow_exemption !== false,
      payments: feePayments || [],
    });
    setCellule(null);
    if (!r?.ok) { setMessage(t('Décision refusée.', 'Decision refused.', 'Decisión rechazada.')); return; }
    setMessage(null);
    await recharger();
  };

  const exporter = () => {
    const csv = csvEtatsMensuels({ parMois, total, devise: school?.currency || 'XAF' });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${service?.name || 'service'}-${year}.csv`.replace(/\s+/g, '-');
    a.click();
    URL.revokeObjectURL(url);
  };

  const statutLabel = (s) => t(...(SCHEDULE_STATUS_LABELS[s] || [s]));

  // ── Rendu ─────────────────────────────────────────────────────────────────
  if (!isFinanceReader && school?.strict_role_enforcement) {
    return (
      <Layout><div className="max-w-md mx-auto py-24 text-center text-gray-500">
        <div className="text-3xl mb-2">🔒</div>
        <p className="text-sm">
          {t("Cet écran montre de l'argent : il demande une autorité financière.",
             'This screen shows money: it requires financial authority.',
             'Esta pantalla muestra dinero: requiere autoridad financiera.')}
        </p>
      </div></Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">
          {t('Registre des services', 'Service register', 'Registro de servicios')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('Grille élèves × mois — cantine, transport, internat',
             'Students × months grid — canteen, transport, boarding',
             'Alumnos × meses — comedor, transporte, internado')} — {year || '—'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm">
          <span className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
            {t('Service', 'Service', 'Servicio')}
          </span>
          <select
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {catalog.length === 0 && <option value="">—</option>}
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {t(...(FEE_CATEGORY_LABELS[c.category] || [c.category]))}
              </option>
            ))}
          </select>
        </label>

        {service && (
          <div className="text-xs text-slate-500 leading-5">
            <div>{t('Tarif plein', 'Full rate', 'Tarifa completa')} : <b>{money(tarifPlein)}</b></div>
            <div>
              {t('Quote-part', 'School share', 'Cuota')} :{' '}
              {quotePart ? <b>{money(quotePart)}</b>
                : <span className="italic">{t('non renseignée', 'not set', 'sin definir')}</span>}
            </div>
          </div>
        )}

        <button
          type="button" onClick={exporter} disabled={!parMois.length}
          className="ml-auto rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm disabled:opacity-40"
        >
          {t('Exporter', 'Export', 'Exportar')} CSV
        </button>
      </div>

      {message && <p className="mb-3 text-sm text-rose-600">{message}</p>}

      {chargement ? (
        <p className="text-sm text-slate-500">{t('Chargement…', 'Loading…', 'Cargando…')}</p>
      ) : !service ? (
        <p className="text-sm text-slate-500">
          {t("Aucun service à abonnement dans le catalogue de cette année. Créez-en un dans « Frais scolaires » → Catalogue.",
             'No subscription service in this year’s catalogue. Create one under School Fees → Catalogue.',
             'Ningún servicio por suscripción en el catálogo de este año.')}
        </p>
      ) : eleves.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t("Aucun élève abonné à ce service cette année.",
             'No student subscribed to this service this year.',
             'Ningún alumno suscrito a este servicio este año.')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-2 py-2 text-left font-medium sticky left-0 bg-slate-50 dark:bg-slate-800">
                  {t('Élève', 'Student', 'Alumno')}
                </th>
                <th className="px-2 py-2 text-left font-medium">{t('Classe', 'Class', 'Clase')}</th>
                {entete.map((m) => (
                  <th key={m.period_key} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                    {m.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">{t('Reste', 'Balance', 'Saldo')}</th>
              </tr>
            </thead>

            <tbody>
              {grille.map((r) => (
                <tr key={r.student_id} className="border-t border-slate-100 dark:border-slate-700/60">
                  <td className="px-2 py-1.5 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900">{r.name}</td>
                  <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.className}</td>
                  {r.cellules.map((c) => (
                    <td key={c.period_key} className={`px-2 py-1.5 text-center whitespace-nowrap ${TEINTE[c.convention] || ''}`}>
                      {canCollectFees && c.echeance_id ? (
                        <button
                          type="button"
                          onClick={() => setCellule({ ...c, eleve: r.name })}
                          className="w-full rounded px-1 hover:underline"
                          title={t('Changer le statut', 'Change status', 'Cambiar estado')}
                        >
                          {c.texte}
                        </button>
                      ) : c.texte}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.reste ? money(r.reste) : '—'}</td>
                </tr>
              ))}
            </tbody>

            <tfoot className="bg-slate-50 dark:bg-slate-800/60 text-xs">
              <LigneTotal libelle={t('Inscrits', 'Enrolled', 'Inscritos')}
                cols={parMois.map((m) => (m.moisSansService ? '—' : m.inscrits))} fin={total.inscrits} />
              <LigneTotal libelle={t('dont demi-mois', 'of which half-month', 'medio mes')}
                cols={parMois.map((m) => m.demiMois || '')} fin={total.demiMois} />
              <LigneTotal libelle={t('Attendu', 'Expected', 'Esperado')}
                cols={parMois.map((m) => money(m.attendu))} fin={money(total.attendu)} />
              <LigneTotal libelle={t('Encaissé', 'Collected', 'Cobrado')}
                cols={parMois.map((m) => money(m.encaisse))} fin={money(total.encaisse)} />
              <LigneTotal libelle={t('Impayé', 'Unpaid', 'Impago')}
                cols={parMois.map((m) => (m.impaye ? money(m.impaye) : '—'))} fin={money(total.impaye)} />
              {quotePart ? (
                <LigneTotal
                  libelle={`${t('Quote-part', 'School share', 'Cuota')} (${money(quotePart)})`}
                  cols={parMois.map((m) => (m.quotePart ? money(m.quotePart) : '—'))}
                  fin={money(total.quotePart)} fort />
              ) : null}
            </tfoot>
          </table>
        </div>
      )}

      {/* Décision sur une échéance — exactement les statuts que la base accepte. */}
      {cellule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
             onClick={() => setCellule(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 p-4 shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium mb-1">{cellule.eleve}</h3>
            <p className="text-xs text-slate-500 mb-3">
              {cellule.period_key} · {money(cellule.montantDu)} · {statutLabel(cellule.statut)}
            </p>
            <div className="grid gap-2">
              {STATUTS_POSABLES.filter((s) => SCHEDULE_STATUS.includes(s)).map((s) => (
                <button key={s} type="button" onClick={() => poser(s)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-left">
                  {statutLabel(s)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              {t("Un versement déjà encaissé empêche certaines décisions : la base les refusera, et c'est voulu.",
                 'A payment already collected blocks some decisions: the database refuses them, by design.',
                 'Un pago ya cobrado bloquea algunas decisiones.')}
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}

// Une ligne de totaux sous la grille. Extraite parce qu'il y en a six, et que
// six copies du même JSX divergent toujours.
function LigneTotal({ libelle, cols, fin, fort = false }) {
  return (
    <tr className={`border-t border-slate-200 dark:border-slate-700 ${fort ? 'font-semibold' : ''}`}>
      <td className="px-2 py-1.5 sticky left-0 bg-slate-50 dark:bg-slate-800">{libelle}</td>
      <td />
      {cols.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">{v}</td>
      ))}
      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fin}</td>
    </tr>
  );
}
