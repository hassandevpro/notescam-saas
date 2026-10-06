// Rapprochement MATIÈRE LOCALE ↔ MATIÈRE DU RÉFÉRENTIEL APC (premier cycle).
//
// L'écran de saisie APC est organisé par matière du référentiel MINESEC (ou CBA
// anglophone). La ligne `subjects` locale, elle, ne porte PAS l'id du référentiel
// (voir `subjectsFromApcReferentiel`) : le seul lien disponible est le texte du
// nom. Or les écoles n'écrivent pas les noms officiels — relevé sur la base :
// « SVT » pour SVTEEHB, « MATh » pour Mathématiques, « Éducation Civique » pour
// ECM, « French Language » pour French.
//
// Un cas mérite une mention : **une matière locale peut en couvrir PLUSIEURS**.
// « Histoire-Géo » est une seule ligne `subjects`, mais le référentiel compte
// Histoire et Géographie séparément. L'enseignant doit donc voir les DEUX, sans
// qu'on aille scinder sa matière (ce qui changerait le bulletin de la classe).
//
// Résolution, dans cet ordre :
//   1. le nom EXACT du référentiel — libellé localisé, nom officiel, ou id/sigle ;
//   2. la table d'alias ci-dessous, du motif le plus SPÉCIFIQUE au plus général
//      (« histoire geographie » avant « histoire »), premier motif gagnant.
//
// Les cibles sont toujours intersectées avec les matières réellement DISPONIBLES
// pour la classe : lister les slugs francophones et anglophones côte à côte est
// donc sans risque, seul le catalogue chargé répond.
//
// Une matière non résolue reste HORS périmètre et l'écran la NOMME : une faute de
// frappe (« Allamand ») doit se corriger dans Matières, pas s'apprendre ici.

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Alias : { p: motif normalisé, t: [ids du référentiel] }.
// ORDRE SIGNIFICATIF — les motifs les plus longs d'abord, car le premier qui
// correspond gagne. Un motif d'un seul mot est comparé au mot entier ; un motif
// de plusieurs mots est cherché comme expression.
const ALIASES = [
  // Histoire-Géographie : une matière locale, deux matières officielles.
  { p: 'histoire geographie', t: ['histoire', 'geographie', 'history', 'geography'] },
  { p: 'histoire et geographie', t: ['histoire', 'geographie', 'history', 'geography'] },
  { p: 'histoire geo', t: ['histoire', 'geographie', 'history', 'geography'] },
  { p: 'hist geo', t: ['histoire', 'geographie', 'history', 'geography'] },
  { p: 'history and geography', t: ['history', 'geography', 'histoire', 'geographie'] },

  // Éducation à la Citoyenneté et à la Morale.
  { p: 'education a la citoyennete', t: ['ecm', 'citizenship'] },
  { p: 'citizenship education', t: ['citizenship', 'ecm'] },
  { p: 'education civique', t: ['ecm', 'citizenship'] },
  { p: 'instruction civique', t: ['ecm', 'citizenship'] },
  { p: 'citoyennete', t: ['ecm', 'citizenship'] },
  { p: 'civique', t: ['ecm', 'citizenship'] },
  { p: 'ecm', t: ['ecm', 'citizenship'] },
  { p: 'evc', t: ['ecm', 'citizenship'] },

  // Sciences de la Vie, de la Terre, Éducation à l'Environnement, Hygiène et Biologie.
  { p: 'sciences de la vie', t: ['svteehb', 'biology'] },
  { p: 'svteehb', t: ['svteehb', 'biology'] },
  { p: 'svt', t: ['svteehb', 'biology'] },

  // Physique, Chimie, Technologie.
  { p: 'physique chimie technologie', t: ['pct', 'physics', 'chemistry'] },
  { p: 'pct', t: ['pct', 'physics', 'chemistry'] },

  // Français / anglais : le catalogue anglophone dit « French » et « English ».
  { p: 'french language', t: ['french', 'francais'] },
  { p: 'english language', t: ['english', 'anglais'] },
  { p: 'correction orthographique', t: ['francais', 'french'] },
  { p: 'expression ecrite', t: ['francais', 'french'] },
  { p: 'francais', t: ['francais', 'french'] },
  { p: 'french', t: ['french', 'francais'] },
  { p: 'anglais', t: ['anglais', 'english'] },
  { p: 'english', t: ['english', 'anglais'] },

  // Mathématiques, et ses abréviations.
  { p: 'mathematiques', t: ['mathematiques', 'mathematics'] },
  { p: 'mathematics', t: ['mathematics', 'mathematiques'] },
  { p: 'mathematique', t: ['mathematiques', 'mathematics'] },
  { p: 'maths', t: ['mathematiques', 'mathematics'] },
  { p: 'math', t: ['mathematiques', 'mathematics'] },

  // Éducation physique et sportive.
  { p: 'education physique', t: ['eps', 'physical_education'] },
  { p: 'physical education', t: ['physical_education', 'eps'] },
  { p: 'eps', t: ['eps', 'physical_education'] },

  // Informatique / TIC.
  { p: 'computer science', t: ['computer_science', 'informatique'] },
  { p: 'informatique', t: ['informatique', 'computer_science'] },
  { p: 'tic', t: ['informatique', 'computer_science'] },

  // Éducation Artistique et Culturelle, travail manuel, ESF.
  { p: 'education artistique', t: ['eac'] },
  { p: 'travail manuel', t: ['travail_manuel', 'manual_labour'] },
  { p: 'manual labour', t: ['manual_labour', 'travail_manuel'] },
  { p: 'economie sociale et familiale', t: ['esf', 'food_science'] },
  { p: 'esf', t: ['esf', 'food_science'] },

  // Langues et cultures nationales.
  { p: 'langues nationales', t: ['langues_nat', 'national_languages'] },
  { p: 'langue nationale', t: ['langues_nat', 'national_languages'] },
  { p: 'cultures nationales', t: ['cultures_nat', 'national_languages'] },
];

// Matières du référentiel couvertes par une matière locale.
//   name     : nom de la ligne `subjects`
//   matieres : matières DISPONIBLES pour la classe ([{ id, nom, nomOfficiel? }])
//   label    : (m) => libellé affiché, pour reconnaître un nom localisé
export function matiereIdsForSubject(name, matieres, label = (m) => m?.nom) {
  const out = new Set();
  const n = norm(name);
  if (!n || !matieres?.length) return out;
  const available = new Set(matieres.map((m) => m.id));

  // 1) Nom exact du référentiel : libellé affiché, nom officiel, ou id/sigle.
  for (const m of matieres) {
    if (norm(label(m)) === n || norm(m.nomOfficiel ?? m.nom) === n || norm(m.id) === n) {
      out.add(m.id);
    }
  }
  if (out.size) return out;

  // 2) Alias, du plus spécifique au plus général — premier motif gagnant.
  const toks = n.split(' ').filter(Boolean);
  for (const { p, t } of ALIASES) {
    const hit = p.includes(' ') ? n.includes(p) : toks.includes(p);
    if (!hit) continue;
    for (const id of t) if (available.has(id)) out.add(id);
    if (out.size) return out;
  }
  return out;
}

// Matières du référentiel couvertes par les matières affectées à l'enseignant.
export function matiereIdsForTeacher(subjects, teacherId, classId, matieres, label) {
  const out = new Set();
  if (!teacherId) return out;
  for (const s of subjects || []) {
    if (s.teacher_id !== teacherId) continue;
    if (classId && s.class_id !== classId) continue;
    for (const id of matiereIdsForSubject(s.name, matieres, label)) out.add(id);
  }
  return out;
}

// Matières affectées qui ne se rattachent à RIEN — à nommer dans l'écran.
export function unresolvedSubjectsForTeacher(subjects, teacherId, classId, matieres, label) {
  if (!teacherId) return [];
  return (subjects || []).filter((s) => s.teacher_id === teacherId
    && (!classId || s.class_id === classId)
    && matiereIdsForSubject(s.name, matieres, label).size === 0);
}
