// Outils de lecture de la page Budgets : parcours en 5 étapes, cartes « à
// compléter » / « prêtes », barre de recherche-tri-filtres. Affichage seul : les
// calculs viennent de lib/budgetLineView (pur, testé).
import { useT } from '../../lib/i18n';
import { LINE_ERROR_LABELS } from './budgetUi';

const STEP_LABELS = {
  periods:    ['Périodes', 'Periods', 'Períodos'],
  lines:      ['Rubriques et lignes', 'Categories and lines', 'Rúbricas y líneas'],
  allocation: ['Répartition', 'Breakdown', 'Reparto'],
  activation: ['Activation', 'Activation', 'Activación'],
  expenses:   ['Dépenses', 'Expenses', 'Gastos'],
};

// Le texte dit toujours l'état (« Terminé / En cours / À venir ») : la couleur
// seule ne suffit pas.
export function BudgetSteps({ steps, details = {} }) {
  const t = useT();
  const stateText = {
    done: t('Terminé', 'Done', 'Hecho'),
    current: t('En cours', 'In progress', 'En curso'),
    todo: t('À venir', 'Upcoming', 'Próximo'),
  };
  const tone = {
    done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    current: 'border-indigo-400 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-200',
    todo: 'border-gray-200 bg-white text-gray-600',
  };
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-4" aria-label={t('Avancement du budget', 'Budget progress', 'Avance del presupuesto')}>
      {steps.map((s, i) => (
        <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}
          className={`rounded-lg border px-3 py-2 text-xs min-w-0 ${tone[s.state]}`}>
          <div className="font-semibold text-sm truncate">
            <span aria-hidden="true">{s.state === 'done' ? '✓ ' : `${i + 1}. `}</span>{t(...STEP_LABELS[s.key])}
          </div>
          <div>{stateText[s.state]}{details[s.key] ? ` · ${details[s.key]}` : ''}</div>
        </li>
      ))}
    </ol>
  );
}

// Carte « N lignes à compléter » : chaque motif est un filtre cliquable.
export function BlockersCard({ todoCount, groups, activeBlocker, onPick }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 min-w-0">
      <h3 className="text-sm font-bold text-amber-900">
        {todoCount === 0
          ? t('Aucune ligne à compléter', 'No line to complete', 'Ninguna línea por completar')
          : t(`${todoCount} ligne${todoCount > 1 ? 's' : ''} à compléter`, `${todoCount} line${todoCount > 1 ? 's' : ''} to complete`, `${todoCount} línea${todoCount > 1 ? 's' : ''} por completar`)}
      </h3>
      {groups.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {groups.map((g) => {
            const label = t(...(LINE_ERROR_LABELS[g.code] || [g.code, g.code, g.code]));
            const on = activeBlocker === g.code;
            return (
              <li key={g.code}>
                <button type="button" aria-pressed={on} onClick={() => onPick(on ? null : g.code)}
                  className={`min-h-9 px-3 rounded-full border text-xs font-semibold ${on ? 'bg-amber-700 border-amber-700 text-white' : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-100'}`}>
                  {g.count} · {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {groups.length > 0 && (
        <p className="mt-2 text-xs text-amber-800/80">
          {t('Une ligne peut avoir plusieurs motifs : elle est comptée une seule fois dans le total.', 'A line can have several reasons: it is counted once in the total.', 'Una línea puede tener varios motivos: se cuenta una sola vez.')}
        </p>
      )}
    </div>
  );
}

// Carte « N lignes prêtes » + activation en lot (réservée à qui peut approuver).
export function ReadyCard({ readyCount, canApprove, canManage, onOpen }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 min-w-0">
      <h3 className="text-sm font-bold text-emerald-900">
        {readyCount === 0
          ? t('Aucune ligne prête à activer', 'No line ready to activate', 'Ninguna línea lista')
          : t(`${readyCount} ligne${readyCount > 1 ? 's' : ''} prête${readyCount > 1 ? 's' : ''} à activer`, `${readyCount} line${readyCount > 1 ? 's' : ''} ready to activate`, `${readyCount} línea${readyCount > 1 ? 's' : ''} lista${readyCount > 1 ? 's' : ''}`)}
      </h3>
      {readyCount > 0 && canApprove && (
        <button type="button" onClick={onOpen}
          className="mt-2 min-h-9 px-3 py-1.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
          {t(`Activer les ${readyCount} lignes prêtes`, `Activate the ${readyCount} ready lines`, `Activar las ${readyCount} líneas listas`)}
        </button>
      )}
      {readyCount > 0 && !canApprove && (
        <p className="mt-2 text-xs text-emerald-900">
          {canManage
            ? t('L’activation est réservée aux personnes qui peuvent approuver le budget.', 'Activation is reserved for people who can approve the budget.', 'La activación está reservada a quien puede aprobar el presupuesto.')
            : t('Vous consultez ce budget en lecture seule.', 'You are viewing this budget read-only.', 'Está viendo este presupuesto en solo lectura.')}
        </p>
      )}
    </div>
  );
}

const STATE_LABELS = {
  all:    ['Tous', 'All', 'Todos'],
  todo:   ['À compléter', 'To complete', 'Por completar'],
  ready:  ['Prêtes', 'Ready', 'Listas'],
  active: ['Actives', 'Active', 'Activas'],
  closed: ['Clôturées', 'Closed', 'Cerradas'],
};

// Recherche + tri + filtres par état (avec compteurs) + replier/déplier.
export function ListToolbar({ query, onQuery, sort, onSort, state, onState, counts, onCollapseAll, onExpandAll }) {
  const t = useT();
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="sr-only" htmlFor="budget-search">{t('Rechercher une ligne', 'Search a line', 'Buscar una línea')}</label>
        <input id="budget-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)}
          placeholder={t('Rechercher une ligne ou une rubrique…', 'Search a line or category…', 'Buscar una línea o rúbrica…')}
          className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-9 focus:ring-2 focus:ring-indigo-500 outline-none" />
        <label className="sr-only" htmlFor="budget-sort">{t('Trier', 'Sort', 'Ordenar')}</label>
        <select id="budget-sort" value={sort} onChange={(e) => onSort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-9">
          <option value="order">{t('Ordre de saisie', 'Entry order', 'Orden de entrada')}</option>
          <option value="amountDesc">{t('Montant décroissant', 'Amount, high to low', 'Monto descendente')}</option>
          <option value="amountAsc">{t('Montant croissant', 'Amount, low to high', 'Monto ascendente')}</option>
        </select>
        <button type="button" onClick={onCollapseAll} className="min-h-9 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Tout replier', 'Collapse all', 'Contraer todo')}</button>
        <button type="button" onClick={onExpandAll} className="min-h-9 px-3 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">{t('Tout déplier', 'Expand all', 'Expandir todo')}</button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('Filtrer par état', 'Filter by state', 'Filtrar por estado')}>
        {Object.keys(STATE_LABELS).map((k) => (
          <button key={k} type="button" aria-pressed={state === k} onClick={() => onState(k)}
            className={`min-h-9 px-3 rounded-full border text-xs font-semibold ${state === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
            {t(...STATE_LABELS[k])} ({counts[k] ?? 0})
          </button>
        ))}
      </div>
    </div>
  );
}

// « Comment ça marche » : les cinq étapes, repliable (élément natif <details> :
// clavier et lecteurs d'écran gérés sans code).
export function HowItWorks({ defaultOpen = false }) {
  const t = useT();
  const items = [
    [t('Périodes', 'Periods', 'Períodos'), t('Définissez les périodes de l’année (trimestres, mois).', 'Define the periods of the year (terms, months).', 'Defina los períodos del año.')],
    [t('Rubriques et lignes', 'Categories and lines', 'Rúbricas y líneas'), t('Créez des rubriques (par exemple Salaires), puis des lignes avec leur montant annuel.', 'Create categories (for example Salaries), then lines with their annual amount.', 'Cree rúbricas y líneas con su monto anual.')],
    [t('Répartition', 'Breakdown', 'Reparto'), t('Répartissez chaque ligne par période, et par section si elle ne concerne qu’une partie de l’établissement. Chaque total doit faire 100 %.', 'Break each line down by period, and by section if it covers only part of the school. Each total must reach 100%.', 'Reparta cada línea por período y por sección. Cada total debe ser 100 %.')],
    [t('Activation', 'Activation', 'Activación'), t('Activez les lignes complètes. Leur total ne peut pas dépasser l’enveloppe.', 'Activate the complete lines. Their total cannot exceed the envelope.', 'Active las líneas completas. Su total no puede superar la envolvente.')],
    [t('Dépenses', 'Expenses', 'Gastos'), t('Une fois une ligne active, saisissez les dépenses dans l’écran Dépenses.', 'Once a line is active, record expenses in the Expenses screen.', 'Con una línea activa, registre los gastos en la pantalla Gastos.')],
  ];
  return (
    <details open={defaultOpen} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-gray-700 min-h-9 flex items-center">
        {t('Comment ça marche', 'How it works', 'Cómo funciona')}
      </summary>
      <ol className="mt-2 space-y-1.5 list-decimal pl-5 text-gray-600">
        {items.map(([title, text]) => <li key={title}><b className="text-gray-800">{title}</b> : {text}</li>)}
      </ol>
    </details>
  );
}
