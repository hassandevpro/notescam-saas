// ENCAISSEMENT D'UN SERVICE — cantine, transport, internat.
//
// ── TROIS ÉTAPES, DANS L'ORDRE OÙ LA SECRÉTAIRE PENSE ──────────────────────
//
// Consigne du responsable (2026-10-31) : « une secrétaire novice encaisse un
// paiement et imprime le reçu en moins de 30 secondes sans explication ». La
// fenêtre suit donc l'ordre du guichet, et pas celui de la base :
//
//   1. QUI paie — pré-rempli quand on vient de la ligne d'un élève, sinon une
//      recherche rapide parmi les abonnés qui doivent quelque chose ;
//   2. QUELS MOIS — des cases à cocher, le plus ancien mois dû coché d'office,
//      parce que c'est celui qu'on règle neuf fois sur dix ;
//   3. COMBIEN — pré-rempli avec le total des mois cochés, modifiable pour un
//      versement partiel, plus la date et le mode.
//
// Référence et payeur sont réels mais rares : ils vivent sous « Plus d'options »
// pour que l'écran tienne en un regard.
//
// Une PHRASE résume avant de valider : « 10 000 XAF pour Octobre 2026 → il
// restera 5 000 XAF ». Le détail de l'imputation reste affiché en dessous, mais
// la phrase suffit à décider, et c'est elle qu'on lit.
//
// ── CE QUE CET ÉCRAN NE FAIT TOUJOURS PAS ──────────────────────────────────
//
//  • il n'invente aucune table. Le versement part dans `fee_payments`, comme
//    celui de la scolarité, avec son `fee_schedule_item_id` — l'imputation AU
//    MOIS existe déjà. Une table `service_payments` séparée aurait scindé la
//    caisse : l'arrêté, le journal et `cashBookEngine` ne verraient plus
//    l'argent des services, et il faudrait un SECOND compteur de reçus, donc
//    deux séries, donc le trou que la numérotation continue sert à rendre
//    visible ;
//  • il n'invente aucune règle de répartition. `repartitionVersement` impute
//    du mois le plus ancien au plus récent parmi LES MOIS COCHÉS, s'arrête net
//    quand l'école interdit le partiel, et rend le `reste` non imputé plutôt
//    que de l'encaisser sur rien ;
//  • il n'invente aucun reçu. `printReceiptDuo` sort déjà l'A4 à deux volets.
//
// UN VERSEMENT COUVRANT TROIS MOIS PRODUIT TROIS ÉCRITURES, pas une. C'est ce
// qui permet d'annuler février seul. Le reçu, lui, reste UNIQUE : il porte les
// trois mois.
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useMoney } from '../../lib/useMoney';
import { useSchoolStore } from '../../store/schoolStore';
import { useAuthStore } from '../../store/authStore';
import { repartitionVersement, soldeEcheance, libelleEcheance } from '../../lib/feeScheduleEngine';
import { motPeriode } from '../../lib/cantineEngine';
import { paidForSchedule } from '../../lib/feeScheduleService';
import { printReceiptDuo } from '../../lib/receiptDoc';
import { montantEnLettres } from '../../lib/montantEnLettres';

// Les modes d'encaissement réellement en usage. Volontairement court : une liste
// qu'on ne lit pas est une liste dont on coche la première entrée.
export const MODES_PAIEMENT = [
  { key: 'especes',      fr: 'Espèces',      en: 'Cash',          es: 'Efectivo' },
  { key: 'mobile_money', fr: 'Mobile Money', en: 'Mobile Money',  es: 'Mobile Money' },
  { key: 'virement',     fr: 'Virement',     en: 'Bank transfer', es: 'Transferencia' },
  { key: 'cheque',       fr: 'Chèque',       en: 'Cheque',        es: 'Cheque' },
  { key: 'autre',        fr: 'Autre',        en: 'Other',         es: 'Otro' },
];

const aujourdHui = () => new Date().toISOString().slice(0, 10);

export default function EncaissementServiceModal({
  service, eleve, lignes = [], payments = [], school, onClose, onDone,
  // Mode « libre » : on vient du bouton principal, aucun élève n'est choisi.
  // `abonnes` sert la recherche, `lignesDe` donne les échéances du retenu.
  abonnes = [], lignesDe = null,
}) {
  const t = useT();
  const money = useMoney();
  const addPayment = useSchoolStore((s) => s.addPayment);
  const fullName = useAuthStore((s) => s.fullName);

  // Le service dit son mot : on ne demande pas « quels mois ? » devant trois
  // trimestres. Une hésitation au guichet est une erreur d’imputation en
  // puissance.
  const mot = motPeriode(service, t);

  const libre = !eleve || eleve.libre === true;
  const [choisi, setChoisi] = useState(libre ? null : eleve);
  const [recherche, setRecherche] = useState('');

  const [moisCoches, setMoisCoches] = useState(() => new Set());
  const [montant, setMontant] = useState('');
  const [montantTouche, setMontantTouche] = useState(false);
  const [date, setDate] = useState(aujourdHui());
  const [mode, setMode] = useState('especes');
  const [reference, setReference] = useState('');
  const [payeur, setPayeur] = useState('');
  const [optionsOuvertes, setOptionsOuvertes] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(null);

  // Les échéances du retenu : celles passées en props, ou celles que le parent
  // sait retrouver quand l'élève vient d'être choisi dans la recherche.
  const lignesDuRetenu = useMemo(() => {
    if (!choisi) return [];
    if (!libre) return lignes;
    return lignesDe ? lignesDe(choisi.student_id || choisi.id) : [];
  }, [choisi, libre, lignes, lignesDe]);

  // Le payé se CALCULE à partir des versements — il n'est jamais stocké. Les
  // contre-passations (montants négatifs) y entrent telles quelles, de sorte
  // qu'un mois annulé redevient dû sans traitement particulier.
  const lignesAvecPaye = useMemo(() => lignesDuRetenu.map((l) => ({
    ...l, amount_paid: paidForSchedule(l.id, payments),
  })), [lignesDuRetenu, payments]);

  const impayees = useMemo(
    () => lignesAvecPaye.filter((l) => soldeEcheance(l) > 0)
      .sort((a, b) => String(a.period_key).localeCompare(String(b.period_key))),
    [lignesAvecPaye],
  );

  const resteTotal = useMemo(
    () => impayees.reduce((s, l) => s + soldeEcheance(l), 0), [impayees]);

  // LE PROCHAIN MOIS NON PAYÉ EST COCHÉ D'OFFICE. C'est le geste de neuf
  // encaissements sur dix ; le proposer coché épargne un clic et, surtout, évite
  // qu'on coche un mois récent en laissant traîner une dette ancienne.
  useEffect(() => {
    if (!impayees.length) { setMoisCoches(new Set()); return; }
    setMoisCoches(new Set([impayees[0].period_key]));
    setMontantTouche(false);
  }, [choisi, impayees.length]);

  const retenues = useMemo(
    () => impayees.filter((l) => moisCoches.has(l.period_key)), [impayees, moisCoches]);

  const duCoche = useMemo(
    () => retenues.reduce((s, l) => s + soldeEcheance(l), 0), [retenues]);

  // Le montant SUIT les cases cochées, jusqu'à ce que la secrétaire le corrige
  // elle-même — après quoi on ne le lui reprend plus.
  useEffect(() => {
    if (!montantTouche) setMontant(duCoche > 0 ? String(duCoche) : '');
  }, [duCoche, montantTouche]);

  const saisi = Math.max(0, Math.floor(Number(montant) || 0));
  const allowPartial = service?.allow_partial !== 0 && service?.allow_partial !== false;

  // L'imputation est calculée sur LES MOIS COCHÉS, du plus ancien au plus
  // récent. Une secrétaire qui découvre après coup que ses 20 000 ont soldé
  // octobre et entamé novembre ne peut plus rien corriger sans contre-passation.
  const apercu = useMemo(() => {
    if (saisi <= 0 || !retenues.length) return { affectations: [], affecte: 0, reste: 0 };
    return repartitionVersement(retenues, saisi, { allowPartial });
  }, [retenues, saisi, allowPartial]);

  const depassement = saisi > duCoche;
  const nonImpute = apercu.reste > 0;
  const resteApres = Math.max(0, resteTotal - apercu.affecte);

  // LA PHRASE. Elle dit le montant, les mois, et ce qu'il restera — les trois
  // choses qu'on vérifie à voix haute devant le parent.
  const phrase = useMemo(() => {
    if (saisi <= 0 || !retenues.length) return null;
    const noms = retenues.map((l) => libelleEcheance(l)).join(', ');
    return t(
      `${money(saisi)} pour ${noms} → il restera ${money(resteApres)}`,
      `${money(saisi)} for ${noms} → ${money(resteApres)} will remain`,
      `${money(saisi)} para ${noms} → quedarán ${money(resteApres)}`);
  }, [saisi, retenues, resteApres, money, t]);

  const candidats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const avecDette = (abonnes || []).filter((a) => a.reste > 0);
    if (!q) return avecDette.slice(0, 8);
    return avecDette.filter((a) => `${a.name} ${a.matricule || ''} ${a.className || ''}`
      .toLowerCase().includes(q)).slice(0, 8);
  }, [abonnes, recherche]);

  const basculerMois = (cle) => {
    setMoisCoches((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle); else n.add(cle);
      return n;
    });
    setMontantTouche(false);
  };

  const valider = async (e) => {
    e.preventDefault();
    setErreur(null);
    if (!choisi) { setErreur(t('Choisissez un élève.', 'Choose a student.', 'Elija un alumno.')); return; }
    if (!retenues.length) { setErreur(t(`Cochez au moins un ${mot.un}.`, `Tick at least one ${mot.un}.`, `Marque al menos un ${mot.un}.`)); return; }
    if (saisi <= 0) { setErreur(t('Montant invalide.', 'Invalid amount.', 'Importe no válido.')); return; }
    if (depassement) {
      setErreur(t(
        `Le montant dépasse le dû des mois cochés (${money(duCoche)}).`,
        `Amount exceeds the balance of the ticked months (${money(duCoche)}).`,
        `El importe supera el saldo de los meses marcados (${money(duCoche)}).`));
      return;
    }
    if (!apercu.affectations.length) {
      setErreur(t('Rien à imputer.', 'Nothing to allocate.', 'Nada que imputar.'));
      return;
    }
    if (nonImpute) {
      // Jamais encaissé en douce sur rien : on refuse plutôt que d'absorber la
      // différence. C'est le cas « tout ou rien » d'une école qui interdit le
      // paiement partiel, et le message doit le dire.
      setErreur(t(
        `${money(apercu.reste)} ne peuvent être imputés sur aucun mois entier — l’école interdit le paiement partiel.`,
        `${money(apercu.reste)} cannot be allocated to a full month — partial payment is disabled.`,
        `${money(apercu.reste)} no pueden imputarse — el pago parcial está desactivado.`));
      return;
    }

    setOccupe(true);
    const faits = [];
    for (const a of apercu.affectations) {
      const verse = await addPayment(choisi.student_id || choisi.id, {
        amount: a.amount, date,
        note: `${service?.name || ''} — ${libelleEcheance(a)}`.trim(),
        student_fee_item_id: ligne0(lignesDuRetenu, a.schedule_id),
        fee_schedule_item_id: a.schedule_id,
        method: mode, payer_name: payeur || null, reference: reference || null,
      });
      if (verse) faits.push({ ...a, payment: verse });
    }
    setOccupe(false);

    if (!faits.length) {
      setErreur(t('Encaissement refusé.', 'Payment refused.', 'Cobro rechazado.'));
      return;
    }
    if (faits.length < apercu.affectations.length) {
      // Dit, et non tu : un versement partiellement écrit doit se voir tout de
      // suite, pendant que le parent est encore au guichet.
      setErreur(t(
        `Attention : ${faits.length} mois sur ${apercu.affectations.length} ont été enregistrés.`,
        `Warning: ${faits.length} of ${apercu.affectations.length} months were saved.`,
        `Atención: ${faits.length} de ${apercu.affectations.length} meses guardados.`));
    }

    imprimer(faits);
    onDone?.(faits);
  };

  // Le reçu porte TOUS les mois couverts, et le total versé ce jour. Il fige ce
  // qui est affiché : un reçu réimprimé dans six mois doit dire la même chose,
  // même si la classe de l'élève ou le tarif ont changé depuis.
  const imprimer = (faits) => {
    const totalVerse = faits.reduce((s, f) => s + f.amount, 0);
    const dejaVerse = lignesAvecPaye.reduce((s, l) => s + (l.amount_paid || 0), 0);
    printReceiptDuo({
      school,
      student: { name: choisi.name, matricule: choisi.matricule },
      className: choisi.className,
      lang: school?.language,
      designation: service?.name || t('Service', 'Service', 'Servicio'),
      periods: faits.map((f) => libelleEcheance(f)).join(', '),
      versement: totalVerse,
      newTotal: dejaVerse + totalVerse,
      fraisAnnuels: lignesAvecPaye.reduce((s, l) => s + (Number(l.amount_due) || 0), 0),
      date,
      mode,
      cashierName: fullName,
      payment: faits[0]?.payment || null,
    });
  };

  const Etape = ({ n, titre, children }) => (
    <section className="mb-3">
      <h4 className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 mb-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200">
          {n}
        </span>
        {titre}
      </h4>
      {children}
    </section>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={valider} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-4 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <h3 className="font-bold text-gray-900 dark:text-slate-100 mb-3">
          {t('Encaisser un paiement', 'Collect a payment', 'Cobrar un pago')}
          {service?.name ? ` — ${service.name}` : ''}
        </h3>

        {/* ── 1. QUI PAIE ────────────────────────────────────────────────── */}
        <Etape n="1" titre={t('Élève', 'Student', 'Alumno')}>
          {choisi ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <b>{choisi.name}</b>
                <span className="text-slate-500">
                  {choisi.className ? ` · ${choisi.className}` : ''}
                  {choisi.matricule ? ` · ${choisi.matricule}` : ''}
                </span>
              </span>
              {libre && (
                <button
                  type="button" onClick={() => { setChoisi(null); setRecherche(''); }}
                  className="text-xs underline text-slate-500"
                >
                  {t('Changer', 'Change', 'Cambiar')}
                </button>
              )}
            </div>
          ) : (
            <>
              <input
                autoFocus type="search" value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t('Nom, matricule ou classe', 'Name, ID or class', 'Nombre, matrícula o clase')}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
              />
              <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60">
                {candidats.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-slate-400">
                    {t('Aucun élève abonné ne doit quelque chose.',
                       'No subscribed student owes anything.',
                       'Ningún alumno suscrito debe nada.')}
                  </li>
                ) : candidats.map((a) => (
                  <li key={a.student_id}>
                    <button
                      type="button" onClick={() => setChoisi(a)}
                      className="w-full text-left min-h-[44px] px-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0 truncate">
                        {a.name}
                        <span className="block text-[11px] text-slate-500">{a.className || '—'}</span>
                      </span>
                      <span className="tabular-nums whitespace-nowrap text-xs font-semibold">
                        {money(a.reste)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Etape>

        {choisi && resteTotal <= 0 && (
          <p className="text-sm text-slate-500 mb-3">
            {t('Aucun mois dû pour ce service : rien à encaisser.',
               'No month due for this service: nothing to collect.',
               'Ningún mes pendiente.')}
          </p>
        )}

        {choisi && resteTotal > 0 && (
          <>
            {/* ── 2. QUELS MOIS ──────────────────────────────────────────── */}
            <Etape n="2" titre={mot.aPayer}>
              <ul className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/60 max-h-44 overflow-y-auto">
                {impayees.map((l) => {
                  const du = soldeEcheance(l);
                  const entame = (l.amount_paid || 0) > 0;
                  return (
                    <li key={l.id}>
                      <label className="flex items-center gap-2.5 px-3 py-2 min-h-[44px] cursor-pointer text-sm">
                        <input
                          type="checkbox" className="accent-brand-600 w-4 h-4"
                          checked={moisCoches.has(l.period_key)}
                          onChange={() => basculerMois(l.period_key)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {libelleEcheance(l)}
                          {entame && (
                            <span className="ml-1.5 text-[11px] text-amber-700">
                              {t('déjà entamé', 'already part-paid', 'ya iniciado')}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums whitespace-nowrap font-semibold">{money(du)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Etape>

            {/* ── 3. COMBIEN ─────────────────────────────────────────────── */}
            <Etape n="3" titre={t('Montant versé', 'Amount paid', 'Importe')}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <label className="text-sm">
                  <span className="block text-[11px] text-slate-500 mb-1">
                    {t('Montant', 'Amount', 'Importe')}
                  </span>
                  <input
                    type="number" min="1" step="1" value={montant} required
                    onChange={(e) => { setMontant(e.target.value); setMontantTouche(true); }}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-right tabular-nums"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-[11px] text-slate-500 mb-1">{t('Date', 'Date', 'Fecha')}</span>
                  <input
                    type="date" value={date} required
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3"
                  />
                </label>
                <label className="text-sm col-span-2 sm:col-span-1">
                  <span className="block text-[11px] text-slate-500 mb-1">{t('Mode', 'Method', 'Modo')}</span>
                  <select
                    value={mode} onChange={(e) => setMode(e.target.value)}
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3"
                  >
                    {MODES_PAIEMENT.map((m) => <option key={m.key} value={m.key}>{t(m.fr, m.en, m.es)}</option>)}
                  </select>
                </label>
              </div>

              <button
                type="button" onClick={() => setOptionsOuvertes((v) => !v)}
                className="mt-2 text-xs underline text-slate-500"
              >
                {optionsOuvertes
                  ? t('Masquer les options', 'Hide options', 'Ocultar opciones')
                  : t('Plus d’options (référence, payeur)', 'More options (reference, payer)', 'Más opciones')}
              </button>
              {optionsOuvertes && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-sm">
                    <span className="block text-[11px] text-slate-500 mb-1">
                      {t('Référence', 'Reference', 'Referencia')}
                    </span>
                    <input
                      value={reference} onChange={(e) => setReference(e.target.value)}
                      placeholder={t('n° MoMo, chèque…', 'MoMo no., cheque…', 'n.º MoMo…')}
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="block text-[11px] text-slate-500 mb-1">
                      {t('Payeur', 'Payer', 'Pagador')}
                    </span>
                    <input
                      value={payeur} onChange={(e) => setPayeur(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3"
                    />
                  </label>
                </div>
              )}
            </Etape>

            {/* LA PHRASE, puis le détail pour qui veut vérifier. */}
            {phrase && !depassement && (
              <p className="mb-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {phrase}
              </p>
            )}

            {apercu.affectations.length > 1 && (
              <details className="mb-2">
                <summary className="text-xs underline text-slate-500 cursor-pointer">
                  {t('Détail de l’imputation', 'Allocation detail', 'Detalle de la imputación')}
                </summary>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {apercu.affectations.map((a) => {
                    const l = retenues.find((x) => x.id === a.schedule_id);
                    const du = l ? soldeEcheance(l) : a.amount;
                    const solde = a.amount >= du;
                    return (
                      <li key={a.schedule_id} className="flex justify-between gap-2">
                        <span>{libelleEcheance(a)}</span>
                        <span className={`tabular-nums whitespace-nowrap ${solde ? 'text-emerald-700 font-semibold' : 'text-amber-700'}`}>
                          {money(a.amount)} / {money(du)}
                          {' '}{solde ? t('soldé', 'settled', 'saldado') : t('partiel', 'partial', 'parcial')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {saisi > 0 && (
              <p className="mb-2 text-[11px] italic text-slate-500">
                {montantEnLettres(saisi, { devise: school?.currency || 'XAF' })}
              </p>
            )}

            {depassement && (
              <p className="mb-2 text-sm text-rose-600">
                {t('Le montant dépasse le dû des mois cochés',
                   'Amount exceeds the balance of the ticked months',
                   'Supera el saldo de los meses marcados')}
                {' '}({money(duCoche)}).
              </p>
            )}
          </>
        )}

        {erreur && <p className="mb-2 text-sm text-rose-600">{erreur}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 px-3 text-sm">
            {t('Fermer', 'Close', 'Cerrar')}
          </button>
          <button
            type="submit"
            disabled={occupe || !choisi || saisi <= 0 || depassement || !retenues.length}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {t('Enregistrer et imprimer le reçu', 'Save and print the receipt', 'Guardar e imprimir el recibo')}
          </button>
        </div>
      </form>
    </div>
  );
}

// La souscription dont relève une échéance : le versement porte les DEUX liens,
// comme ceux de la scolarité, pour qu'un relevé par frais reste possible.
function ligne0(lignes, scheduleId) {
  return lignes.find((l) => l.id === scheduleId)?.student_fee_item_id || null;
}
