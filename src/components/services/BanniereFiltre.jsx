// LA BANNIÈRE DE FILTRE — un seul endroit, montée par les TROIS onglets.
//
// Règle du responsable (2026-10-31) : « les totaux doivent refléter le filtre
// actif ». C'est utile — une école veut le total de la cantine du Primaire.
// C'est aussi dangereux : un total partiel pris pour un total général est un
// faux chiffre, et c'est celui que l'école recopie dans son cahier, puis dans
// son rapport au fondateur.
//
// La bannière est donc la contrepartie de la règle, et elle n'est pas
// facultative. Elle vivait en dur dans le JSX de la page, visible du seul
// onglet « grille » : on pouvait filtrer, basculer sur « Résumé », et lire
// quatre cartes partielles sans aucun avertissement. Un composant unique monté
// par les trois onglets rend ce trou impossible à recreuser.
export default function BanniereFiltre({ affiches = 0, total = 0, t, onEffacer }) {
  return (
    <p
      role="status"
      data-role="banniere-filtre"
      className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <span className="font-semibold tabular-nums">
        {affiches} / {total} {t('élèves', 'students', 'alumnos')}
      </span>
      <span>
        — {t('les totaux portent sur cette sélection',
             'totals cover this selection only',
             'los totales cubren solo esta selección')}
      </span>
      {onEffacer && (
        <button
          type="button" onClick={onEffacer}
          className="ml-auto min-h-[36px] rounded-lg border border-amber-400 px-2 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
        >
          {t('Effacer les filtres', 'Clear filters', 'Limpiar filtros')}
        </button>
      )}
    </p>
  );
}
