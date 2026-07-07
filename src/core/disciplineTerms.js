// Terminologie de la vie scolaire — libellés localisés (FR / EN / ES).
//
// Chaque terme est un tuple [fr, en, es] rendu par la fonction i18n `t(...tuple)`.
// La langue effective découle du PROFIL de l'établissement : une école
// camerounaise anglophone tourne en `en`, la Guinée Équatoriale en `es`, le
// francophone/bilingue en `fr` (cf. countries/ + defaultLangForCountry). Aucun
// texte en dur dans les écrans : ils importent ces listes et appliquent `t`.
//
// `value` = code stocké en base (stable, jamais traduit). `label` = tuple i18n.

// ── Types d'incidents ────────────────────────────────────────────────────────
export const INCIDENT_TYPES = [
  { value: 'bagarre',     label: ['Bagarre', 'Fight', 'Pelea'] },
  { value: 'insolence',   label: ['Insolence', 'Insolence', 'Insolencia'] },
  { value: 'fraude',      label: ['Fraude', 'Cheating', 'Fraude'] },
  { value: 'degradation', label: ['Dégradation', 'Vandalism', 'Daños'] },
  { value: 'violence',    label: ['Violence', 'Violence', 'Violencia'] },
  { value: 'telephone',   label: ['Téléphone interdit', 'Forbidden phone', 'Teléfono prohibido'] },
  { value: 'autre',       label: ['Autre incident', 'Other incident', 'Otro incidente'] },
];

// ── Gravité ──────────────────────────────────────────────────────────────────
export const INCIDENT_SEVERITY = [
  { value: 'mineur', label: ['Mineur', 'Minor', 'Menor'],  color: '#16a34a' },
  { value: 'majeur', label: ['Majeur', 'Major', 'Mayor'],  color: '#d97706' },
  { value: 'grave',  label: ['Grave', 'Serious', 'Grave'], color: '#dc2626' },
];

// ── Statut d'un incident ─────────────────────────────────────────────────────
export const INCIDENT_STATUS = [
  { value: 'ouvert', label: ['Ouvert', 'Open', 'Abierto'] },
  { value: 'traite', label: ['Traité', 'Handled', 'Tratado'] },
  { value: 'classe', label: ['Classé', 'Closed', 'Archivado'] },
];

// ── Sanctions (disciplinary_actions.action_type) ─────────────────────────────
export const ACTION_TYPES = [
  { value: 'avertissement_oral',    label: ['Avertissement oral', 'Verbal warning', 'Amonestación verbal'] },
  { value: 'avertissement_ecrit',   label: ['Avertissement écrit', 'Written warning', 'Amonestación escrita'] },
  { value: 'blame',                 label: ['Blâme', 'Reprimand', 'Censura'] },
  { value: 'retenue',               label: ['Retenue', 'Detention', 'Retención'] },
  { value: 'exclusion_temporaire',  label: ['Exclusion temporaire', 'Temporary exclusion', 'Expulsión temporal'] },
  { value: 'exclusion_definitive',  label: ['Exclusion définitive', 'Permanent exclusion', 'Expulsión definitiva'] },
  { value: 'travail_interet',       label: ["Travail d'intérêt scolaire", 'Community service', 'Trabajo comunitario'] },
];

// ── Avertissements (student_warnings) ────────────────────────────────────────
export const WARNING_TYPES = [
  { value: 'oral',  label: ['Oral', 'Verbal', 'Verbal'] },
  { value: 'ecrit', label: ['Écrit', 'Written', 'Escrito'] },
];
export const WARNING_CATEGORIES = [
  { value: 'travail',  label: ['Travail', 'Schoolwork', 'Trabajo'] },
  { value: 'conduite', label: ['Conduite', 'Conduct', 'Conducta'] },
];

// ── Convocations / rendez-vous parents ───────────────────────────────────────
export const MEETING_TARGETS = [
  { value: 'eleve',    label: ['Élève', 'Student', 'Alumno'] },
  { value: 'parent',   label: ['Parent', 'Parent', 'Padre/Madre'] },
  { value: 'les_deux', label: ['Élève & parent', 'Student & parent', 'Alumno y padre'] },
];
export const MEETING_STATUS = [
  { value: 'planifie', label: ['Planifié', 'Scheduled', 'Planificado'] },
  { value: 'honore',   label: ['Honoré', 'Attended', 'Asistió'] },
  { value: 'absent',   label: ['Absent', 'No-show', 'No asistió'] },
  { value: 'annule',   label: ['Annulé', 'Cancelled', 'Cancelado'] },
];

// ── Autorisations de sortie ──────────────────────────────────────────────────
export const EXIT_TYPES = [
  { value: 'medicale',       label: ['Sortie médicale', 'Medical leave', 'Salida médica'] },
  { value: 'parentale',      label: ['Sortie parentale', 'Parental leave', 'Salida parental'] },
  { value: 'administrative', label: ['Sortie administrative', 'Administrative leave', 'Salida administrativa'] },
  { value: 'exceptionnelle', label: ['Autorisation exceptionnelle', 'Exceptional leave', 'Permiso excepcional'] },
];

// ── Conseil de discipline ────────────────────────────────────────────────────
export const COUNCIL_STATUS = [
  { value: 'convoque', label: ['Convoqué', 'Convened', 'Convocado'] },
  { value: 'tenu',     label: ['Tenu', 'Held', 'Celebrado'] },
  { value: 'clos',     label: ['Clos', 'Closed', 'Cerrado'] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
// Rend une liste [{ value, text }] prête pour un <select>, `t` appliqué.
export function localizedOptions(list, t) {
  return list.map((o) => ({ value: o.value, text: t(...o.label), color: o.color }));
}

// Libellé d'un code dans une liste (avec repli sur le code brut inconnu).
export function labelOf(list, value, t) {
  const found = list.find((o) => o.value === value);
  return found ? t(...found.label) : (value || '—');
}

// Couleur d'un code (gravité) ou gris par défaut.
export function colorOf(list, value) {
  return list.find((o) => o.value === value)?.color || '#6b7280';
}
