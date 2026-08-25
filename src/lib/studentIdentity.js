// IDENTITÉ D'UN ÉLÈVE — normalisation du nom et détection des doublons.
// Moteur PUR (aucun store, aucun réseau) → testable en Node.
//
// Deux besoins distincts, deux fonctions :
//
//   • normalizeStudentName — la forme STOCKÉE. Les établissements tiennent leurs
//     listes en majuscules (registres, PV, bulletins officiels) ; la saisie, elle,
//     arrive dans toutes les casses selon la personne qui inscrit. On normalise
//     donc à l'écriture, une fois, plutôt que de rattraper à chaque affichage.
//
//   • duplicateKey — la forme COMPARÉE, jamais affichée ni stockée. Elle retire
//     en plus les accents, parce que « KOUAMÉ » et « KOUAME » sont le même
//     enfant : sans cela, deux inscriptions par deux secrétaires différentes
//     passeraient à travers le contrôle.
//
// Pourquoi un AVERTISSEMENT et non une contrainte d'unicité : dans une école,
// deux élèves peuvent réellement porter le même nom (fratrie, homonymie). Une
// contrainte en base bloquerait une inscription légitime, ce qui pousserait à
// contourner en déformant le nom. On informe la personne qui inscrit, elle
// tranche.

// Espaces multiples ramenés à un seul, bords coupés, majuscules.
export function normalizeStudentName(name) {
  if (typeof name !== 'string') return name;
  return name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
}

// Clé de COMPARAISON : majuscules sans accents ni ponctuation d'espacement.
// « Kouamé  N'Guessan » et « KOUAME N'GUESSAN » donnent la même clé.
export function duplicateKey(name) {
  if (typeof name !== 'string') return '';
  return normalizeStudentName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');   // retire les diacritiques
}

/**
 * Élèves déjà inscrits portant le même nom.
 * @param {string} name       nom saisi
 * @param {Array}  students   effectif connu
 * @param {object} opts       { excludeId } — l'élève en cours de modification
 * @returns {Array} les homonymes trouvés (vide si aucun)
 */
export function findDuplicateStudents(name, students = [], { excludeId = null } = {}) {
  const key = duplicateKey(name);
  if (!key) return [];
  return (students || []).filter(
    (s) => s && s.id !== excludeId && duplicateKey(s.name) === key,
  );
}

/**
 * Message d'avertissement prêt à afficher, ou null s'il n'y a pas de doublon.
 * `classNameOf` résout l'id de classe en libellé (l'appelant connaît les classes).
 * `t` est la fonction i18n t(fr, en, es).
 */
export function duplicateWarning(name, students, { excludeId = null, classNameOf = () => null, t } = {}) {
  const found = findDuplicateStudents(name, students, { excludeId });
  if (!found.length) return null;

  const details = found
    .map((s) => {
      const cls = classNameOf(s.class_id);
      const etat = s.archived_at ? t('archivé', 'archived', 'archivado') : cls || t('sans classe', 'no class', 'sin clase');
      return `• ${s.name} (${etat})`;
    })
    .join('\n');

  const tete = found.length === 1
    ? t('Un élève de ce nom est déjà inscrit :', 'A student with this name is already enrolled:', 'Ya hay un alumno con este nombre:')
    : t(`${found.length} élèves de ce nom sont déjà inscrits :`, `${found.length} students with this name are already enrolled:`, `Ya hay ${found.length} alumnos con este nombre:`);

  return `${tete}\n\n${details}\n\n${t(
    "Enregistrer quand même ? (Annulez si c'est le même enfant.)",
    'Save anyway? (Cancel if this is the same child.)',
    '¿Guardar de todos modos? (Cancele si es el mismo niño.)',
  )}`;
}
