// LIBELLÉS ANGLAIS DES RÉFÉRENTIELS OFFICIELS — traduction du CONTENU, pas du cadre.
//
// Les bulletins officiels savaient déjà se rendre dans le SYSTÈME de la classe
// (FR/EN/ES) : en-têtes, colonnes, pieds, signatures passent tous par le helper
// `L(sys, fr, en, es)`. Mais le TEXTE VENU DU RÉFÉRENTIEL — domaines de la
// maternelle, compétences nationales du primaire, critères, libellés de cote,
// noms de matières du premier cycle — est stocké EN FRANÇAIS en base, une seule
// fois pour tout le pays. Résultat : un bulletin du secteur anglophone (Nursery,
// Class 1–6, Form 1–5) sortait avec son cadre en anglais et ses compétences en
// français.
//
// Ce module ne traduit RIEN à la volée et ne touche JAMAIS le stockage : il porte
// la table officielle bilingue, indexée par les IDENTIFIANTS STABLES du
// référentiel (jamais par le texte français, qui dérive au moindre accent ou
// apostrophe typographique). Un identifiant absent de la table rend le libellé
// d'origine : sur un document officiel, mieux vaut un intitulé français qu'un
// intitulé vide.
//
// Le sous-système hispanophone (Guinée Équatoriale) a ses propres moteurs
// (BoletinGE) et n'utilise pas ces référentiels camerounais : 'ES' retombe donc
// sur le français, comme le fait déjà `L`.

// Choix du libellé : 'EN' → traduction si connue, sinon le libellé d'origine.
const pick = (map, id, fallback, sys) => {
  if (sys !== 'EN') return fallback ?? '';
  const k = String(id ?? '').trim().toLowerCase();
  return map[k] ?? (fallback ?? '');
};

// ── MATERNELLE (MINEDUB) — Nursery 1/2/3 ──────────────────────────────────────
// Les 8 domaines pédagogiques du préscolaire. Ids = `mat_domaines.id`.
export const MAT_DOMAINE_EN = {
  langage_communication:  'Language and communication',
  prelecture_preecriture: 'Pre-reading and pre-writing',
  prenumeration_logique:  'Pre-numeracy and logical reasoning',
  psychomotricite:        'Psychomotor skills',
  decouverte_monde:       'Discovery of the world',
  vie_sociale_affective:  'Social and emotional life',
  activites_artistiques:  'Artistic activities',
  autonomie_personnelle:  'Personal autonomy',
};

// Niveaux d'acquisition (A / ECA / NA). Mêmes mots que la légende du bulletin
// maternelle, pour qu'une cote et sa légende ne se contredisent jamais.
export const MAT_ACQUIS_EN = { a: 'Achieved', eca: 'In progress', na: 'Not achieved' };

// Le SIGLE lui-même, pas seulement son libellé. « A » et « NA » se lisent dans les
// deux langues (Acquis/Achieved, Non acquis/Not achieved) — « ECA » non : c'est
// l'abréviation d'« En Cours d'Acquisition », illisible sur un bulletin anglophone,
// où la cote se dit « In Progress » → IP.
//
// CECI EST UN AFFICHAGE, PAS UN STOCKAGE. `mat_observations.niveau_acquis` garde
// les trois valeurs canoniques 'A' | 'ECA' | 'NA' — c'est ce que sa contrainte de
// domaine accepte (cf. supabase_mat_observation_sans_cote.sql), et ce qui permet à
// une école bilingue de produire les deux bulletins depuis la même observation.
// Rien ne doit écrire 'IP' en base.
export const MAT_ACQUIS_CODE_EN = { a: 'A', eca: 'IP', na: 'NA' };

export const matDomaineLabel = (domaine, sys) =>
  pick(MAT_DOMAINE_EN, domaine?.id, domaine?.intitule, sys);
export const matAcquisLabel = (code, fallback, sys) =>
  pick(MAT_ACQUIS_EN, code, fallback, sys);

// Sigle affiché d'une cote, dans le système de la classe. Toujours à partir du
// code CANONIQUE stocké.
export const matAcquisCode = (code, sys) =>
  pick(MAT_ACQUIS_CODE_EN, code, String(code ?? ''), sys);

// Lecture inverse — reconnaît un sigle saisi ou importé, FR comme EN, et rend le
// code canonique à stocker. Sert à l'import de la grille de saisie : une école
// anglophone exporte « IP », elle doit pouvoir réimporter son propre fichier.
export function matAcquisFromInput(raw) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'A') return 'A';
  if (v === 'NA') return 'NA';
  if (v === 'ECA' || v === 'IP') return 'ECA';
  return null;
}

// ── PRIMAIRE APC (MINEDUB) — Class 1–6 ────────────────────────────────────────
// Les 11 compétences nationales, fixes du SIL au CM2. Ids = `prim_competences.id`
// (1a…6b), stables : le carnet officiel les numérote 1A…6B.
export const PRIM_COMPETENCE_EN = {
  '1a': 'Communicate in French',
  '1b': 'Communicate in English',
  '1c': 'Practise a national language',
  '2a': 'Use basic notions in mathematics',
  '2b': 'Use basic notions in science and technology',
  '3a': 'Practise social values',
  '3b': 'Practise citizenship values',
  '4a': 'Demonstrate autonomy, initiative, creativity and entrepreneurship',
  '5a': 'Use basic ICT concepts and tools',
  '6a': 'Practise physical and sporting activities',
  '6b': 'Practise artistic activities',
};

// Les 4 critères d'évaluation de chaque compétence. Ids = `prim_criteres.id`.
export const PRIM_CRITERE_EN = {
  oral:        'Oral',
  ecrit:       'Written',
  pratique:    'Practical',
  savoir_etre: 'Attitude',
};

// Libellés des cotes du primaire. Clé = le CODE de cote (A+/A/ECA/NA), pas l'id
// de la ligne de barème : le barème est reconfigurable par l'établissement mais
// les quatre codes officiels, eux, ne bougent pas.
export const PRIM_COTE_EN = {
  'a+': 'Very well achieved',
  a:    'Achieved',
  eca:  'In progress',
  na:   'Not achieved',
};

export const primCompetenceLabel = (competence, sys) =>
  pick(PRIM_COMPETENCE_EN, competence?.id, competence?.intitule, sys);
export const primCritereLabel = (critere, sys) =>
  pick(PRIM_CRITERE_EN, critere?.id, critere?.nom, sys);
export const primCoteLabel = (cote, fallback, sys) =>
  pick(PRIM_COTE_EN, cote, fallback, sys);

// ── PREMIER CYCLE APC (MINESEC) — noms de matières ────────────────────────────
// Le catalogue anglophone a ses propres slugs ('english', 'mathematics'… cf.
// supabase_apc_anglophone.sql) et ses noms sont déjà en anglais : rien à traduire
// pour eux. Mais une classe anglophone retombe sur le catalogue FRANCOPHONE tant
// que l'établissement n'a pas importé son référentiel CBA (`matieresForApcClasse`
// finit par proposer tout le catalogue) — et alors « Éducation à la Citoyenneté
// et à la Morale » s'imprimait sur un bulletin anglophone. Ids = `apc_matieres.id`
// francophones ; les sigles officiels (SVTEEHB, PCT, EPS) sont développés, car
// un sigle francophone ne dit rien à un lecteur anglophone.
export const APC_MATIERE_EN = {
  anglais:        'English Language',
  francais:       'French',
  mathematiques:  'Mathematics',
  informatique:   'Computer Science',
  histoire:       'History',
  geographie:     'Geography',
  sciences:       'General Science',
  svteehb:        'Biology, Environmental Education, Health & Biotechnology',
  pct:            'Physics, Chemistry & Technology',
  eps:            'Physical Education and Sport',
  esf:            'Home Economics',
  travail_manuel: 'Manual Labour',
  eac:            'Arts and Cultural Education',
  ecm:            'Citizenship and Moral Education',
  cultures_nat:   'National Cultures',
  langues_nat:    'National Languages',
  latin:          'Latin',
  grec:           'Greek',
  allemand:       'German',
  arabe:          'Arabic',
  espagnol:       'Spanish',
  italien:        'Italian',
  chinois:        'Chinese',
};

export const apcMatiereLabel = (matiere, sys) =>
  pick(APC_MATIERE_EN, matiere?.id, matiere?.nom, sys);
