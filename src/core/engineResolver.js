// Résolution du moteur pédagogique PAR CLASSE (logique pure, sans React).
//
// Un même établissement peut faire tourner PLUSIEURS moteurs référentiels en même
// temps selon le NIVEAU de la classe (pas seulement le drapeau école) :
//   • maternelle    (PS/MS/GS)                    → domaines pédagogiques (A/ECA/NA)
//   • apc_primaire  (SIL…CM2)                      → compétences nationales APC
//   • apc           (6e–3e, premier cycle sec.)    → compétences MINESEC
//   • sc            (2nde–Tle, second cycle sec.)  → matières/séries MINESEC
//   • classic       (tout le reste)                → notes/20 historiques
//
//   school.bulletin_engine :
//     - 'classic'      : aucun moteur référentiel — comportement historique.
//     - 'maternelle'   : maternelle par domaines (niveaux PS/MS/GS uniquement).
//     - 'apc_primaire' : primaire APC par compétences (SIL…CM2 uniquement).
//     - 'minedub'      : PARAPLUIE fondamental — maternelle SUR PS/MS/GS + APC
//                        primaire SUR SIL…CM2 selon le niveau de la classe.
//     - 'apc_minesec'  : APC sur le premier cycle secondaire uniquement.
//     - 'minesec'      : APC (1er cycle) ET SC-MINESEC (2nd cycle) selon le niveau.
//
// SURCHARGE PAR CLASSE : `classes.bulletin_engine` (nullable) prime sur le drapeau
// école. Permet à une école privée « classique » d'exposer une classe APC, ou à
// une école MINEDUB de forcer une classe en notes/20 classiques.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Jetons alphanumériques normalisés d'un (niveau, nom) — évite les collisions des
// codes courts (ps, cp, ce1…) qu'un simple `includes` sur chaîne provoquerait.
const tokens = (level, name = '') =>
  (norm(level) + ' ' + norm(name)).split(/[^a-z0-9]+/).filter(Boolean);

// Niveau premier cycle (collège) : 6e/5e/4e/3e. Sous-système anglophone (Cameroun
// bilingue) : Form 1–5 (fin O-Level) sont aussi du premier cycle.
export const isFirstCycle = (level, name = '') => firstCycleClasseSlug(level, name) !== null;

// Niveau second cycle (lycée général) : Seconde / Première / Terminale, ou
// anglophone Lower/Upper Sixth (A-Level).
export const isSecondCycle = (level, name = '') => secondCycleClasseSlug(level, name) !== null;

// Slug de classe premier cycle référentiel :
//   • francophone → '6e'|'5e'|'4e'|'3e' (référentiel APC MINESEC français) ;
//   • anglophone  → 'form1'…'form5' (référentiel CBA anglophone DÉDIÉ, clés
//     distinctes → les deux référentiels coexistent sans collision).
// null si le niveau n'est pas un premier cycle.
export const firstCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/6e|6eme|sixi/.test(n)) return '6e';
  if (/5e|5eme|cinqu/.test(n)) return '5e';
  if (/4e|4eme|quatr/.test(n)) return '4e';
  if (/3e|3eme|troisi/.test(n)) return '3e';
  const f = n.match(/form([1-5])/);
  if (f) return `form${f[1]}`;
  return null;
};

// Slug de classe second cycle ('2nde' | '1ere' | 'tle') ou null.
// Anglophone : Lower Sixth → 1ere, Upper Sixth → tle (A-Level = Première+Terminale).
export const secondCycleClasseSlug = (level, name = '') => {
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  if (/2nde|2de|seconde/.test(n)) return '2nde';
  if (/1ere|1re|premiere/.test(n)) return '1ere';
  if (/tle|tale|terminale/.test(n)) return 'tle';
  if (/lowersixth|lower6|\bl6\b|1stsixth/.test(n)) return '1ere';
  if (/uppersixth|upper6|\bu6\b|2ndsixth/.test(n)) return 'tle';
  return null;
};

// ── FONDAMENTAL : maternelle (PS/MS/GS) et primaire APC (SIL…CM2) ─────────────

// Niveau maternelle → slug référentiel 'ps' | 'ms' | 'gs', sinon null.
// Anglophone : Nursery 1→PS, 2→MS, 3→GS ; Kindergarten / KG → GS.
export const maternelleNiveauSlug = (level, name = '') => {
  const t = tokens(level, name);
  const s = t.join(' ');
  if (t.includes('ps') || /petite section/.test(s)) return 'ps';
  if (t.includes('ms') || /moyenne section/.test(s)) return 'ms';
  if (t.includes('gs') || /grande section/.test(s)) return 'gs';
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  // Pré-maternelle (« Pre-Nursery » / « Pré-nursery ») → PS (niveau le plus jeune
  // du référentiel MINEDUB, qui ne compte que 3 niveaux PS/MS/GS).
  if (/pre-?nursery|prenursery|prematernelle/.test(n)) return 'ps';
  const ny = n.match(/nursery([1-3])/);
  if (ny) return { 1: 'ps', 2: 'ms', 3: 'gs' }[ny[1]];
  if (t.includes('kg') || /kindergarten/.test(s)) return 'gs';
  // Crèche / garderie / pré-scolaire, et « Nursery » SANS numéro : des classes
  // d'accueil bien réelles que le référentiel MINEDUB ne nomme pas (il ne connaît
  // que PS/MS/GS). Sans elles ici, la classe retombait en section 'autre' —
  // c'est-à-dire dans AUCUN périmètre : invisible pour tout compte borné à un
  // cycle (directeur du primaire, sa secrétaire, un surveillant de secteur) et
  // visible des seuls comptes globaux. Une classe que personne de responsable ne
  // voit est pire qu'une classe mal classée. On la rattache au niveau le plus
  // jeune du référentiel, PS.
  if (/creche|garderie|day-?care|pre-?scolaire|pre-?school/.test(n)) return 'ps';
  if (/nursery/.test(n)) return 'ps';
  return null;
};

// Niveau primaire → slug référentiel 'sil'|'cp'|'ce1'|'ce2'|'cm1'|'cm2', sinon null.
// Anglophone : Class / Standard / Primary 1–6 → SIL/CP/CE1/CE2/CM1/CM2.
export const primaireNiveauSlug = (level, name = '') => {
  const t = tokens(level, name);
  for (const code of ['sil', 'cp', 'ce1', 'ce2', 'cm1', 'cm2']) {
    if (t.includes(code)) return code;
  }
  const s = t.join(' ');
  if (/section d initiation|cours d initiation|initiation au langage/.test(s)) return 'sil';
  const n = (norm(level) + ' ' + norm(name)).replace(/\s+/g, '');
  const c = n.match(/(?:class|standard|std|primary|pry)([1-6])/);
  if (c) return { 1: 'sil', 2: 'cp', 3: 'ce1', 4: 'ce2', 5: 'cm1', 6: 'cm2' }[c[1]];
  return null;
};

// ── Programme Bilingue Spécial : classes EN SERVICE ──────────────────────────
// Source de vérité unique (bilEngine la ré-exporte). Form 4 et Form 5 figurent
// dans le référentiel de l'arrêté 239-23 mais ne sont PAS en service : l'arrêté
// y prévoit des « matières au choix selon les orientations », dont ni les
// combinaisons offertes par l'établissement ni l'affectation par élève ne sont
// connues. Une Form 4 configurée aujourd'hui ne recevrait que ses 4 matières
// obligatoires, et son total de coefficients serait donc FAUX.
export const BIL_CLASSES_EN_SERVICE  = ['6e', '5e', '4e', '3e', 'form1', 'form2', 'form3'];
export const BIL_CLASSES_HORS_SERVICE = ['form4', 'form5'];
export const isBilClasseEnService = (classeSlug) => BIL_CLASSES_EN_SERVICE.includes(classeSlug);

export const isMaternelle = (level, name = '') => maternelleNiveauSlug(level, name) !== null;
export const isPrimaire   = (level, name = '') => primaireNiveauSlug(level, name) !== null;

// ── SECTION pédagogique d'une classe (regroupement pour les sélecteurs) ──────
// Sert à filtrer les longues listes de classes : on choisit d'abord la section,
// puis la classe. Labels FR/EN/ES fournis comme données (pas de dépendance UI).
export const SECTIONS = [
  { key: 'maternelle',    fr: 'Maternelle',    en: 'Nursery',      es: 'Preescolar' },
  { key: 'primaire',      fr: 'Primaire',      en: 'Primary',      es: 'Primaria' },
  { key: 'premier_cycle', fr: 'Premier cycle', en: 'First cycle',  es: 'Primer ciclo' },
  { key: 'second_cycle',  fr: 'Second cycle',  en: 'Second cycle', es: 'Segundo ciclo' },
  { key: 'autre',         fr: 'Autre',         en: 'Other',        es: 'Otro' },
];

export function classSectionKey(cls) {
  const level = cls?.level || '', name = cls?.name || '';
  if (isMaternelle(level, name))  return 'maternelle';
  if (isPrimaire(level, name))    return 'primaire';
  if (isFirstCycle(level, name))  return 'premier_cycle';
  if (isSecondCycle(level, name)) return 'second_cycle';
  return 'autre';
}

// Mappe un drapeau (école ou surcharge classe) + une classe vers le moteur concret,
// ou null si le drapeau ne s'applique pas à ce niveau (⇒ repli 'classic').
function engineFromFlag(flag, cls) {
  const level = cls?.level || '';
  const name  = cls?.name || '';
  switch (flag) {
    case 'classic':
      return 'classic';
    case 'maternelle':
      return isMaternelle(level, name) ? 'maternelle' : null;
    case 'apc_primaire':
      return isPrimaire(level, name) ? 'apc_primaire' : null;
    case 'minedub':
      if (isMaternelle(level, name)) return 'maternelle';
      if (isPrimaire(level, name))   return 'apc_primaire';
      return null;
    case 'apc_minesec':
      return isFirstCycle(level, name) ? 'apc' : null;
    case 'bilingue_special':
      // Programme d'Éducation Bilingue Spécial (arrêté 239-23/MINESEC du
      // 14/06/2023) — matières + coefficients, PREMIER CYCLE uniquement :
      // 6e–3e (section I-2) et Form 1–5 (section II-2). L'arrêté ne couvre
      // aucune classe de second cycle, donc on ne route rien au-delà.
      //
      // Drapeau DÉDIÉ à dessein : ni 'minesec' ni 'officiel' n'y mènent, pour
      // qu'aucune école déjà configurée ne bascule de moteur sans décision
      // explicite. Une école ordinaire qui n'ouvre qu'une section bilingue pose
      // la surcharge `classes.bulletin_engine = 'bilingue_special'`.
      //
      // ⚠️ PROFIL D'ÉCOLE COMPLET, et non « premier cycle seulement ».
      // `schools.bulletin_engine` vaut pour TOUTE l'école. Une première version
      // ne traitait ici que le premier cycle et renvoyait null partout ailleurs :
      // une école qui activait le bilingue perdait du même coup le bulletin
      // officiel de son PRIMAIRE, de sa MATERNELLE et de son SECOND CYCLE, tous
      // retombés en 'classic' — sans message, le bulletin disparaissait
      // simplement de l'écran. Ce drapeau se comporte donc comme 'officiel',
      // à une substitution près : le premier cycle part sur le programme
      // bilingue spécial au lieu de l'APC ordinaire.
      if (isMaternelle(level, name)) return 'maternelle';
      if (isPrimaire(level, name))   return 'apc_primaire';
      // Form 4 / Form 5 EXCLUES tant que l'établissement n'a pas arrêté ses
      // orientations : leur référentiel comporte des matières « au choix », donc
      // un total de coefficients incomplet. Elles retombent sur le moteur
      // classique — mieux vaut un bulletin qui ne se dit pas officiel qu'un
      // bulletin officiel bâti sur un référentiel partiel.
      if (BIL_CLASSES_EN_SERVICE.includes(firstCycleClasseSlug(level, name))) return 'bilingue';
      if (isFirstCycle(level, name)) return null;   // Form 4/5 : aucun moteur officiel
      if (cls?.serie || isSecondCycle(level, name)) return 'sc';
      return null;
    case 'minesec':
      if (isFirstCycle(level, name)) return 'apc';
      if (cls?.serie || isSecondCycle(level, name)) return 'sc';
      return null;
    case 'officiel':
      // Système officiel camerounais COMPLET : MINEDUB (fondamental) + MINESEC
      // (secondaire). Chaque classe est résolue selon son niveau, du préscolaire
      // à la Terminale. C'est le pendant « tout officiel » du mode 'classic'.
      if (isMaternelle(level, name))  return 'maternelle';
      if (isPrimaire(level, name))    return 'apc_primaire';
      if (isFirstCycle(level, name))  return 'apc';
      if (cls?.serie || isSecondCycle(level, name)) return 'sc';
      return null;
    default:
      return null;
  }
}

// Moteur effectif d'une classe :
//   'maternelle' | 'apc_primaire' | 'apc' | 'sc' | 'bilingue' | 'classic'.
// La surcharge `classes.bulletin_engine` prime sur `school.bulletin_engine`.
export function resolveClassEngine(school, cls) {
  const override = cls?.bulletin_engine;
  if (override) return engineFromFlag(override, cls) || 'classic';
  return engineFromFlag(school?.bulletin_engine || 'classic', cls) || 'classic';
}

// Drapeaux d'établissement de la FAMILLE OFFICIELLE (par opposition à 'classic').
// 'officiel' est le drapeau unifié (fondamental + secondaire) ; les autres restent
// acceptés pour rétro-compatibilité et se comportent comme des sous-ensembles.
export const OFFICIAL_ENGINE_FLAGS = ['officiel', 'minesec', 'apc_minesec', 'minedub', 'maternelle', 'apc_primaire', 'bilingue_special'];
export const isOfficialEngine = (flag) => OFFICIAL_ENGINE_FLAGS.includes(flag);

// ── Classe de référence pour AIGUILLER la saisie ───────────────────────────────
// La page Grades choisit son poste de saisie d'après la classe sélectionnée. Tant
// qu'aucune ne l'est (premier accès, `gradesClassId` vide), il faut bien partir de
// quelque part — et ce « quelque part » doit être une classe que le compte voit
// VRAIMENT. Sans cela, une institutrice dont toutes les classes sont maternelles
// atterrissait sur le poste du PRIMAIRE, qui lui répondait « Aucune classe
// primaire » : ni domaine, ni élève, donc rien à noter.
//
// Ordre pédagogique (maternelle → second cycle), puis nom : déterministe.
const SECTION_ORDER = SECTIONS.map((s) => s.key);

export function defaultRoutingClass(classes) {
  const list = (classes || []).filter(Boolean);
  if (!list.length) return null;
  return list.slice().sort((a, b) =>
    SECTION_ORDER.indexOf(classSectionKey(a)) - SECTION_ORDER.indexOf(classSectionKey(b))
    || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }),
  )[0];
}
