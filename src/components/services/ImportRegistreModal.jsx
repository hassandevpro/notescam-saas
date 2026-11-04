// IMPORTER UN REGISTRE EXCEL DANS UN SERVICE — quatre écrans, une seule écriture
//
// ── D'OÙ VIENT CET ÉCRAN ───────────────────────────────────────────────────
//
// THE GENIUS tient son transport dans un classeur Excel : trois tableaux sur
// une feuille, 211 élèves, treize tarifs différents selon la résidence, les
// versements par trimestre, et aucune date de versement. Jusqu'ici, reprendre
// ça voulait dire ressaisir 211 lignes à la main.
//
// ── POURQUOI QUATRE ÉTAPES, ET PAS UN BOUTON « IMPORTER » ──────────────────
//
// Un import qui écrit directement est un import qu'on ne peut pas relire. Or
// ici on écrit des abonnements à un service PAYANT : une ligne de travers, et
// un parent reçoit une facture qui n'est pas la sienne. Les quatre écrans
// séparent donc LIRE, COMPRENDRE, VÉRIFIER, puis ÉCRIRE — et rien ne part
// avant le dernier clic, qui annonce ses chiffres exacts.
//
//   1. LE FICHIER   — on choisit le classeur, et la feuille s'il y en a plusieurs.
//   2. CE QU'IL DIT — ce que le lecteur a compris, recoupé sur les totaux de
//      l'école elle-même. Si les totaux ne tombent pas, on le voit ICI, avant
//      d'avoir rien écrit.
//   3. LE PLAN      — qui serait abonné, et surtout qui ne le serait PAS : les
//      élèves introuvables en base, les homonymes non départagés, les lignes
//      que le fichier contredit. Cette liste s'exporte : c'est elle qu'on
//      envoie à l'école, et c'est trois lignes, pas un questionnaire.
//   4. L'ÉCRITURE   — annoncée, puis rapportée telle qu'elle s'est passée.
//
// ── CE QUE CET IMPORT N'ÉCRIT PAS, ET POURQUOI ─────────────────────────────
//
// Il n'écrit **ni échéance ni versement**, par défaut.
//
// Les versements : le classeur ne porte aucune date. Les reconstituer à une
// date choisie les ferait entrer dans l'arrêté de caisse d'un caissier, qui
// réclamerait alors des millions en espèces dans son tiroir. Reprendre un
// historique est une opération distincte, qui se décide avec l'école.
//
// Les échéances : une échéance est une CRÉANCE. Le fichier donne un montant
// ANNUEL qui, chez eux, vaut huit mois — lequel ne se découpe pas en trois
// trimestres entiers. Écrire un découpage inventé, c'est afficher des
// trop-perçus et des impayés qui n'existent pas. L'import pose donc
// l'ABONNEMENT, avec son tarif propre et sa résidence ; puis l'école coche les
// mois qu'elle veut facturer, et c'est le moteur habituel qui les pose — celui
// qui sait déjà refuser un mois antérieur au début du service.
import { useMemo, useRef, useState } from 'react';
import { EXCEL_ACCEPT, isExcelFile, excelOnlyMessage, readWorkbookAoa, downloadExcelSheets } from '../../lib/exportCsv.js';
import { lireRegistre, resumeRegistre } from '../../lib/registreServiceImport.js';
import { planifierReprise, trancherEcriture } from '../../lib/registreServicePlan.js';
import { rapprocherPlan } from '../../lib/rapprochementEleves.js';
import { estUnExport, MESSAGE_EXPORT } from '../../lib/serviceImportEngine.js';

const ETIQUETTE_REJET = {
  absent: { fr: 'Introuvable en base', en: 'Not found', es: 'No encontrado' },
  ambigu: { fr: 'Homonymes — à départager', en: 'Homonyms — to resolve', es: 'Homónimos' },
  deja_pris: { fr: 'Déjà rapproché à une autre ligne', en: 'Already matched', es: 'Ya emparejado' },
  deja_abonne: { fr: 'Déjà abonné à ce service', en: 'Already subscribed', es: 'Ya suscrito' },
  ecarte: { fr: 'Écarté par le plan', en: 'Excluded by the plan', es: 'Excluido' },
};

const TON_REJET = {
  absent: 'bg-rose-50 text-rose-700 border-rose-200',
  ambigu: 'bg-amber-50 text-amber-800 border-amber-200',
  deja_pris: 'bg-amber-50 text-amber-800 border-amber-200',
  deja_abonne: 'bg-slate-100 text-slate-600 border-slate-200',
  ecarte: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function ImportRegistreModal({
  service, schoolId, year, eleves = [], abonnesExistants = [],
  mois = [], onEcrire, onFerme, t, money,
}) {
  const [etape, setEtape] = useState(1);
  const [fichier, setFichier] = useState(null);
  const [feuilles, setFeuilles] = useState([]);
  const [feuille, setFeuille] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [moisChoisis, setMoisChoisis] = useState(new Set());
  const [rapport, setRapport] = useState(null);
  const champ = useRef(null);

  const lang = (s) => (ETIQUETTE_REJET[s] || {})[t('fr', 'en', 'es')] || (ETIQUETTE_REJET[s] || {}).fr || s;

  // ── LECTURE ──────────────────────────────────────────────────────────────
  const choisirFichier = async (f) => {
    setErreur('');
    if (!f) return;
    if (!isExcelFile(f)) { setErreur(excelOnlyMessage()); return; }
    setOccupe(true);
    const { sheets, error } = await readWorkbookAoa(f);
    setOccupe(false);
    if (error) { setErreur(error); return; }
    if (!sheets.length) { setErreur(t('Ce classeur ne contient aucune feuille.', 'This workbook has no sheet.', 'Sin hojas.')); return; }
    // Un EXPORT de registre n'est pas un fichier à importer : le dire d'emblée,
    // au lieu du « aucune ligne d'en-tête reconnue » qui laisse l'école chercher.
    if (sheets.some((s) => estUnExport(s.raw))) {
      setErreur(t(MESSAGE_EXPORT,
        'This file is an export, not an import template. Use “Download the import template” in the menu, copy the data into it, then use “Import with the template”.',
        MESSAGE_EXPORT));
      return;
    }
    setFichier(f);
    setFeuilles(sheets);
    // La feuille retenue est celle où le lecteur reconnaît LE PLUS d'élèves, et
    // non la première : les écoles laissent souvent une feuille « Modèle » ou
    // « Tarifs » devant la vraie.
    const meilleure = sheets
      .map((s) => ({ nom: s.name, n: lireRegistre(s.raw).eleves.length }))
      .sort((a, b) => b.n - a.n)[0];
    setFeuille(meilleure?.n > 0 ? meilleure.nom : sheets[0].name);
    setEtape(2);
  };

  const aoa = useMemo(() => feuilles.find((s) => s.name === feuille)?.raw || [], [feuilles, feuille]);
  const lecture = useMemo(() => (aoa.length ? lireRegistre(aoa) : null), [aoa]);
  const resume = useMemo(() => (lecture ? resumeRegistre(lecture) : null), [lecture]);

  // ── LE PLAN ──────────────────────────────────────────────────────────────
  //
  // `portee: 'annee_courante'` : les abonnements seuls, sans versement, et les
  // élèves marqués SORTIS dans le fichier restent dehors — les réabonner leur
  // ferait devoir une année de service qu'ils ne prennent pas.
  const plan = useMemo(() => (lecture ? planifierReprise({
    lecture, serviceNom: service?.name || 'Service', academicYear: year,
    portee: 'annee_courante',
  }) : null), [lecture, service?.name, year]);

  const rappro = useMemo(() => (plan ? rapprocherPlan(plan.aEcrire, eleves) : null), [plan, eleves]);

  // ── LA PREUVE DE LECTURE ─────────────────────────────────────────────────
  //
  // L'école écrit ses propres lignes TOTAUX au bas de chaque tableau. Si la
  // somme des lignes lues tombe dessus au franc près, le lecteur n'a sauté
  // aucune ligne — et c'est la seule preuve indépendante dont on dispose, car
  // elle vient du fichier, pas de nous. Le lecteur lève `total_tableau` quand
  // elle ne tombe pas ; `null` signifie que l'école n'a pas écrit de totaux,
  // et on ne prétend alors ni l'un ni l'autre.
  const totauxRecoupes = useMemo(() => {
    const avecTotaux = (resume?.parTableau || []).filter((tb) => tb.totauxFeuille);
    if (!avecTotaux.length) return null;
    return !(resume?.anomalies?.total_tableau > 0);
  }, [resume]);

  // Qui part vraiment, et qui ne part pas — décidé dans le moteur, qui porte
  // la règle anti-doublon et son banc. L'écran se contente d'afficher.
  const tranche = useMemo(
    () => trancherEcriture({ plan, rappro, dejaAbonnes: abonnesExistants }),
    [plan, rappro, abonnesExistants],
  );
  const prets = tranche.prets;
  const rejets = tranche.rejets;

  const exporterRejets = () => {
    const entete = [[t('Ligne', 'Row', 'Fila'), t('Nom (fichier)', 'Name (file)', 'Nombre'),
      t('Classe (fichier)', 'Class (file)', 'Clase'), t('Tarif/mois', 'Rate/month', 'Tarifa'),
      t('Annuel', 'Yearly', 'Anual'), t('Motif', 'Reason', 'Motivo'),
      t('À faire', 'What to do', 'Acción')]];
    const lignes = rejets.map((r) => [
      r.source?.ligne ?? '', r.nom || '', r.classe || '',
      r.tarif || '', r.annuel || '', lang(r.etat), r.raison || '',
    ]);
    downloadExcelSheets(
      `rejets_${(service?.name || 'service').replace(/\W+/g, '_')}_${year}.xlsx`,
      [{ name: t('À trancher', 'To resolve', 'Por resolver'), rows: [...entete, ...lignes] }],
    );
  };

  // ── L'ÉCRITURE ───────────────────────────────────────────────────────────
  const ecrire = async () => {
    if (!prets.length || !onEcrire) return;
    setOccupe(true);
    setErreur('');
    const r = await onEcrire({ prets, mois: [...moisChoisis] }).catch((e) => ({ erreur: String(e?.message || e) }));
    setOccupe(false);
    if (r?.erreur) { setErreur(r.erreur); return; }
    setRapport(r);
    setEtape(4);
  };

  const Pied = ({ children }) => (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">{children}</div>
  );
  const btn = 'min-h-[44px] rounded-lg px-4 text-sm font-semibold';
  const btnPlein = `${btn} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50`;
  const btnVide = `${btn} border border-slate-300 dark:border-slate-600`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {t('Importer un registre Excel', 'Import an Excel register', 'Importar un registro Excel')}
            </h3>
            <p className="text-xs text-slate-500">
              {service?.name} · {year} · {t('étape', 'step', 'paso')} {etape}/4
            </p>
          </div>
          <button type="button" onClick={onFerme} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {erreur && <p className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{erreur}</p>}

        {/* ── 1. LE FICHIER ─────────────────────────────────────────────── */}
        {etape === 1 && (
          <div>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
              {t('Choisissez le classeur de l’école. Rien ne sera écrit : vous verrez d’abord ce que le fichier dit, puis ce qui serait abonné.',
                 'Pick the school’s workbook. Nothing is written yet: you will first see what the file says, then what would be subscribed.',
                 'Elija el libro de la escuela. Nada se escribirá todavía.')}
            </p>
            <input
              ref={champ} type="file" accept={EXCEL_ACCEPT}
              onChange={(e) => choisirFichier(e.target.files?.[0])}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm"
            />
            {occupe && <p className="mt-2 text-sm text-slate-500">{t('Lecture…', 'Reading…', 'Leyendo…')}</p>}
            <p className="mt-3 text-xs text-slate-500">
              {t('Le lecteur reconnaît seul les colonnes (nom, classe, tarif, annuel, trimestres, observations) et les lignes de totaux. Aucun modèle à remplir.',
                 'Columns and total rows are detected automatically. No template to fill in.',
                 'Las columnas se detectan automáticamente.')}
            </p>
          </div>
        )}

        {/* ── 2. CE QUE LE FICHIER DIT ──────────────────────────────────── */}
        {etape === 2 && lecture && (
          <div>
            {feuilles.length > 1 && (
              <label className="mb-3 block text-sm">
                <span className="mr-2 text-slate-600 dark:text-slate-300">{t('Feuille', 'Sheet', 'Hoja')}</span>
                <select
                  value={feuille} onChange={(e) => setFeuille(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                >
                  {feuilles.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} — {lireRegistre(s.raw).eleves.length} {t('élèves', 'students', 'alumnos')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t('Élèves lus', 'Students read', 'Alumnos'), lecture.eleves.length],
                [t('Tarifs distincts', 'Distinct rates', 'Tarifas'), new Set(lecture.eleves.map((e) => e.tarif)).size],
                [t('Attendu', 'Expected', 'Esperado'), money(lecture.eleves.reduce((s, e) => s + (e.annuel || 0), 0))],
                [t('Encaissé (fichier)', 'Collected (file)', 'Cobrado'), money(lecture.eleves.reduce((s, e) => s + (e.paye || 0), 0))],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {/* Les totaux de l'école servent de preuve de lecture : s'ils
                tombent au franc près, le lecteur n'a rien perdu en route. */}
            {totauxRecoupes != null && (
              <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                totauxRecoupes
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {totauxRecoupes
                  ? t('Les lignes TOTAUX du fichier tombent au franc près : la lecture est complète.',
                      'The file’s TOTAL rows match to the franc: nothing was lost.',
                      'Las filas TOTAL coinciden exactamente.')
                  : t('Attention : les lignes TOTAUX du fichier ne tombent pas. Vérifiez la feuille choisie avant d’écrire.',
                      'Careful: the file’s TOTAL rows do not match. Check the chosen sheet.',
                      'Cuidado: las filas TOTAL no coinciden.')}
              </p>
            )}
            {lecture.anomalies.length > 0 && (
              <details className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {lecture.anomalies.length} {t('signalement(s) de lecture', 'reading notice(s)', 'avisos')}
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {lecture.anomalies.slice(0, 40).map((a, i) => (
                    <li key={i}>L{a.ligne} — {a.message}</li>
                  ))}
                  {lecture.anomalies.length > 40 && <li>…</li>}
                </ul>
              </details>
            )}
            <Pied>
              <button type="button" onClick={() => setEtape(1)} className={btnVide}>{t('Retour', 'Back', 'Atrás')}</button>
              <button type="button" onClick={() => setEtape(3)} className={btnPlein} disabled={!lecture.eleves.length}>
                {t('Voir le plan', 'See the plan', 'Ver el plan')}
              </button>
            </Pied>
          </div>
        )}

        {/* ── 3. LE PLAN ────────────────────────────────────────────────── */}
        {etape === 3 && plan && rappro && (
          <div>
            <p className="mb-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
              <strong>{prets.length}</strong> {t('élève(s) seraient abonnés à', 'student(s) would be subscribed to', 'alumno(s) suscritos a')}
              {' '}<strong>{service?.name}</strong> {t('pour', 'for', 'para')} {year}
              {t(', chacun avec son tarif propre. Aucune échéance et aucun versement ne sont écrits.',
                 ', each with its own rate. No instalment and no payment is written.',
                 ', cada uno con su tarifa. Ningún plazo ni pago se escribe.')}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t('À abonner', 'To subscribe', 'A suscribir'), prets.length, 'text-emerald-700'],
                [t('À trancher', 'To resolve', 'Por resolver'), rejets.length, 'text-amber-800'],
                [t('Sortis (non réabonnés)', 'Left (not re-subscribed)', 'Salidos'), (plan.ecartes || []).filter((x) => x.sortant).length, 'text-slate-600'],
                [t('Classe divergente', 'Class differs', 'Clase difiere'), rappro.resume.classeDiverge, 'text-slate-600'],
              ].map(([k, v, ton]) => (
                <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className={`text-sm font-semibold ${ton}`}>{v}</dd>
                </div>
              ))}
            </div>

            {rejets.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-900">
                    {t('Ces lignes ne seront pas écrites', 'These rows will not be written', 'Estas filas no se escribirán')}
                  </p>
                  <button type="button" onClick={exporterRejets} className={`${btnVide} bg-white`}>
                    {t('Exporter la liste (Excel)', 'Export the list (Excel)', 'Exportar (Excel)')}
                  </button>
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {rejets.slice(0, 60).map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 ${TON_REJET[r.etat] || ''}`}>{lang(r.etat)}</span>
                      <span className="font-medium">{r.nom}</span>
                      <span className="text-slate-500">{r.classe || '—'}</span>
                      {r.raison && <span className="text-slate-600">— {r.raison}</span>}
                    </li>
                  ))}
                  {rejets.length > 60 && <li className="text-slate-500">… {rejets.length - 60} {t('autres', 'more', 'más')}</li>}
                </ul>
                <p className="mt-2 text-xs text-amber-900">
                  {t('Un homonyme n’est jamais rapproché au hasard : l’école reconnaît ses élèves en une seconde, un algorithme qui parie se trompe en silence.',
                     'A homonym is never matched at random: the school recognises its pupils instantly, a guessing algorithm fails silently.',
                     'Un homónimo nunca se empareja al azar.')}
                </p>
              </div>
            )}

            {/* La facturation reste un CHOIX de l'école, et elle passe par le
                moteur habituel — celui qui refuse déjà un mois antérieur au
                début du service. Rien coché = aucune créance créée. */}
            {mois.length > 0 && (
              <details className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t('Facturer des mois tout de suite ?', 'Bill months right away?', '¿Facturar meses?')}
                  <span className="ml-2 font-normal text-slate-500">
                    {moisChoisis.size
                      ? `${moisChoisis.size} ${t('mois coché(s)', 'month(s) ticked', 'mes(es)')}`
                      : t('aucun — recommandé', 'none — recommended', 'ninguno')}
                  </span>
                </summary>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {t('Le fichier ne dit pas comment l’année se découpe : son montant annuel vaut huit mois chez l’école, qui ne tombent pas en trois trimestres entiers. Laissez vide et posez les échéances depuis la grille, quand l’école aura confirmé ses tarifs.',
                     'The file does not say how the year splits. Leave this empty and add instalments from the grid once the school confirms its rates.',
                     'Deje vacío y añada los plazos desde la cuadrícula.')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mois.map((m) => (
                    <label key={m.period_key} className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs">
                      <input
                        type="checkbox" checked={moisChoisis.has(m.period_key)}
                        onChange={() => setMoisChoisis((prev) => {
                          const n = new Set(prev);
                          if (n.has(m.period_key)) n.delete(m.period_key); else n.add(m.period_key);
                          return n;
                        })}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </details>
            )}

            <Pied>
              <button type="button" onClick={() => setEtape(2)} className={btnVide}>{t('Retour', 'Back', 'Atrás')}</button>
              <button type="button" onClick={ecrire} className={btnPlein} disabled={occupe || !prets.length}>
                {occupe
                  ? t('Écriture…', 'Writing…', 'Escribiendo…')
                  : `${t('Abonner', 'Subscribe', 'Suscribir')} ${prets.length} ${t('élève(s)', 'student(s)', 'alumno(s)')}`}
              </button>
            </Pied>
          </div>
        )}

        {/* ── 4. LE RAPPORT ─────────────────────────────────────────────── */}
        {etape === 4 && rapport && (
          <div>
            {/* Ce qui n'a PAS eu lieu est dit aussi clairement que ce qui a eu
                lieu : un abonnement attendu qui manque, sans un mot, laisse
                croire à une perte de données. */}
            <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              rapport.echecs ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
              {rapport.abonnes} {t('abonnement(s) enregistré(s)', 'subscription(s) saved', 'suscripciones guardadas')}
              {rapport.echeances ? ` · ${rapport.echeances} ${t('échéance(s) posée(s)', 'instalment(s) added', 'plazos')}` : ''}
              {rapport.echecs ? ` · ${rapport.echecs} ${t('en échec', 'failed', 'fallidos')}` : ''}
            </p>
            {rapport.echecs > 0 && (
              <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-xs text-amber-900">
                {(rapport.detailEchecs || []).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {rejets.length > 0 && (
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                {rejets.length} {t('ligne(s) restent à trancher avec l’école.', 'row(s) still to resolve with the school.', 'filas por resolver.')}
                {' '}
                <button type="button" onClick={exporterRejets} className="underline">
                  {t('Exporter la liste', 'Export the list', 'Exportar')}
                </button>
              </p>
            )}
            <Pied>
              <button type="button" onClick={onFerme} className={btnPlein}>{t('Fermer', 'Close', 'Cerrar')}</button>
            </Pied>
          </div>
        )}
      </div>
    </div>
  );
}
