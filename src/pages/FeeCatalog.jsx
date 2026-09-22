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
  balanceByCategory, studentTotals, revenueByFeeType, statementByFamily,
} from '../lib/feeCatalogEngine';
import { FEE_CATEGORY_LABELS, SCHEDULE_STATUS_LABELS, SCHEDULE_STATUS_HINTS, SCHEDULE_REFUS_LABELS } from '../components/fees/feeCatalogUi';
import FeeCatalogItemModal from '../components/fees/FeeCatalogItemModal';
import Modal from '../components/Modal';
import { loadWithCache } from '../lib/offlineCache';
import { printTicket } from '../lib/receiptDoc';
import { printSubscribers } from '../lib/feeSubscribersDoc';
import { generateSchedule, fetchSchedule, scheduleView, setScheduleStatus } from '../lib/feeScheduleService';
import { repartitionVersement, soldeEcheance, totauxEcheancier, ventilationEcheancier, STATUTS_POSABLES } from '../lib/feeScheduleEngine';
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

  // Toutes les listes de l'école : statistiques de recettes ET liste imprimable
  // des souscripteurs d'un frais (onglet Catalogue) — les deux ont besoin de
  // TOUTES les souscriptions, pas seulement de celles de l'élève affiché.
  useEffect(() => {
    if ((view === 'stats' || view === 'catalog') && schoolId) {
      fetchStudentFeeItems(schoolId, { yearLabel: year }).then((r) => setAllItems(r || []));
    }
  }, [view, schoolId, year]);

  // — Liste des élèves ayant souscrit à un frais (bus, cantine, internat…) —
  // Une souscription RETIRÉE (`status: 'removed'`) est exclue : la liste sert à
  // l'appel du chauffeur ou de la cantine, elle doit dire qui est inscrit
  // AUJOURD'HUI. Le montant vient de la souscription (snapshot pris à
  // l'attribution), pas du catalogue : un tarif modifié en cours d'année ne doit
  // pas réécrire ce que l'élève doit réellement.
  const subscribersOf = (cat) => allItems
    .filter((i) => i.fee_catalog_id === cat.id && i.status !== 'removed')
    .map((i) => {
      const stu = students.find((s) => s.id === i.student_id);
      return {
        name:      stu?.name || '—',
        matricule: stu?.matricule || '',
        gender:    stu?.gender || null,
        className: classById[stu?.class_id]?.name || '',
        amount:    Number(i.amount) || 0,
        paid:      paidForItem(i.id, feePayments),
      };
    });

  const printCatalogList = (cat) => printSubscribers({
    school,
    feeName: cat.name,
    categoryLabel: catLabel(cat.category),
    rows: subscribersOf(cat),
    lang: school?.language,
  });

  // Échéances de l'élève affiché (frais périodiques uniquement). Rechargées à
  // chaque changement d'élève ou de liste de frais : une souscription qui vient
  // d'être cochée a genéré ses échéances, il faut les voir sans recharger la page.
  const [schedule, setSchedule] = useState([]);
  useEffect(() => {
    if (!schoolId || !studentId || view !== 'students') { setSchedule([]); return; }
    let vivant = true;
    fetchSchedule(schoolId, { studentId, yearLabel: year })
      .then((r) => { if (vivant) setSchedule(r || []); })
      .catch(() => { if (vivant) setSchedule([]); });
    return () => { vivant = false; };
  }, [schoolId, studentId, year, view, items]);

  // Échéances groupées par frais, avec leur versé et leur statut effectif.
  const scheduleByItem = useMemo(() => {
    const vue = scheduleView(schedule, feePayments);
    const map = {};
    for (const l of vue) (map[l.student_fee_item_id] ??= []).push(l);
    return map;
  }, [schedule, feePayments]);

  // Dû d'un frais. Pour un frais PÉRIODIQUE, `amount` est le prix d'UNE
  // période : le dû réel est la somme de son échéancier, exemptions retirées.
  // Sans cela le relevé afficherait « cantine : due 15 000, payée 45 000 ».
  const dueOfItem = useCallback((i) => {
    const lignes = scheduleByItem[i.id];
    if (!lignes || !lignes.length) return Number(i.amount) || 0;
    const parPeriode = Object.fromEntries(lignes.map((l) => [l.period_key, l.amount_paid]));
    return totauxEcheancier(lignes, parPeriode).du;
  }, [scheduleByItem]);

  // Relevé en deux blocs : frais académiques / services scolaires.
  const statement = useMemo(
    () => statementByFamily(items, (i) => paidForItem(i.id, feePayments), dueOfItem),
    [items, feePayments, dueOfItem],
  );

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
  // Un service PÉRIODIQUE demande sa date d'entrée ; un frais à versement unique
  // n'en a que faire, et la question ne lui est pas posée.
  const estPeriodique = (cat) => !!cat?.periodicity && cat.periodicity !== 'unique';

  const toggleOptional = async (opt, checked) => {
    if (checked) {
      // La date d'entrée DANS CE SERVICE, distincte de l'inscription scolaire.
      // Proposée au jour même : souscrire, c’est presque toujours commencer
      // aujourd’hui. L’école corrige pour une inscription saisie en retard.
      let debut = null;
      if (estPeriodique(opt)) {
        const v = window.prompt(
          `${opt.name} — ${t('Début du service (AAAA-MM-JJ)', 'Service start (YYYY-MM-DD)', 'Inicio del servicio (AAAA-MM-DD)')}\n`
          + t('Les périodes entièrement écoulées avant cette date ne seront pas facturées.',
            'Periods fully elapsed before this date will not be billed.',
            'Los periodos transcurridos antes de esta fecha no se facturarán.'),
          todayISO());
        if (v == null) return;                       // annulé : on ne souscrit pas
        debut = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
        if (!debut) {
          window.alert(t('Date invalide.', 'Invalid date.', 'Fecha no válida.'));
          return;
        }
      }
      const saved = await upsertStudentFeeItem({
        id: uuid(),
        ...snapshotItem(opt, { studentId, schoolId, academicYear: year }),
        started_at: debut,
      });
      if (saved) {
        setItems((xs) => [...xs, saved]);
        // Frais PÉRIODIQUE : on pose ses échéances dès l'attribution. La
        // génération est idempotente (unicité en base) et part de la date
        // d'inscription de l'élève — aucune créance pour les mois d'avant son
        // arrivée. Elle ne bloque pas l'attribution : un échec laisse le frais
        // en place, et une réouverture de la fiche rattrapera les échéances.
        // `started_at` de la souscription fait foi ; la date scolaire n’est plus
        // qu’un repli pour les souscriptions qui n’en portent pas.
        generateSchedule({
          schoolId, catalogItem: opt, studentFeeItem: saved,
          enrolledAt: selectedStudent?.created_at || null,
        }).catch(() => { /* jamais bloquant */ });
      }
    } else {
      const existing = items.find((i) => i.fee_catalog_id === opt.id && i.status !== 'removed');
      if (!existing) return;
      if (paidForItem(existing.id, feePayments) > 0) { window.alert(t('Frais déjà payé partiellement : impossible de le retirer.', 'Already partly paid: cannot remove.', 'Ya pagado parcialmente: no se puede quitar.')); return; }
      if (await deleteStudentFeeItem(existing.id)) setItems((xs) => xs.filter((i) => i.id !== existing.id));
    }
  };
  // CORRIGER la date d'entrée. Ce qui change, et ce qui ne change PAS :
  // la nouvelle date ne vaut que pour les périodes À VENIR — la génération
  // ne touche JAMAIS une échéance existante (garantie de B2), et surtout
  // aucun versement déjà encaissé n’est déplacé ni annulé. Reculer la date
  // AJOUTE les périodes manquantes ; l’avancer ne SUPPRIME rien, car
  // supprimer une période déjà décidée ou payée effacerait une trace. Les
  // périodes devenues hors service se retirent du dû avec « non applicable ».
  const editStartedAt = async (item) => {
    const cat = catalog.find((x) => x.id === item.fee_catalog_id);
    const v = window.prompt(
      `${item.name} — ${t('Début du service (AAAA-MM-JJ)', 'Service start (YYYY-MM-DD)', 'Inicio del servicio (AAAA-MM-DD)')}\n`
      + t('La nouvelle date ne vaut que pour les périodes à venir : aucune échéance existante ni aucun versement n’est modifié.',
        'The new date only applies to periods yet to be generated: no existing instalment or payment is changed.',
        'La nueva fecha solo rige los periodos por generar: no se modifica ningún vencimiento ni pago existente.'),
      item.started_at || todayISO());
    if (v == null) return;
    const debut = /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
    if (!debut) {
      window.alert(t('Date invalide.', 'Invalid date.', 'Fecha no válida.'));
      return;
    }
    const saved = await upsertStudentFeeItem({ ...item, started_at: debut });
    if (!saved) return;
    setItems((xs) => xs.map((i) => (i.id === item.id ? saved : i)));
    if (cat && estPeriodique(cat)) {
      await generateSchedule({
        schoolId, catalogItem: cat, studentFeeItem: saved,
        enrolledAt: selectedStudent?.created_at || null,
      }).catch(() => { /* jamais bloquant */ });
      const frais = await fetchSchedule(schoolId, { studentId, yearLabel: year });
      setSchedule(frais || []);
    }
  };

  const editAmount = async (item) => {
    const v = window.prompt(t('Nouveau montant', 'New amount', 'Nuevo importe'), item.amount);
    if (v == null) return;
    const saved = await upsertStudentFeeItem({ ...item, amount: Number(v) || 0 });
    if (saved) setItems((xs) => xs.map((i) => i.id === item.id ? saved : i));
  };
  // `allow_partial` est porté par l'article du CATALOGUE, pas par la
  // souscription : on le relit là. Article retiré du catalogue → on reste
  // permissif, c'est ce qu'ont toujours fait les frais avant les périodes.
  const allowPartialOf = (item) => {
    const c = catalog.find((x) => x.id === item.fee_catalog_id);
    if (!c) return true;
    return !(c.allow_partial === false || c.allow_partial === 0);
  };

  // `allow_exemption` ne gouverne QUE l'exemption. Un abandon est un fait — la
  // famille a quitté le service — et « non applicable » une constatation : ni
  // l’un ni l’autre n’est une faveur que l’école pourrait s’interdire de noter.
  const allowExemptionOf = (item) => {
    const c = catalog.find((x) => x.id === item.fee_catalog_id);
    if (!c) return true;
    return !(c.allow_exemption === false || c.allow_exemption === 0);
  };

  // ENCAISSEMENT RÉPARTI SUR DES PÉRIODES.
  //
  // Une écriture `fee_payments` PAR PÉRIODE, et non une seule pour l’ensemble :
  // c’est ce qui permet de contre-passer février seul quand une famille l’annule,
  // et ce qui laisse `paidForSchedule` dire ce qui a été versé mois par mois sans
  // jamais stocker le payé. Aucun second chemin de paiement : `addPayment` reste
  // la seule porte, avec son reçu numéroté et son caissier figé.
  //
  // Le ticket imprimé est UNIQUE — la famille a remis une somme, pas trois — et
  // porte le numéro de la première écriture ; les autres existent dans la série,
  // sans trou. Le libellé énumère les périodes couvertes pour que le papier dise
  // exactement ce qu’il solde.
  const payerEcheances = async (item, lignes, montant) => {
    const partiel = allowPartialOf(item);
    const { affectations, reste } = repartitionVersement(lignes, montant, { allowPartial: partiel });
    if (!affectations.length) {
      window.alert(partiel
        ? t('Rien à imputer : toutes les périodes sont soldées, exemptées ou abandonnées.',
          'Nothing to allocate: every period is settled, exempted or dropped.',
          'Nada que imputar: todos los periodos están saldados, exentos o abandonados.')
        : t('Ce frais n’accepte pas le paiement partiel : le montant ne couvre aucune période entière.',
          'This fee does not allow partial payment: the amount covers no full period.',
          'Esta tasa no admite pago parcial: el importe no cubre ningún periodo completo.'));
      return;
    }
    // Le surplus n’est PAS encaissé : une recette imputée sur rien deviendrait
    // introuvable le jour où il faut justifier l’exercice.
    if (reste > 0 && !window.confirm(
      t(`Seuls ${money(montant - reste)} peuvent être imputés (${money(reste)} au-delà du dû). Encaisser ce montant ?`,
        `Only ${money(montant - reste)} can be allocated (${money(reste)} beyond what is owed). Record that amount?`,
        `Solo ${money(montant - reste)} pueden imputarse (${money(reste)} por encima de lo debido). ¿Registrar ese importe?`))) return;

    const ecritures = [];
    for (const a of affectations) {
      const rec = await addPayment(studentId, {
        amount: a.amount,
        date: todayISO(),
        note: `${item.name} — ${a.period_label}`,
        student_fee_item_id: item.id,
        fee_schedule_item_id: a.schedule_id,
      });
      if (rec) ecritures.push(rec);
    }
    if (!ecritures.length) return;
    const encaisse = ecritures.reduce((somme, r) => somme + (Number(r.amount) || 0), 0);
    if (selectedStudent) {
      printTicket({
        school,
        student: selectedStudent,
        className: classById[selectedStudent.class_id]?.name || '',
        lang: school?.language,
        payment: ecritures[0],
        versement: encaisse,
        newTotal: statement.total.paid + encaisse,
        fraisAnnuels: statement.total.due,
        mode: 'libre',
        designation: `${item.name} — ${affectations.map((a) => a.period_label).join(', ')}`,
        date: ecritures[0].date,
        cashierName: ecritures[0].recorded_by_name || null,
      });
    }
  };

  // Régler UNE période depuis sa pastille.
  const payerUnePeriode = async (item, ligne) => {
    const solde = soldeEcheance(ligne);
    if (solde <= 0) return;
    const libelle = ligne.period_label || ligne.period_key;
    if (!allowPartialOf(item)) {
      if (!window.confirm(`${item.name} — ${libelle} : ${money(solde)} ?`)) return;
      return payerEcheances(item, [ligne], solde);
    }
    const v = window.prompt(`${item.name} — ${libelle} (${t('solde', 'balance', 'saldo')} ${money(solde)})`, solde);
    if (v == null) return;
    const montant = Number(v) || 0;
    if (montant <= 0) return;
    // Une période ne reçoit jamais plus que son solde : le surplus irait grossir
    // un mois déjà réglé au lieu d’aller au suivant.
    return payerEcheances(item, [ligne], Math.min(montant, solde));
  };

  // ── DÉCIDER DU SORT D’UNE PÉRIODE (exempter, abandon, non applicable) ────
  // La décision est une écriture qui fait SORTIR une créance du dû : elle passe
  // par le service, qui la soumet au moteur, réimpose le périmètre école et la
  // trace dans les deux journaux. L’écran ne décide de rien lui-même.
  const [decisionFor, setDecisionFor] = useState(null);   // { item, ligne }
  const [decisionBusy, setDecisionBusy] = useState(false);

  const appliquerDecision = async (statut) => {
    if (!decisionFor || decisionBusy) return;
    const { item, ligne } = decisionFor;
    setDecisionBusy(true);
    const r = await setScheduleStatus({
      ligne,
      statut,
      schoolId,
      allowExemption: allowExemptionOf(item),
      payments: feePayments,
    });
    setDecisionBusy(false);
    if (!r.ok) {
      window.alert(t(...(SCHEDULE_REFUS_LABELS[r.raison]
        || ['Décision refusée.', 'Decision refused.', 'Decisión rechazada.'])));
      return;
    }
    // Relecture depuis la base plutôt que retouche locale : le statut effectif
    // d’une période se déduit aussi des versements, et deux chemins de calcul
    // pour un même affichage finissent par diverger.
    const frais = await fetchSchedule(schoolId, { studentId, yearLabel: year });
    setSchedule(frais || []);
    setDecisionFor(null);
  };
  const pay = async (item) => {
    const echeances = scheduleByItem[item.id] || [];
    // Frais PÉRIODIQUE : la somme se répartit sur les périodes, les plus
    // anciennes d’abord. Le rattrapage d’arriérés est le comportement par
    // défaut, pas une option — imputer au plus récent laisserait une dette
    // ancienne s’installer sous un compte qui paraît à jour.
    if (echeances.length) {
      const restant = echeances.reduce((somme, e) => somme + soldeEcheance(e), 0);
      if (restant <= 0) {
        window.alert(t('Toutes les périodes sont réglées.', 'Every period is settled.', 'Todos los periodos están saldados.'));
        return;
      }
      const v = window.prompt(
        `${item.name} — ${t('Montant à payer', 'Amount to pay', 'Importe a pagar')} (${t('reste dû', 'still owed', 'saldo pendiente')} ${money(restant)})`,
        restant);
      if (v == null) return;
      const montant = Number(v) || 0;
      if (montant <= 0) return;
      return payerEcheances(item, echeances, montant);
    }

    const b = itemBalance(item, feePayments);
    const v = window.prompt(`${item.name} — ${t('Montant à payer', 'Amount to pay', 'Importe a pagar')} (${t('solde', 'balance', 'saldo')} ${money(b.balance)})`, b.balance > 0 ? b.balance : '');
    if (v == null) return;
    const amount = Number(v) || 0;
    if (amount <= 0) return;
    const rec = await addPayment(studentId, { amount, date: todayISO(), note: item.name, student_fee_item_id: item.id });
    // Tout encaissement donne son ticket, quel que soit l'écran d'où il part.
    // Les totaux portés par le ticket sont ceux du CATALOGUE de l’élève (c’est
    // le périmètre de cet écran), pas la scolarité globale.
    if (rec && selectedStudent) {
      printTicket({
        school,
        student: selectedStudent,
        className: classById[selectedStudent.class_id]?.name || '',
        lang: school?.language,
        payment: rec,
        versement: amount,
        newTotal: statement.total.paid + amount,
        fraisAnnuels: statement.total.due,
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
                  <th className="text-right px-4 py-2">{t('Inscrits', 'Enrolled', 'Inscritos')}</th>
                  <th className="px-4 py-2" /></tr></thead>
                <tbody>{catalog.map((c) => {
                  const inscrits = subscribersOf(c).length;
                  return (
                  <tr key={c.id} className={`border-t border-gray-100 ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-2">{catLabel(c.category)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(c.amount)}</td>
                    <td className="px-4 py-2">
                      {c.mandatory ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">{t('Obligatoire', 'Mandatory', 'Obligatorio')}</span>
                        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{t('Optionnel', 'Optional', 'Opcional')}</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">{c.class_id ? (classById[c.class_id]?.name || '—') : c.level || t('École', 'School', 'Escuela')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-700">{inscrits || <span className="text-gray-300">0</span>}</td>
                    <td className="px-4 py-2 text-right"><span className="flex justify-end gap-2 items-center">
                      {/* Imprimer la liste des souscripteurs : elle part au chauffeur
                          du bus ou à la cantine, donc elle n'est pas réservée à qui
                          peut MODIFIER le catalogue. Masquée s'il n'y a personne —
                          un imprimé vide n'apprend rien. */}
                      {inscrits > 0 && (
                        <button onClick={() => printCatalogList(c)}
                          title={t('Imprimer la liste des élèves inscrits à ce frais', 'Print the list of students enrolled in this fee', 'Imprimir la lista de alumnos inscritos')}
                          className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50">
                          🖨 {t('Liste', 'List', 'Lista')}
                        </button>
                      )}
                      {canManage && (<>
                        <button onClick={() => setCatModal({ item: c })} className="text-xs text-gray-400 hover:text-gray-700">✎</button>
                        <button onClick={() => removeCat(c)} className="text-xs text-rose-400 hover:text-rose-600">✕</button>
                      </>)}</span></td>
                  </tr>
                  );
                })}</tbody>
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
                  {/* Relevé en DEUX BLOCS. Un parent ne lit pas « scolarité » et
                      « cantine » de la même façon : l'un est une obligation, l'autre
                      une prestation à laquelle il a souscrit. La séparation ne change
                      aucun calcul — elle rend le relevé lisible. */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <tbody>
                        {[
                          { cle: 'academique', titre: t('Frais académiques', 'Academic fees', 'Tasas académicas'), bloc: statement.academique },
                          { cle: 'service', titre: t('Services scolaires', 'School services', 'Servicios escolares'), bloc: statement.service },
                        ].map(({ cle, titre, bloc }) => (
                          <Fragment key={cle}>
                            <tr className="bg-gray-50/70">
                              <td className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide" colSpan={2}>{titre}</td>
                              <td className="px-4 py-2 text-right text-xs tabular-nums text-emerald-700">{money(bloc.paid)}</td>
                              <td className={`px-4 py-2 text-right text-xs tabular-nums ${bloc.balance > 0 ? 'text-rose-600' : 'text-gray-400'}`}>{money(bloc.balance)}</td>
                              <td />
                            </tr>
                            {bloc.lignes.length === 0 && (
                              <tr><td className="px-4 py-3 text-xs text-gray-400" colSpan={5}>
                                {cle === 'service'
                                  ? t('Aucun service souscrit.', 'No service subscribed.', 'Sin servicios.')
                                  : t('Aucun frais.', 'No fee.', 'Sin tasas.')}
                              </td></tr>
                            )}
                            {bloc.lignes.map((i) => {
                              const echeances = scheduleByItem[i.id] || [];
                              return (
                                <Fragment key={i.id}>
                                  <tr className="border-t border-gray-100">
                                    <td className="px-4 py-2">
                                      <div className="font-medium text-gray-800">{i.name}
                                        {i.mandatory ? <span className="ml-2 text-[10px] text-rose-600">({t('obligatoire', 'mandatory', 'obligatorio')})</span> : null}</div>
                                      <div className="text-xs text-gray-400">
                                        {catLabel(i.category)}
                                        {echeances.length > 0 && ` · ${echeances.length} ${t('échéances', 'instalments', 'vencimientos')}`}
                                        {echeances.length > 0 && (
                                          <>
                                            {' · '}
                                            {t('depuis', 'since', 'desde')}{' '}
                                            {i.started_at || (
                                              <span title={t('Aucune date de service : repli sur l’inscription scolaire.', 'No service date: falls back to school enrolment.', 'Sin fecha de servicio: se usa la matrícula.')}>
                                                {t('inscription scolaire', 'school enrolment', 'matrícula')}
                                              </span>
                                            )}
                                            {canManage && (
                                              <button
                                                type="button"
                                                onClick={() => editStartedAt(i)}
                                                title={t('Corriger la date d’entrée dans ce service', 'Fix the service start date', 'Corregir la fecha de inicio')}
                                                className="ml-1 text-gray-300 hover:text-indigo-600"
                                              >
                                                ✎
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{money(i.due)}
                                      {canManage && <button onClick={() => editAmount(i)} className="ml-1 text-xs text-gray-300 hover:text-gray-600">✎</button>}</td>
                                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{money(i.paid)}</td>
                                    <td className={`px-4 py-2 text-right tabular-nums ${i.balance > 0 ? 'text-rose-600' : 'text-gray-400'}`}>{money(i.balance)}</td>
                                    <td className="px-4 py-2 text-right">{canManage && i.balance > 0 && <button onClick={() => pay(i)} className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded">{t('Payer', 'Pay', 'Pagar')}</button>}</td>
                                  </tr>
                                  {/* Échéances d'un frais périodique : c'est ici que se
                                      lit « novembre est dû », mois par mois. */}
                                  {echeances.length > 0 && (
                                    <tr className="border-t border-gray-50">
                                      <td colSpan={5} className="px-4 pb-3 pt-1 bg-gray-50/40">
                                        <div className="flex flex-wrap gap-1.5">
                                          {echeances.map((e) => {
                                            const style = e.effective_status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                              : e.effective_status === 'partial' ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                : e.effective_status === 'due' ? 'bg-white text-gray-500 border-gray-200'
                                                  : 'bg-gray-100 text-gray-400 border-gray-200 line-through';
                                            // Une période EXEMPTÉE, ABANDONNÉE ou NON APPLICABLE a un
                                            // solde nul : elle reste une pastille morte, jamais un bouton.
                                            // Encaisser dessus reviendrait à révoquer, au guichet, une
                                            // décision que l'école a prise ailleurs.
                                            const reglable = canManage && soldeEcheance(e) > 0;
                                            const infobulle = `${money(e.amount_paid)} / ${money(e.amount_due)}`;
                                            const classes = `px-2 py-0.5 rounded-md text-[11px] font-medium border ${style}`;
                                            // La pastille garde son geste de B4 (cliquer = régler).
                                            // La DÉCISION est un second bouton, discret et distinct :
                                            // confondre les deux ferait exempter d’un clic destiné à encaisser.
                                            const bouton = canManage ? (
                                              <button
                                                type="button"
                                                onClick={() => setDecisionFor({ item: i, ligne: e })}
                                                title={t('Décider du sort de cette période', 'Decide this period', 'Decidir este periodo')}
                                                className="px-1 text-[11px] leading-none text-gray-300 hover:text-indigo-600"
                                              >
                                                ⋯
                                              </button>
                                            ) : null;
                                            return reglable ? (
                                              <span key={e.id} className="inline-flex items-center">
                                                <button
                                                  type="button"
                                                  onClick={() => payerUnePeriode(i, e)}
                                                  title={`${infobulle} — ${t('régler cette période', 'settle this period', 'liquidar este periodo')}`}
                                                  className={`${classes} hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-colors cursor-pointer`}
                                                >
                                                  {e.period_label || e.period_key}
                                                </button>
                                                {bouton}
                                              </span>
                                            ) : (
                                              <span key={e.id} className="inline-flex items-center">
                                                <span title={infobulle} className={classes}>
                                                  {e.period_label || e.period_key}
                                                </span>
                                                {bouton}
                                              </span>
                                            );
                                          })}
                                        </div>
                                        {/* Ce qui est SORTI du dû, et par quelle décision.
                                            « Exempté » et « non applicable » produisent le même
                                            solde et se confondent vite ; l’un est une faveur faite
                                            à cette famille, l’autre un mois que l’école ne facture
                                            à personne. Le relevé doit pouvoir les distinguer. */}
                                        {(() => {
                                          const parPeriode = Object.fromEntries(echeances.map((l) => [l.period_key, l.amount_paid]));
                                          const v = ventilationEcheancier(echeances, parPeriode);
                                          const parts = [
                                            [t('exempté', 'exempted', 'exento'), v.exempte],
                                            [t('abandonné', 'dropped', 'abandonado'), v.abandonne],
                                            [t('non applicable', 'not applicable', 'no aplicable'), v.nonApplicable],
                                          ].filter(([, m]) => m > 0);
                                          if (!parts.length) return null;
                                          return (
                                            <div className="mt-1.5 text-[11px] text-gray-400">
                                              {t('Hors du dû', 'Outside the amount owed', 'Fuera de lo debido')} :{' '}
                                              {parts.map(([lab, m]) => `${lab} ${money(m)}`).join(' · ')}
                                            </div>
                                          );
                                        })()}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        ))}
                        <tr className="border-t-2 border-gray-200 bg-gray-50">
                          <td className="px-4 py-2 text-sm font-bold text-gray-700">{t('TOTAL', 'TOTAL', 'TOTAL')}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-gray-800">{money(statement.total.due)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold text-emerald-700">{money(statement.total.paid)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums font-bold ${statement.total.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{money(statement.total.balance)}</td>
                          <td />
                        </tr>
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

      {decisionFor && (
        <Modal
          title={`${decisionFor.item.name} — ${decisionFor.ligne.period_label || decisionFor.ligne.period_key}`}
          onClose={() => setDecisionFor(null)}
          size="md"
        >
          <div className="p-4 space-y-3">
            <div className="text-xs text-gray-500">
              {t('Dû', 'Due', 'Debido')} {money(decisionFor.ligne.amount_due)}
              {' · '}{t('versé', 'paid', 'pagado')} {money(decisionFor.ligne.amount_paid)}
            </div>
            {decisionFor.ligne.amount_paid > 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {t(...SCHEDULE_REFUS_LABELS.periode_payee)}
              </div>
            )}
            <div className="space-y-1.5">
              {STATUTS_POSABLES.map((st) => {
                const courant = (decisionFor.ligne.status || null) === st;
                const bloque = decisionFor.ligne.amount_paid > 0 && st !== 'due';
                const interdit = st === 'exempted' && !allowExemptionOf(decisionFor.item);
                const off = bloque || interdit || decisionBusy;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={off}
                    onClick={() => appliquerDecision(st)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      courant ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                        : off ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-gray-700'}`}
                  >
                    <div className="font-medium">
                      {t(...(SCHEDULE_STATUS_LABELS[st] || [st]))}
                      {courant && <span className="ml-2 text-[10px] uppercase tracking-wide">{t('actuel', 'current', 'actual')}</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {interdit ? t(...SCHEDULE_REFUS_LABELS.exemption_interdite)
                        : t(...(SCHEDULE_STATUS_HINTS[st] || ['', '', '']))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {catModal && <FeeCatalogItemModal item={catModal.item} classes={classes} academicYear={year} onSave={saveCat} onClose={() => setCatModal(null)} />}
    </Wrapper>
  );
}
