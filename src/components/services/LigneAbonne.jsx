// UNE LIGNE DE LA LISTE DES ABONNÉS.
//
// ── POURQUOI ELLE EST SORTIE DU COMPOSANT DE LISTE ────────────────────────
//
// Mémoïsée. La liste porte jusqu'à 320 lignes (jeu de volume), et chaque
// frappe dans la recherche re-rend la liste entière : sans `memo`, c'est 320
// reconstructions de sous-arbre par caractère tapé. La ligne ne dépend que de
// son abonné et des rappels, qui sont stables.
//
// ── PAS DE `<table>`, ET C'EST LA RAISON D'ÊTRE DE CE DESSIN ──────────────
//
// Un `<table>` impose sa largeur : à 375 px, huit colonnes débordent et les
// dernières — justement Reste et Encaisser — sortent de l'écran. C'est le
// défaut signalé par le responsable (« la liste est coupée à droite »). On
// construit donc une RANGÉE EN GRILLE qui se replie en carte sous `sm`.
//
// `minmax(0, 1fr)` et non `1fr` : une piste `1fr` prend pour minimum la taille
// de son contenu, donc un nom de 38 caractères en `whitespace-nowrap`
// élargirait la grille au-delà de l'écran malgré le `truncate`. C'est la
// cause exacte du défilement horizontal, et elle se corrige ici.
import { memo } from 'react';

// Les quatre états et leur ton. Fond ET texte ET bordure : un écran mal réglé,
// une impression en noir et blanc ou un daltonien doivent lire la même chose.
const TON = {
  a_jour:     'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  partiel:    'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-600',
  impaye:     'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
  sans_dette: 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600',
};

function LigneAbonne({ a, canCollect, onEncaisser, onFiche, libelleStatut, money, t }) {
  // « Rien dû » n'affiche pas « 0 XAF » : l'élève n'a jamais rien dû, et un
  // zéro laisserait croire qu'il a payé. Les autres portent leur reste, zéro
  // compris — c'est la colonne qu'on lit, elle ne doit pas se vider.
  const reste = a.statut === 'sans_dette' ? '—' : money(a.reste);
  const rienAEncaisser = !a.reste;

  return (
    <li>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
        {/* Nom + classe. Le bouton couvre toute la zone cliquable : la cible
            tactile fait la hauteur de la ligne, pas celle du texte. */}
        <button
          type="button" onClick={() => onFiche(a)}
          className="min-w-0 text-left py-1 min-h-[44px] sm:min-h-0"
          title={t('Ouvrir la fiche', 'Open the card', 'Abrir la ficha')}
        >
          <span className="block truncate font-medium text-gray-900 dark:text-slate-100">
            {a.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {a.className || '—'}
          </span>
        </button>

        {/* Reste à payer — aligné à droite, jamais collé, jamais tronqué. */}
        <span className="order-3 sm:order-none text-right tabular-nums whitespace-nowrap font-semibold text-gray-900 dark:text-slate-100">
          {reste}
        </span>

        <span className="order-4 sm:order-none">
          <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TON[a.statut]}`}>
            {libelleStatut(a.statut)}
          </span>
        </span>

        {canCollect && (
          // L'INFOBULLE EST SUR LE CONTENEUR, PAS SUR LE BOUTON : un bouton
          // `disabled` ne reçoit pas d'événement de survol, donc son `title`
          // ne s'affiche jamais — et la secrétaire reste sans explication
          // devant un bouton éteint.
          <span
            className="justify-self-end"
            title={rienAEncaisser
              ? t('Rien à encaisser', 'Nothing to collect', 'Nada que cobrar') : ''}
          >
            <button
              type="button" disabled={rienAEncaisser}
              onClick={(e) => { e.stopPropagation(); onEncaisser(a); }}
              aria-label={`${t('Encaisser', 'Collect', 'Cobrar')} — ${a.name}`}
              className="min-h-[44px] rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {t('Encaisser', 'Collect', 'Cobrar')}
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

export default memo(LigneAbonne);
