// Référentiel des CATÉGORIES et SOUS-CATÉGORIES de dépenses. Moteur PUR.
//
// Pourquoi un référentiel : `budget_expenses.category` / `.subcategory` étaient
// deux champs de TEXTE LIBRE. Deux agents saisissant « Electricité », « électricité »
// et « ELEC » produisaient trois rubriques distinctes dans les états de la RAF —
// un rapport de dépenses par catégorie n'avait donc aucune valeur.
//
// Ce qui est STOCKÉ est une CLÉ stable (`energie_eau`), pas un libellé : le même
// établissement peut basculer l'interface en anglais sans fragmenter son
// historique. Les libellés vivent dans les tables ci-dessous, à l'identique du
// patron déjà retenu pour le catalogue de frais (`feeCatalogUi.js`).
//
// COMPATIBILITÉ — le point important. Les dépenses déjà saisies portent du texte
// libre, et ce texte N'EST PAS converti : `optionsFor…` ajoute toute valeur
// réellement employée par l'école aux options proposées, et les écrans affichent
// une valeur inconnue telle qu'elle a été tapée. Une école qui avait sa propre
// nomenclature la retrouve dans la liste et continue de l'utiliser ; elle migre
// vers le référentiel au rythme qu'elle choisit, sans reprise de données.

// Sentinelle de saisie libre : ce n'est PAS une valeur stockable, seulement le
// choix « ma catégorie n'est pas dans la liste » qui ouvre un champ texte.
export const LIBRE = '__libre__';

// Référentiel : l'ordre est celui d'affichage (du plus fréquent au plus rare
// dans un établissement scolaire, pas l'ordre alphabétique).
export const EXPENSE_CATEGORIES = [
  { key: 'personnel',     subs: ['salaires', 'primes', 'cotisations', 'vacataires', 'formation'] },
  { key: 'pedagogie',     subs: ['manuels', 'fournitures_peda', 'materiel_didactique', 'examens', 'laboratoire', 'bibliotheque'] },
  { key: 'fonctionnement', subs: ['fournitures_bureau', 'consommables', 'nettoyage', 'entretien', 'reparations'] },
  { key: 'energie_eau',   subs: ['electricite', 'eau', 'carburant', 'groupe_electrogene'] },
  { key: 'batiment',      subs: ['construction', 'refection', 'mobilier', 'informatique', 'climatisation'] },
  { key: 'transport',     subs: ['carburant_bus', 'entretien_bus', 'assurance_vehicule', 'location_transport'] },
  { key: 'cantine',       subs: ['denrees', 'gaz', 'materiel_cuisine', 'personnel_cantine'] },
  { key: 'communication', subs: ['internet', 'telephone', 'impression', 'publicite'] },
  { key: 'administratif', subs: ['taxes', 'assurances', 'honoraires', 'frais_bancaires', 'licences'] },
  { key: 'vie_scolaire',  subs: ['activites', 'sorties', 'sport', 'ceremonies', 'sante'] },
  { key: 'securite',      subs: ['gardiennage', 'equipements_securite', 'extincteurs'] },
];

export const EXPENSE_CATEGORY_LABELS = {
  personnel:      ['Personnel et charges', 'Staff and payroll', 'Personal y cargas'],
  pedagogie:      ['Pédagogie', 'Teaching', 'Pedagogía'],
  fonctionnement: ['Fonctionnement', 'Operations', 'Funcionamiento'],
  energie_eau:    ['Énergie et eau', 'Energy and water', 'Energía y agua'],
  batiment:       ['Bâtiments et équipements', 'Buildings and equipment', 'Edificios y equipos'],
  transport:      ['Transport', 'Transport', 'Transporte'],
  cantine:        ['Cantine', 'Canteen', 'Comedor'],
  communication:  ['Communication', 'Communication', 'Comunicación'],
  administratif:  ['Frais administratifs', 'Administrative costs', 'Gastos administrativos'],
  vie_scolaire:   ['Vie scolaire', 'Student life', 'Vida escolar'],
  securite:       ['Sécurité et gardiennage', 'Security', 'Seguridad'],
};

export const EXPENSE_SUBCATEGORY_LABELS = {
  // personnel
  salaires:    ['Salaires', 'Salaries', 'Salarios'],
  primes:      ['Primes et indemnités', 'Bonuses and allowances', 'Primas'],
  cotisations: ['Cotisations sociales', 'Social contributions', 'Cotizaciones'],
  vacataires:  ['Vacataires', 'Temporary staff', 'Personal eventual'],
  formation:   ['Formation du personnel', 'Staff training', 'Formación'],
  // pedagogie
  manuels:             ['Manuels scolaires', 'Textbooks', 'Libros de texto'],
  fournitures_peda:    ['Fournitures pédagogiques', 'Teaching supplies', 'Material pedagógico'],
  materiel_didactique: ['Matériel didactique', 'Teaching equipment', 'Material didáctico'],
  examens:             ['Examens et évaluations', 'Exams', 'Exámenes'],
  laboratoire:         ['Laboratoire', 'Laboratory', 'Laboratorio'],
  bibliotheque:        ['Bibliothèque', 'Library', 'Biblioteca'],
  // fonctionnement
  fournitures_bureau: ['Fournitures de bureau', 'Office supplies', 'Material de oficina'],
  consommables:       ['Consommables', 'Consumables', 'Consumibles'],
  nettoyage:          ['Nettoyage et hygiène', 'Cleaning', 'Limpieza'],
  entretien:          ['Entretien', 'Maintenance', 'Mantenimiento'],
  reparations:        ['Réparations', 'Repairs', 'Reparaciones'],
  // energie_eau
  electricite:        ['Électricité', 'Electricity', 'Electricidad'],
  eau:                ['Eau', 'Water', 'Agua'],
  carburant:          ['Carburant', 'Fuel', 'Combustible'],
  groupe_electrogene: ['Groupe électrogène', 'Generator', 'Generador'],
  // batiment
  construction:  ['Construction', 'Construction', 'Construcción'],
  refection:     ['Réfection', 'Refurbishment', 'Rehabilitación'],
  mobilier:      ['Mobilier', 'Furniture', 'Mobiliario'],
  informatique:  ['Équipement informatique', 'IT equipment', 'Equipos informáticos'],
  climatisation: ['Climatisation', 'Air conditioning', 'Climatización'],
  // transport
  carburant_bus:      ['Carburant du bus', 'Bus fuel', 'Combustible del autobús'],
  entretien_bus:      ['Entretien du bus', 'Bus maintenance', 'Mantenimiento del autobús'],
  assurance_vehicule: ['Assurance véhicule', 'Vehicle insurance', 'Seguro del vehículo'],
  location_transport: ['Location de transport', 'Chartered transport', 'Alquiler de transporte'],
  // cantine
  denrees:           ['Denrées alimentaires', 'Food supplies', 'Alimentos'],
  gaz:               ['Gaz', 'Gas', 'Gas'],
  materiel_cuisine:  ['Matériel de cuisine', 'Kitchen equipment', 'Equipos de cocina'],
  personnel_cantine: ['Personnel de cantine', 'Canteen staff', 'Personal de comedor'],
  // communication
  internet:   ['Internet', 'Internet', 'Internet'],
  telephone:  ['Téléphone', 'Phone', 'Teléfono'],
  impression: ['Impression et reprographie', 'Printing', 'Impresión'],
  publicite:  ['Publicité', 'Advertising', 'Publicidad'],
  // administratif
  taxes:           ['Taxes et impôts', 'Taxes', 'Impuestos'],
  assurances:      ['Assurances', 'Insurance', 'Seguros'],
  honoraires:      ['Honoraires', 'Professional fees', 'Honorarios'],
  frais_bancaires: ['Frais bancaires', 'Bank charges', 'Gastos bancarios'],
  licences:        ['Licences et abonnements', 'Licences and subscriptions', 'Licencias'],
  // vie_scolaire
  activites:  ['Activités', 'Activities', 'Actividades'],
  sorties:    ['Sorties pédagogiques', 'Field trips', 'Excursiones'],
  sport:      ['Sport', 'Sport', 'Deporte'],
  ceremonies: ['Cérémonies', 'Ceremonies', 'Ceremonias'],
  sante:      ['Santé et infirmerie', 'Health', 'Salud'],
  // securite
  gardiennage:         ['Gardiennage', 'Security guarding', 'Vigilancia'],
  equipements_securite: ['Équipements de sécurité', 'Security equipment', 'Equipos de seguridad'],
  extincteurs:         ['Extincteurs', 'Fire extinguishers', 'Extintores'],
};

const CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key);
const SUBS_BY_CATEGORY = new Map(EXPENSE_CATEGORIES.map((c) => [c.key, c.subs]));

export const isKnownCategory = (key) => CATEGORY_KEYS.includes(key);
export const isKnownSubcategory = (key) => Object.prototype.hasOwnProperty.call(EXPENSE_SUBCATEGORY_LABELS, key);

// Sous-catégories du référentiel pour une catégorie donnée.
export const subcategoriesOf = (categoryKey) => SUBS_BY_CATEGORY.get(categoryKey) || [];

// Triplet [fr, en, es] à passer à `t(...)`, ou `null` si la valeur ne vient pas
// du référentiel — l'appelant l'affiche alors telle quelle.
export const categoryLabel = (key) => EXPENSE_CATEGORY_LABELS[key] || null;
export const subcategoryLabel = (key) => EXPENSE_SUBCATEGORY_LABELS[key] || null;

// Valeurs RÉELLEMENT employées par l'école, relevées sur ses dépenses.
// `subsByCategory` garde le lien catégorie → sous-catégories observées, pour ne
// pas proposer sous « Cantine » une sous-catégorie que l'école n'a jamais
// employée que sous « Transport ».
export function usedValues(expenses = []) {
  const categories = new Set();
  const subsByCategory = new Map();
  const subsOrphelines = new Set();   // sous-catégorie saisie sans catégorie
  for (const e of expenses) {
    const c = (e?.category || '').trim();
    const s = (e?.subcategory || '').trim();
    if (c) categories.add(c);
    if (!s) continue;
    if (!c) { subsOrphelines.add(s); continue; }
    if (!subsByCategory.has(c)) subsByCategory.set(c, new Set());
    subsByCategory.get(c).add(s);
  }
  return { categories, subsByCategory, subsOrphelines };
}

// Options de CATÉGORIE : le référentiel d'abord (ordre métier), puis les valeurs
// hors référentiel déjà employées par l'école (ordre alphabétique), puis la
// valeur courante si elle n'apparaît nulle part — sans quoi modifier une vieille
// dépense effacerait silencieusement sa catégorie.
export function categoryOptions(expenses = [], current = '') {
  const { categories } = usedValues(expenses);
  const extras = [...categories].filter((c) => !isKnownCategory(c)).sort((a, b) => a.localeCompare(b));
  const cur = (current || '').trim();
  if (cur && !isKnownCategory(cur) && !extras.includes(cur)) extras.push(cur);
  return [
    ...CATEGORY_KEYS.map((key) => ({ value: key, known: true })),
    ...extras.map((value) => ({ value, known: false })),
  ];
}

// Options de SOUS-CATÉGORIE pour une catégorie. Même règle, plus un repli : si
// la catégorie est hors référentiel, on ne propose que ce que l'école a déjà
// employé sous cette catégorie (et les sous-catégories jamais rattachées).
export function subcategoryOptions(expenses = [], categoryKey = '', current = '') {
  const { subsByCategory, subsOrphelines } = usedValues(expenses);
  const connues = subcategoriesOf(categoryKey);
  const vues = new Set([
    ...(subsByCategory.get(categoryKey) || []),
    ...(categoryKey ? [] : subsOrphelines),
  ]);
  const extras = [...vues].filter((s) => !connues.includes(s)).sort((a, b) => a.localeCompare(b));
  const cur = (current || '').trim();
  if (cur && !connues.includes(cur) && !extras.includes(cur)) extras.push(cur);
  return [
    ...connues.map((value) => ({ value, known: true })),
    ...extras.map((value) => ({ value, known: false })),
  ];
}
