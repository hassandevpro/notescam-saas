// SUPPRIMER UN SERVICE — ce qui part, ce qui reste, et quand c'est refusé
//
// ── POURQUOI UNE CONFIRMATION QUI FAIT TAPER LE NOM ────────────────────────
//
// Un service porte des abonnements et des échéances : des dettes de familles.
// Le supprimer n'est pas annulable depuis l'app. Un « Êtes-vous sûr ? » se
// clique sans lire ; recopier le nom du service oblige à regarder LEQUEL on
// supprime — c'est la seule protection qui tient quand la page montre six
// services et qu'on vise le mauvais.
//
// ── CE QUE CET ÉCRAN REFUSE, ET QUI N'EST PAS UN DÉFAUT ────────────────────
//
// `supabase_fee_integrity.sql` retire toute policy DELETE sur `fee_payments` et
// révoque le droit : un encaissement ne s'efface pas depuis l'app, par décision
// anti-fraude. Donc si de l'argent est attaché au service, la suppression est
// refusée — et le refus dit le montant.
//
// Passer outre serait pire que de ne rien faire : les abonnements partiraient,
// les versements basculeraient à `SET NULL`, et la recette deviendrait
// orpheline — invisible à l'écran, toujours comptée en balance, et plus
// rattachée à rien qui l'explique.
//
// La voie pour annuler une recette est la CONTRE-PASSATION : une ligne négative
// qui pointe l'originale, avec son motif. Les deux lignes restent visibles et la
// somme retombe juste. L'ordre est donc : contre-passer d'abord, supprimer
// ensuite — et même alors, les lignes de versement demeurent.
import { useEffect, useState } from 'react';

export default function SupprimerServiceModal({
  service, charger, onSupprimer, onFerme, onFini, t, money,
}) {
  const [dep, setDep] = useState(null);
  const [erreurLecture, setErreurLecture] = useState(false);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [refus, setRefus] = useState(null);
  const [forcer, setForcer] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      const d = await charger(service.id);
      if (!vivant) return;
      if (!d) { setErreurLecture(true); return; }
      setDep(d);
    })();
    return () => { vivant = false; };
  }, [service.id, charger]);

  const nomAttendu = (service?.name || '').trim();
  const nomTape = saisie.trim().toLowerCase() === nomAttendu.toLowerCase();
  const argentVif = dep ? dep.montant !== 0 : false;
  const versementsRestants = dep ? dep.versements.length > 0 : false;

  const supprimer = async () => {
    setOccupe(true);
    setRefus(null);
    const r = await onSupprimer(service.id, { forcerMalgreVersementsSoldes: forcer });
    setOccupe(false);
    if (!r?.ok) { setRefus(r); return; }
    onFini?.(r);
  };

  const btn = 'min-h-[44px] rounded-lg px-4 text-sm font-semibold';
  const MESSAGES_REFUS = {
    argent_encaisse: t('De l’argent est encaissé sur ce service.', 'Money has been collected.', 'Hay dinero cobrado.'),
    versements_soldes_restants: t('Des lignes de versement subsistent.', 'Payment rows remain.', 'Quedan pagos.'),
    lecture_impossible: t('Impossible de lire ce qui dépend du service.', 'Cannot read dependencies.', 'No se puede leer.'),
    abonnement_refuse: t('La base a refusé la suppression d’un abonnement.', 'The database refused a subscription delete.', 'La base rechazó.'),
    service_refuse: t('La base a refusé la suppression du service.', 'The database refused the service delete.', 'La base rechazó.'),
    reste_des_lignes: t('Des lignes subsistent après la suppression : rien n’est déclaré terminé.', 'Rows remain after deletion.', 'Quedan filas.'),
    aucun_service: t('Aucun service visé.', 'No service targeted.', 'Ningún servicio.'),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-rose-700">
            {t('Supprimer le service', 'Delete the service', 'Eliminar el servicio')}
          </h3>
          <button type="button" onClick={onFerme} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <p className="mb-3 text-sm">
          <strong>{service.name}</strong>
          <span className="text-slate-500"> · {service.category} · {service.academic_year}</span>
        </p>

        {erreurLecture && (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {t('Impossible de lire ce qui dépend de ce service. Rien n’a été supprimé — réessayez plus tard plutôt que de supprimer à l’aveugle.',
               'Cannot read what depends on this service. Nothing was deleted.',
               'No se pudo leer. Nada fue eliminado.')}
          </p>
        )}

        {!dep && !erreurLecture && (
          <p className="text-sm text-slate-500">{t('Lecture…', 'Reading…', 'Leyendo…')}</p>
        )}

        {dep && (
          <>
            <dl className="mb-3 grid grid-cols-3 gap-2">
              {[
                [t('Abonnements', 'Subscriptions', 'Suscripciones'), dep.abonnements.length],
                [t('Échéances', 'Instalments', 'Plazos'), dep.echeances.length],
                [t('Versements', 'Payments', 'Pagos'), dep.versements.length],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-sm font-semibold">{v}</dd>
                </div>
              ))}
            </dl>

            {/* ── LE REFUS, quand de l'argent est en jeu ─────────────────── */}
            {argentVif ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <p className="font-semibold">
                  {money(dep.montant)} {t('sont encaissés sur ce service.', 'has been collected on this service.', 'cobrados.')}
                </p>
                <p className="mt-2">
                  {t('La suppression est refusée, et ce n’est pas une limite de l’écran : l’application n’a pas le droit d’effacer un encaissement. C’est une protection — un reçu effacé ne laisserait aucune trace.',
                     'Deletion is refused: the app may not erase a collected payment. That is a protection, not a limitation.',
                     'La eliminación se rechaza: la app no puede borrar un cobro.')}
                </p>
                <p className="mt-2">
                  {t('Pour annuler ces recettes, contre-passez-les depuis la fiche de chaque élève : une ligne négative, avec son motif. La somme retombe à zéro, les deux lignes restent visibles, et la suppression devient possible.',
                     'To cancel them, reverse each payment from the student’s record. Then deletion becomes possible.',
                     'Para anularlos, haga una contrapartida desde la ficha del alumno.')}
                </p>
              </div>
            ) : (
              <>
                {/* Somme nulle, mais des LIGNES subsistent : on le dit, pour que
                    personne ne croie la base vierge après coup. */}
                {versementsRestants && (
                  <label className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <input
                      type="checkbox" checked={forcer} onChange={(e) => setForcer(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      {dep.versements.length} {t('ligne(s) de versement s’annulent (somme nulle) mais',
                        'payment row(s) cancel out (zero total) but', 'pagos se anulan pero')}
                      {' '}<strong>{t('RESTERONT dans la base', 'WILL REMAIN in the database', 'PERMANECERÁN')}</strong>
                      {t(' : l’application ne peut pas les effacer. Je comprends et je supprime quand même le service.',
                         ': the app cannot erase them. I understand and still delete the service.',
                         ': la app no puede borrarlos.')}
                    </span>
                  </label>
                )}
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                  {t('Cette suppression n’est pas annulable depuis l’application. Recopiez le nom du service pour confirmer :',
                     'This cannot be undone from the app. Type the service name to confirm:',
                     'No se puede deshacer. Escriba el nombre del servicio:')}
                </p>
                <input
                  type="text" value={saisie} onChange={(e) => setSaisie(e.target.value)}
                  placeholder={nomAttendu}
                  autoComplete="off"
                  className="mb-3 w-full min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm"
                />
              </>
            )}

            {refus && (
              <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {MESSAGES_REFUS[refus.refus] || t('Suppression refusée.', 'Deletion refused.', 'Rechazado.')}
                {refus.abonnements != null && ` (${refus.abonnements} ${t('abonnement(s)', 'subscription(s)', 'susc.')}, ${refus.echeances} ${t('échéance(s)', 'instalment(s)', 'plazos')})`}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
              <button type="button" onClick={onFerme} className={`${btn} border border-slate-300 dark:border-slate-600`}>
                {argentVif ? t('Fermer', 'Close', 'Cerrar') : t('Annuler', 'Cancel', 'Cancelar')}
              </button>
              {!argentVif && (
                <button
                  type="button" onClick={supprimer}
                  disabled={occupe || !nomTape || (versementsRestants && !forcer)}
                  className={`${btn} bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40`}
                >
                  {occupe
                    ? t('Suppression…', 'Deleting…', 'Eliminando…')
                    : t('Supprimer définitivement', 'Delete permanently', 'Eliminar definitivamente')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
