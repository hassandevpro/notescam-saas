// Rapprochement MATIÈRE LOCALE ↔ DOMAINE PÉDAGOGIQUE de la maternelle (MINEDUB).
//
// Troisième résolveur de la famille, après primCompetenceMatch (primaire APC) et
// apcMatiereMatch (collège APC) : même forme, catalogue différent. Les trois
// gagneraient à partager une base commune — à faire à froid, pas en pleine
// correction.
//
// L'écran maternelle est organisé par DOMAINE (D1–D8). Le lien canonique est
// `subjects.mat_domaine_id`, posé par la configuration automatique de la
// maternelle ; comme pour le primaire, une école qui a saisi ses matières à la
// main ne l'a pas. Relevé sur la base : les 18 matières maternelle affectées
// n'ont aucun lien.
//
// RÈGLE PROPRE À LA MATERNELLE — le TITULAIRE garde les 8 domaines. Au collège et
// au lycée, le titulariat ne donne rien à saisir : chaque matière a son
// spécialiste. La maternelle est l'inverse : le référentiel n'est pas un
// découpage disciplinaire mais une grille de DÉVELOPPEMENT de l'enfant, observée
// par l'institutrice de la classe. Restreindre le titulaire à ses seules lignes
// `subjects` rendrait certains domaines inaccessibles à tout le monde — mesuré à
// COLLÈGE LA RETRAITE, où « Vie sociale et affective » (D6) et « Autonomie
// personnelle » (D8) ne correspondent à aucune matière saisie. Un bulletin
// amputé de deux domaines est pire qu'un périmètre large.

const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokensOf = (s) => norm(s).split(' ').filter(Boolean);

// Mots-clés par domaine. Les clés sont les ids officiels MINEDUB (stables).
// Une entrée contenant une ESPACE est cherchée comme expression et testée AVANT
// les mots simples.
const KEYWORDS = {
  langage_communication: ['langage oral', 'expression orale', 'langue orale',
    'langage', 'communication', 'oral', 'parole', 'vocabulaire', 'comptines'],
  prelecture_preecriture: ['graphisme ecriture', 'pre lecture', 'pre ecriture',
    'prelecture', 'preecriture', 'graphisme', 'ecriture', 'lecture', 'trace'],
  prenumeration_logique: ['pre numeration', 'raisonnement logique',
    'prenumeration', 'numeration', 'mathematiques', 'mathematique', 'maths', 'math',
    'logique', 'raisonnement', 'calcul', 'nombres', 'denombrement'],
  psychomotricite: ['motricite fine', 'education physique', 'activites physiques',
    'psychomotricite', 'motricite', 'eps', 'sport', 'jeux moteurs'],
  decouverte_monde: ['decouverte du monde', 'decouverte', 'monde', 'sciences',
    'environnement', 'nature', 'eveil scientifique'],
  vie_sociale_affective: ['vie sociale', 'vie affective', 'vivre ensemble',
    'socialisation', 'affective', 'citoyennete', 'valeurs'],
  activites_artistiques: ['eveil artistique', 'activites artistiques', 'arts plastiques',
    'artistique', 'arts', 'art', 'musique', 'dessin', 'chant', 'danse', 'coloriage'],
  autonomie_personnelle: ['autonomie personnelle', 'hygiene corporelle',
    'autonomie', 'hygiene', 'proprete', 'soins'],
};

// Ordre de résolution déterministe (D1 → D8), indépendant du référentiel chargé.
const ORDER = [
  'langage_communication', 'prelecture_preecriture', 'prenumeration_logique',
  'psychomotricite', 'decouverte_monde', 'vie_sociale_affective',
  'activites_artistiques', 'autonomie_personnelle',
];

// Domaine d'une matière, ou null si elle ne se rattache à rien.
//   subject  : ligne `subjects` ({ name, mat_domaine_id })
//   domaines : domaines du référentiel ([{ id, code, intitule }])
//   label    : (d) => libellé affiché, pour reconnaître un intitulé localisé
export function domaineIdForSubject(subject, domaines, label = (d) => d?.intitule) {
  if (!subject) return null;
  const known = new Set((domaines || []).map((d) => d.id));
  const ok = (id) => (known.size === 0 || known.has(id) ? id : null);

  // 1) Lien explicite — il fait foi, même s'il contredit le nom.
  if (subject.mat_domaine_id) return ok(subject.mat_domaine_id);

  const n = norm(subject.name);
  if (!n) return null;
  const toks = tokensOf(subject.name);

  // 2) La matière porte l'intitulé, le code ou l'id d'un domaine.
  for (const d of domaines || []) {
    if (norm(label(d)) === n || norm(d.intitule) === n || norm(d.code) === n || norm(d.id) === n) {
      return d.id;
    }
  }

  // 3) Mots-clés : expressions d'abord, mots simples ensuite.
  for (const pass of [1, 2]) {
    for (const id of ORDER) {
      if (known.size && !known.has(id)) continue;
      for (const kw of KEYWORDS[id] || []) {
        const isPhrase = kw.includes(' ');
        if (pass === 1 && !isPhrase) continue;
        if (pass === 2 && isPhrase) continue;
        if (isPhrase ? n.includes(kw) : toks.includes(kw)) return id;
      }
    }
  }
  return null;
}

// Domaines couverts par les matières affectées à l'enseignant sur une classe.
export function domaineIdsForTeacher(subjects, teacherId, classId, domaines, label) {
  const out = new Set();
  if (!teacherId) return out;
  for (const s of subjects || []) {
    if (s.teacher_id !== teacherId) continue;
    if (classId && s.class_id !== classId) continue;
    const id = domaineIdForSubject(s, domaines, label);
    if (id) out.add(id);
  }
  return out;
}

// Matières affectées qui ne se rattachent à AUCUN domaine — à nommer dans l'écran.
export function unresolvedSubjectsForTeacher(subjects, teacherId, classId, domaines, label) {
  if (!teacherId) return [];
  return (subjects || []).filter((s) => s.teacher_id === teacherId
    && (!classId || s.class_id === classId)
    && !domaineIdForSubject(s, domaines, label));
}

// L'enseignant est-il le TITULAIRE de cette classe ? Voir l'en-tête : en
// maternelle, le titulaire observe l'enfant sur les 8 domaines.
export function isClassTitulaire(cls, teacherId) {
  return !!teacherId && !!cls && cls.teacher_id === teacherId;
}

// ── INTITULÉ AFFICHÉ D'UN DOMAINE : la surcharge de l'école prime ─────────────
//
// POURQUOI UNE SURCHARGE PLUTÔT QU'UNE ÉDITION. `mat_domaines` est une table
// NATIONALE, partagée par toutes les écoles du pays : y renommer « Psychomotor
// skills » le renommerait pour les 43 autres. Et on ne peut pas non plus laisser
// une école inventer son propre domaine — `mat_observations.domaine_id` porte une
// clé étrangère vers `mat_domaines(id)`, donc une observation ne peut pointer que
// vers un domaine officiel.
//
// La ligne `subjects` de la classe EST la surcharge : elle est propre à l'école,
// elle porte déjà `mat_domaine_id` (posé par l'auto-configuration), et son `name`
// est librement modifiable par l'établissement. On garde donc l'IDENTITÉ
// officielle (l'id, donc la FK et le bulletin ministériel) et on affiche le mot
// de l'école.
//
//   subjects : { class_id, name: 'Éveil au langage', mat_domaine_id: 'langage_communication' }
//   → D1 s'affiche « Éveil au langage » dans CETTE école, « Langage et
//     communication » partout ailleurs.
//
// `fallback` reçoit le libellé officiel déjà localisé (matDomaineLabel) : la
// surcharge l'emporte, sinon on rend le national.
export function domaineLabelOverrides(subjects, classId, domaines) {
  const out = new Map();
  for (const s of subjects || []) {
    if (classId && s.class_id !== classId) continue;
    const id = domaineIdForSubject(s, domaines);
    const nom = String(s?.name ?? '').trim();
    // Première ligne gagnante : une classe n'a qu'une matière par domaine après
    // auto-configuration, et deux lignes rivales ne doivent pas clignoter.
    if (id && nom && !out.has(id)) out.set(id, nom);
  }
  return out;
}

// Applique les surcharges à une liste de domaines déjà localisés.
export function withDomaineOverrides(domaines, overrides) {
  if (!overrides?.size) return domaines || [];
  // `_override` marque la ligne : en aval, matDomaineLabel() relocaliserait depuis
  // l'id et ecraserait le mot de l'ecole. Le drapeau dit « ne retraduis pas ».
  return (domaines || []).map((d) => (overrides.has(d.id)
    ? { ...d, intitule: overrides.get(d.id), _override: true }
    : d));
}
