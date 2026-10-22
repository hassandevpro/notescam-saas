// Rapprochement MATIÈRE ↔ COMPÉTENCE nationale du primaire (MINEDUB).
//
// L'écran de saisie primaire est organisé par COMPÉTENCE (1A–6B), pas par
// matière. Le lien canonique est `subjects.prim_competence_id`, posé par la
// configuration automatique du primaire — mais celle-ci refuse toute classe qui
// porte déjà des matières (`schoolStore.autoConfigPrim`), et aucun écran ne
// l'appelle. Une école qui a saisi son primaire à la main n'a donc AUCUN lien :
// le mode « enseignant de matière » n'avait alors rien sur quoi se baser et
// servait un écran vide. Mesuré sur la base : 122 matières primaire affectées
// sans lien, contre 66 avec.
//
// On résout donc le lien, dans cet ordre :
//   1. `prim_competence_id` s'il est posé — il fait foi, toujours ;
//   2. le libellé, le code ou l'id de la compétence (école qui nomme ses
//      matières comme le référentiel) ;
//   3. une table de mots-clés, parce que les écoles écrivent « Lecture »,
//      « SVT » ou « EPS » là où le référentiel dit « Communiquer en français »,
//      « sciences et technologies » ou « activités physiques et sportives ».
//
// Une matière non résolue reste HORS périmètre : mieux vaut la NOMMER à
// l'enseignant que de lui ouvrir une compétence au hasard. La granularité est
// celle du référentiel : « Lecture » et « Grammaire » tombent toutes deux sur
// 1A, parce qu'il n'existe qu'UNE compétence de français — deux enseignants qui
// se partagent le français partagent donc 1A, et c'est fidèle au référentiel.

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokensOf = (s) => norm(s).split(' ').filter(Boolean);

// Quelques libellés espagnols sont acceptés là où la compétence est la MÊME
// (mathématiques, sciences, sport…). « Lengua Española » n'y figure pas : le
// référentiel ne connaît qu'une compétence de français (1A) et une d'anglais
// (1B), aucune d'espagnol — la rattacher à 1A serait un faux. Une école
// hispanophone a de toute façon ses propres moteurs (cf. referentielI18n) ; si
// ses classes atterrissent ici, c'est son `bulletin_engine` qu'il faut revoir.
//
// Mots-clés par compétence. Les clés sont les codes officiels MINEDUB (stables).
// Une entrée contenant une ESPACE est cherchée comme expression (sous-chaîne) et
// testée AVANT les mots simples : « éducation physique » doit tomber sur 6A, pas
// sur 2B via « physique ».
const KEYWORDS = {
  '1a': ['expression ecrite', 'expression orale', 'langue francaise', 'communication ecrite',
    'francais', 'french', 'lecture', 'ecriture', 'grammaire', 'orthographe',
    'conjugaison', 'vocabulaire', 'dictee', 'recitation', 'orthographique',
    'frances'],
  '1b': ['english language', 'anglais', 'english', 'ingles'],
  // ── NOMS ANGLAIS : RELEVÉ EN PRODUCTION le 2026-10-21 ────────────────────
  // 66 matières de classe sur 621 n'apparaissaient pas à la saisie du primaire
  // (10,6 %), presque toutes dans des écoles anglophones ou bilingues qui
  // nomment leurs matières en anglais alors que le référentiel est stocké en
  // français. Les ajouts ci-dessous viennent de cette mesure, nom par nom —
  // aucun n'est supposé.
  '1c': ['langue nationale', 'langues nationales', 'culture nationale', 'cultures nationales',
    'national language', 'national languages', 'national culture', 'national cultures',
    'langue maternelle'],
  '2a': ['mathematiques', 'mathematique', 'mathematics', 'maths', 'math', 'calcul',
    'arithmetique', 'geometrie', 'numeration', 'matematicas'],
  // « Physics & Chemistry » et « Chemistry » sont des expressions AVANT d'être
  // des mots : la barre oblique et l'esperluette deviennent des espaces.
  '2b': ['sciences et technologie', 'sciences et technologies', 'science et technologie',
    'physics chemistry', 'chemistry physics', 'natural science', 'natural sciences',
    'science and technology',
    'sciences', 'science', 'svteehb', 'svt', 'set', 'technologie', 'technologies',
    'ciencias naturales',
    'biologie', 'chimie', 'eehb', 'physique',
    'chemistry', 'physics', 'biology', 'technology'],
  // « Moral Education » est une EXPRESSION de 3A : testée avant les mots
  // simples, elle passe donc devant « education civique » de 3B.
  '3a': ['valeurs sociales', 'education sociale', 'vivre ensemble', 'moral education',
    'morale', 'moral'],
  '3b': ['histoire geographie', 'education civique', 'vie et citoyennete',
    'educacion para la ciudadania', 'ciencias sociales',
    'social studies', 'civic education', 'citizenship education',
    'citoyennete', 'civique', 'civics', 'civic', 'citizenship', 'ecm', 'evc',
    'histoire', 'geographie', 'history', 'geography', 'geo'],
  '4a': ['esprit d initiative', 'entrepreneuriat', 'autonomie', 'initiative', 'creativite'],
  // « information technology » est posée ICI, en expression, pour qu'elle ne
  // tombe pas sur « technology » de 2B : les expressions passent avant les mots
  // simples, et 2B est examinée avant 5A.
  '5a': ['technologies de l information', 'information technology',
    'informatique', 'computer science', 'computer studies',
    'tic', 'ict', 'numerique', 'computer'],
  '6a': ['education physique', 'activites physiques', 'physical education',
    'educacion fisica',
    'eps', 'sport', 'sports'],
  '6b': ['arts plastiques', 'education artistique', 'activites artistiques',
    'arts', 'art', 'musique', 'music', 'dessin', 'artistique', 'chant', 'danse'],
};

// Ordre de résolution déterministe (indépendant de l'ordre du référentiel).
const ORDER = ['1a', '1b', '1c', '2a', '2b', '3a', '3b', '4a', '5a', '6a', '6b'];

// Compétence d'une matière, ou null si elle ne se rattache à rien.
//   subject     : ligne `subjects` ({ name, prim_competence_id })
//   competences : compétences du référentiel ([{ id, code, intitule }]) — sert à
//                 ne jamais renvoyer une compétence absente du référentiel chargé.
export function competenceIdForSubject(subject, competences) {
  if (!subject) return null;
  const known = new Set((competences || []).map((c) => c.id));
  const ok = (id) => (known.size === 0 || known.has(id) ? id : null);

  // 1) Lien explicite — il fait foi, même s'il contredit le nom.
  if (subject.prim_competence_id) return ok(subject.prim_competence_id);

  const name = norm(subject.name);
  if (!name) return null;
  const toks = tokensOf(subject.name);

  // 2) La matière porte le nom, le code ou l'id d'une compétence.
  for (const c of competences || []) {
    if (norm(c.intitule) === name || norm(c.code) === name || norm(c.id) === name) return c.id;
  }

  // 3) Mots-clés : expressions d'abord, mots simples ensuite.
  for (const pass of [1, 2]) {
    for (const id of ORDER) {
      if (known.size && !known.has(id)) continue;
      for (const kw of KEYWORDS[id] || []) {
        const isPhrase = kw.includes(' ');
        if (pass === 1 && !isPhrase) continue;
        if (pass === 2 && isPhrase) continue;
        if (isPhrase ? name.includes(kw) : toks.includes(kw)) return id;
      }
    }
  }
  return null;
}

// Compétences couvertes par les matières affectées à l'enseignant sur une classe.
export function competenceIdsForTeacher(subjects, teacherId, classId, competences) {
  const out = new Set();
  if (!teacherId) return out;
  for (const s of subjects || []) {
    if (s.teacher_id !== teacherId) continue;
    if (classId && s.class_id !== classId) continue;
    const id = competenceIdForSubject(s, competences);
    if (id) out.add(id);
  }
  return out;
}

// Matières affectées à l'enseignant qui ne se rattachent à AUCUNE compétence —
// à nommer dans l'écran plutôt que de laisser l'enseignant devant du vide.
export function unresolvedSubjectsForTeacher(subjects, teacherId, classId, competences) {
  if (!teacherId) return [];
  return (subjects || []).filter((s) => s.teacher_id === teacherId
    && (!classId || s.class_id === classId)
    && !competenceIdForSubject(s, competences));
}
