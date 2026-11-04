// LES FILTRES DU REGISTRE — une recherche, trois réducteurs, un effacement.
//
// ── UNE SEULE RECHERCHE, ET ELLE SERT LES TROIS ONGLETS ───────────────────
//
// Trois champs de recherche vivaient à trois endroits de la page. Il n'en
// reste qu'un : nom, matricule ou classe. « MAT07 » et « 6eme A » sont deux
// façons dont une école désigne quelqu'un ; exiger le nom serait une chicane.
//
// ── POURQUOI L'ÉTAT EST UN FILTRE, ET PAS SEULEMENT UN TRI ────────────────
//
// Le tri par état remonte les impayés, mais la secrétaire qui relance les
// familles veut la LISTE des impayés — pas la liste entière commençant par
// eux. Et comme les totaux suivent le filtre, « Impayé » lui donne du même
// coup la somme à réclamer, sur le papier comme à l'écran.
//
// ── CE COMPOSANT NE DÉCIDE RIEN ───────────────────────────────────────────
//
// Il ne porte aucun état : tout remonte à la page, parce que les trois onglets
// et l'impression lisent les mêmes valeurs. Un filtre local à un onglet
// donnerait deux chiffres contradictoires sur le même écran.
import SectionFilterSelect from '../SectionFilterSelect';

const CHAMP = 'min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 '
  + 'bg-white dark:bg-slate-800 px-3 text-sm';

export default function FiltresRegistre({
  recherche, setRecherche,
  section, setSection,
  classe, setClasse,
  etat, setEtat,
  periode, setPeriode, entete = [], motPeriode,
  classes = [], classesDeSection, libelleStatut,
  filtreActif = false, onEffacer, ouverts = false, setOuverts, t,
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="registre-recherche">
          {t('Rechercher un élève', 'Search a student', 'Buscar un alumno')}
        </label>
        <input
          id="registre-recherche" type="search" value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('Nom, matricule ou classe', 'Name, ID or class', 'Nombre, matrícula o clase')}
          className={`flex-1 min-w-[12rem] ${CHAMP}`}
        />

        {/* Sous `sm`, les trois réducteurs se replient pour que la recherche
            garde toute la largeur : c'est elle qu'on utilise au guichet. */}
        <button
          type="button" onClick={() => setOuverts?.((v) => !v)}
          aria-expanded={ouverts}
          className={`sm:hidden min-h-[44px] rounded-lg border px-3 text-sm ${
            filtreActif
              ? 'border-amber-400 bg-amber-50 text-amber-800'
              : 'border-slate-300 dark:border-slate-600'}`}
        >
          {t('Filtres', 'Filters', 'Filtros')}
        </button>

        {/* LA PÉRIODE RESTE VISIBLE À TOUTE LARGEUR, elle ne se replie pas
            avec les réducteurs. C'est elle qui décide de ce que signifie
            « reste à payer » : la cacher derrière un bouton « Filtres »
            laisserait la secrétaire lire un solde annuel en croyant lire le
            mois, et réclamer 120 000 XAF au lieu de 15 000. */}
        <label className="sr-only" htmlFor="registre-periode">
          {motPeriode?.le || t('Mois', 'Month', 'Mes')}
        </label>
        <select
          id="registre-periode" value={periode} data-role="filtre-periode"
          onChange={(e) => setPeriode(e.target.value)}
          className={`${CHAMP} font-semibold`}
        >
          <option value="">{t('Toute l’année', 'Whole year', 'Todo el año')}</option>
          {entete.map((e) => (
            <option key={e.period_key} value={e.period_key}>{e.label || e.period_key}</option>
          ))}
        </select>

        <div className={`${ouverts ? 'flex' : 'hidden'} sm:flex w-full sm:w-auto flex-wrap gap-2`}>
          <SectionFilterSelect
            classes={classes}
            value={section}
            onChange={(v) => { setSection(v); setClasse(''); }}
            className={CHAMP}
          />

          <label className="sr-only" htmlFor="registre-classe">
            {t('Classe', 'Class', 'Clase')}
          </label>
          <select
            id="registre-classe" value={classe}
            onChange={(e) => setClasse(e.target.value)} className={CHAMP}
          >
            <option value="">{t('Toutes les classes', 'All classes', 'Todas las clases')}</option>
            {(classesDeSection ? classesDeSection(section) : classes).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <label className="sr-only" htmlFor="registre-etat">
            {t('État', 'Status', 'Estado')}
          </label>
          <select
            id="registre-etat" value={etat} data-role="filtre-etat"
            onChange={(e) => setEtat(e.target.value)} className={CHAMP}
          >
            <option value="">{t('Tous les états', 'All statuses', 'Todos los estados')}</option>
            {/* L'ordre est celui de l'urgence, pas l'alphabet : c'est « Impayé »
                qu'on vient chercher. */}
            {['impaye', 'partiel', 'a_jour', 'sans_dette'].map((cle) => (
              <option key={cle} value={cle}>{libelleStatut(cle)}</option>
            ))}
          </select>

          {filtreActif && (
            <button
              type="button" onClick={onEffacer}
              className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 px-3 text-sm"
            >
              {t('Effacer les filtres', 'Clear filters', 'Limpiar filtros')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
