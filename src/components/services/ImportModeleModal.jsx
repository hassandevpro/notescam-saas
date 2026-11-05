// IMPORTER UN REGISTRE DE SERVICE PAR LE MODÈLE — fichier → aperçu → rapport
//
// Même parcours que l'import des élèves : télécharger le modèle, le remplir,
// l'importer. Trois écrans, une seule écriture, et RIEN n'est enregistré avant
// « Confirmer l'import ».
//
// L'ancien écran (`ImportRegistreModal`) lit le classeur libre de THE GENIUS et
// ne pose que des abonnements. Celui-ci lit le modèle strict et pose aussi les
// montants dus et les versements (de reprise, hors caisse).
import { useMemo, useState } from 'react';
import { EXCEL_ACCEPT, isExcelFile, excelOnlyMessage, readWorkbookAoa, downloadExcelSheets } from '../../lib/exportCsv.js';
import {
  genererModele, lireImport, planifierImport, lignesRapport, lignesAReimporter, MESSAGE_EXPORT,
} from '../../lib/serviceImportEngine.js';

const CLE_ALIAS = (schoolId) => `notescam.aliasClasses.${schoolId || 'ecole'}`;

function lireAliasLocaux(schoolId) {
  try { return JSON.parse(localStorage.getItem(CLE_ALIAS(schoolId)) || '{}') || {}; } catch { return {}; }
}
function ecrireAliasLocaux(schoolId, a) {
  try { localStorage.setItem(CLE_ALIAS(schoolId), JSON.stringify(a)); } catch { /* navigation privée : on s'en passe */ }
}
const aliasEnTexte = (a) => Object.entries(a).map(([k, v]) => `${k} = ${v}`).join('\n');
const texteEnAlias = (s) => Object.fromEntries(String(s || '').split('\n')
  .map((l) => l.split('=').map((x) => x.trim())).filter(([k, v]) => k && v));

export function telechargerModele({ service, annee, classes, mois, devise }) {
  const feuilles = genererModele({ service, annee, classes, mois, devise });
  const nom = String(service?.name || 'service').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return downloadExcelSheets(`modele_import_${nom || 'service'}_${String(annee).replace(/\W+/g, '-')}.xlsx`, feuilles);
}

export default function ImportModeleModal({
  service, schoolId, year, eleves = [], classes = [], mois = [], abonnements = [], echeances = [],
  payeDe, dernierLot = null, devise = 'XAF', onEcrire, onAnnulerLot, onFerme, t, money,
}) {
  const [etape, setEtape] = useState(1);
  const [erreur, setErreur] = useState('');
  const [exportDetecte, setExportDetecte] = useState(false);
  const [lecture, setLecture] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [aliasTexte, setAliasTexte] = useState(() => aliasEnTexte(lireAliasLocaux(schoolId)));
  const aliases = useMemo(() => texteEnAlias(aliasTexte), [aliasTexte]);

  const choisir = async (f) => {
    setErreur(''); setExportDetecte(false);
    if (!f) return;
    if (!isExcelFile(f)) { setErreur(excelOnlyMessage()); return; }
    setOccupe(true);
    const { sheets, error } = await readWorkbookAoa(f);
    setOccupe(false);
    if (error) { setErreur(error); return; }
    // La feuille « Import » du modèle ; à défaut, la première.
    const feuille = sheets.find((s) => s.name.toLowerCase() === 'import') || sheets[0];
    const l = lireImport(feuille?.raw || []);
    if (!l.ok) { setErreur(l.erreur); setExportDetecte(Boolean(l.estExport)); return; }
    setLecture(l);
    setEtape(2);
  };

  const plan = useMemo(() => (lecture ? planifierImport({
    lignes: lecture.lignes, eleves, classes, aliases, mois, annee: year, service,
    abonnements, echeances, payeDe,
  }) : null), [lecture, eleves, classes, aliases, mois, year, service, abonnements, echeances, payeDe]);

  const confirmer = async () => {
    if (!plan || !plan.retenues.length) return;
    ecrireAliasLocaux(schoolId, aliases);
    setOccupe(true); setErreur('');
    const r = await onEcrire(plan).catch((e) => ({ erreur: String(e?.message || e) }));
    setOccupe(false);
    if (r?.erreur) { setErreur(r.erreur); return; }
    setRapport(r); setEtape(3);
  };

  const rejetsTous = plan ? [...plan.ambigus, ...plan.rejets.filter((r) => !r.benin)] : [];
  const nom = (service?.name || 'service').replace(/\W+/g, '_');
  const exporterRapport = (importees) => downloadExcelSheets(
    `rapport_import_${nom}_${year}.xlsx`,
    [{ name: 'Rapport', rows: lignesRapport({ plan, importees, devise }) }]);
  const exporterCorrections = () => downloadExcelSheets(
    `a_corriger_${nom}_${year}.xlsx`, [{ name: 'Import', rows: lignesAReimporter(plan) }]);

  const btn = 'min-h-[44px] rounded-lg px-4 text-sm font-semibold';
  const plein = `${btn} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50`;
  const vide = `${btn} border border-slate-300 dark:border-slate-600`;
  const r = plan?.resume;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">
              {t('Importer un registre (modèle)', 'Import a register (template)', 'Importar un registro (modelo)')}
            </h3>
            <p className="text-xs text-slate-500">{service?.name} · {year} · {t('étape', 'step', 'paso')} {etape}/3</p>
          </div>
          <button type="button" onClick={onFerme} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {erreur && (
          <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            <p>{exportDetecte ? t(MESSAGE_EXPORT, 'This file is an export, not an import template. Download the import template, copy the data into it, then import it.', MESSAGE_EXPORT) : erreur}</p>
            {exportDetecte && (
              <button type="button" className="mt-2 underline font-semibold"
                onClick={() => telechargerModele({ service, annee: year, classes, mois, devise })}>
                {t('Télécharger le modèle d’import', 'Download the import template', 'Descargar el modelo')}
              </button>
            )}
          </div>
        )}

        {etape === 1 && (
          <div>
            <ol className="mb-3 list-decimal pl-5 text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <li>{t('Téléchargez le modèle.', 'Download the template.', 'Descargue el modelo.')}</li>
              <li>{t('Remplissez la feuille « Import » (une ligne par élève et par mois) ; lisez « Instructions ».', 'Fill in the “Import” sheet (one row per student and month).', 'Rellene la hoja “Import”.')}</li>
              <li>{t('Importez-le : vous verrez un aperçu avant que rien ne soit enregistré.', 'Import it: you get a preview before anything is saved.', 'Impórtelo: verá una vista previa.')}</li>
            </ol>
            <button type="button" className={`${vide} mb-3`}
              onClick={() => telechargerModele({ service, annee: year, classes, mois, devise })}>
              {t('Télécharger le modèle d’import', 'Download the import template', 'Descargar el modelo')}
            </button>
            <input type="file" accept={EXCEL_ACCEPT} onChange={(e) => choisir(e.target.files?.[0])}
              className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm" />
            {occupe && <p className="mt-2 text-sm text-slate-500">{t('Lecture…', 'Reading…', 'Leyendo…')}</p>}

            <details className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {t('Équivalences de classes (facultatif)', 'Class equivalences (optional)', 'Equivalencias de clases')}
              </summary>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                {t('Une par ligne : variante = nom exact de la classe. Form 1, F1, 5ème sont déjà reconnus.',
                   'One per line: variant = exact class name. Form 1, F1, 5ème are already recognised.',
                   'Una por línea: variante = nombre exacto.')}
              </p>
              <textarea value={aliasTexte} onChange={(e) => setAliasTexte(e.target.value)} rows={4}
                placeholder="CM2 = FORM2"
                className="mt-2 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-sm font-mono" />
              <p className="mt-1 text-xs text-slate-500">
                {t('Mémorisé sur ce poste.', 'Saved on this computer.', 'Guardado en este equipo.')}
              </p>
            </details>

            {dernierLot && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">{t('Dernier import', 'Last import', 'Última importación')} : {dernierLot.lot}</p>
                <p className="text-xs">{dernierLot.versements} {t('versement(s)', 'payment(s)', 'pago(s)')} · {money(dernierLot.total)} · {dernierLot.date}</p>
                <button type="button" disabled={occupe} className={`${vide} mt-2 bg-white`}
                  onClick={async () => {
                    setOccupe(true);
                    const x = await onAnnulerLot(dernierLot).catch((e) => ({ erreur: String(e?.message || e) }));
                    setOccupe(false);
                    if (x?.erreur) setErreur(x.erreur); else { setRapport({ annule: x }); setEtape(3); }
                  }}>
                  {t('Annuler ce dernier import', 'Undo this last import', 'Deshacer')}
                </button>
              </div>
            )}
          </div>
        )}

        {etape === 2 && plan && (
          <div>
            <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t('Lignes lues', 'Rows read', 'Filas'), r.lues],
                [t('Élèves rapprochés', 'Students matched', 'Alumnos'), r.rapprochees],
                [t('Nouvelles', 'New', 'Nuevas'), r.nouvelles],
                [t('Mises à jour', 'Updates', 'Actualiz.'), r.majs],
                [t('Identiques', 'Unchanged', 'Iguales'), r.identiques],
                [t('Doublons', 'Duplicates', 'Duplic.'), r.doublons],
                [t('Ambiguës', 'Ambiguous', 'Ambiguas'), r.ambigues],
                [t('Rejetées', 'Rejected', 'Rechazadas'), r.rejetees - r.doublons],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                  <dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="mb-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
              {t('Total dû', 'Total due', 'Total debido')} <strong>{money(r.totalDu)}</strong> · {t('payé (fichier)', 'paid (file)', 'pagado')} <strong>{money(r.totalPayeFichier)}</strong>
              {' '}· {t('à écrire', 'to write', 'a escribir')} <strong>{money(r.totalAEcrire)}</strong>
              {r.abonnementsACreer ? ` · ${r.abonnementsACreer} ${t('abonnement(s) à créer', 'subscription(s) to create', 'suscripciones')}` : ''}
            </p>
            <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
              {t('Règle : le « Montant payé » du fichier est le CUMUL du mois ; seul l’écart avec la base est écrit, en versement de reprise daté du 1er du mois, hors arrêté de caisse. Réimporter le même fichier ne change rien. Aucun élève n’est créé.',
                 'Rule: the file’s “Amount paid” is the month’s running total; only the difference is written, as a carry-over payment dated the 1st, outside the cash closing. Re-importing the same file changes nothing. No student is created.',
                 'Regla: solo se escribe la diferencia.')}
            </p>

            {plan.avertissements.length > 0 && (
              <details className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <summary className="cursor-pointer text-sm font-semibold">{plan.avertissements.length} {t('avertissement(s)', 'warning(s)', 'avisos')}</summary>
                <ul className="mt-2 space-y-1 text-xs">{plan.avertissements.slice(0, 40).map((a, i) => <li key={i}>L{a.ligne} — {a.message}</li>)}</ul>
              </details>
            )}

            {rejetsTous.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-amber-900">{t('Ces lignes ne seront pas importées', 'These rows will not be imported', 'Estas filas no se importarán')}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => exporterRapport([])} className={`${vide} bg-white`}>{t('Rapport (Excel)', 'Report (Excel)', 'Informe')}</button>
                    <button type="button" onClick={exporterCorrections} className={`${vide} bg-white`}>{t('À corriger (modèle)', 'To fix (template)', 'A corregir')}</button>
                  </div>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {rejetsTous.slice(0, 80).map((x, i) => (
                    <li key={i}>
                      <strong>L{x.ligne}</strong>{x.colonne ? ` · ${x.colonne}` : ''} — {x.nom || x.matricule} — {x.raison}
                      {x.candidats?.length ? ` (${x.candidats.map((c) => `${c.name} / ${c.className || '—'}`).join(' ; ')})` : ''}
                    </li>
                  ))}
                  {rejetsTous.length > 80 && <li>… {rejetsTous.length - 80} {t('autres (voir le rapport)', 'more (see the report)', 'más')}</li>}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
              <button type="button" onClick={() => { setEtape(1); setLecture(null); }} className={vide}>{t('Retour', 'Back', 'Atrás')}</button>
              <button type="button" onClick={confirmer} disabled={occupe || !plan.retenues.length || (!r.nouvelles && !r.majs)} className={plein}>
                {occupe ? t('Écriture…', 'Writing…', 'Escribiendo…') : t('Confirmer l’import', 'Confirm the import', 'Confirmar')}
                {!occupe && ` (${r.nouvelles + r.majs})`}
              </button>
            </div>
          </div>
        )}

        {etape === 3 && rapport && (
          <div>
            {rapport.annule ? (
              <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {rapport.annule.annules} {t('versement(s) annulé(s)', 'payment(s) reversed', 'pagos anulados')}
                {' · '}{rapport.annule.echeances} {t('échéance(s) neutralisée(s)', 'instalment(s) neutralised', 'plazos')}
                {rapport.annule.echecs ? ` · ${rapport.annule.echecs} ${t('en échec', 'failed', 'fallidos')}` : ''}
              </p>
            ) : (
              <>
                <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${rapport.echecs ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                  {rapport.echeances} {t('échéance(s)', 'instalment(s)', 'plazos')} · {rapport.versements} {t('versement(s) de reprise', 'carry-over payment(s)', 'pagos')} ({money(rapport.total)})
                  {rapport.abonnes ? ` · ${rapport.abonnes} ${t('abonnement(s)', 'subscription(s)', 'suscripciones')}` : ''}
                  {rapport.echecs ? ` · ${rapport.echecs} ${t('en échec', 'failed', 'fallidos')}` : ''}
                  <span className="block text-xs mt-1">{t('Lot', 'Batch', 'Lote')} {rapport.lot}</span>
                </p>
                {rapport.echecs > 0 && <ul className="mb-3 max-h-40 overflow-y-auto text-xs text-amber-900">{rapport.detailEchecs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                <div className="mb-3 flex gap-2">
                  <button type="button" className={vide} onClick={() => exporterRapport(rapport.importees || [])}>{t('Télécharger le rapport', 'Download the report', 'Descargar informe')}</button>
                  {rejetsTous.length > 0 && <button type="button" className={vide} onClick={exporterCorrections}>{t('Lignes à corriger', 'Rows to fix', 'A corregir')}</button>}
                </div>
              </>
            )}
            <div className="mt-4 flex justify-end border-t border-slate-200 dark:border-slate-700 pt-3">
              <button type="button" onClick={onFerme} className={plein}>{t('Fermer', 'Close', 'Cerrar')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
