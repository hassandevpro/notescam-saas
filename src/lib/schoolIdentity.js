// Identité effective d'un document = école (complexe) éventuellement SURCHARGÉE
// par l'unité pédagogique concernée (maternelle / primaire / collège / lycée…).
//
// Logique PURE, sans React ni I/O : testable et réutilisable côté cloud comme LAN.
//
// Principe « zéro régression » : sans unité définie (ou classe hors périmètre),
// `documentIdentity` renvoie l'objet école tel quel — le comportement historique.
// Dès qu'une unité correspond, ses champs NON VIDES surchargent ceux de l'école ;
// l'objet renvoyé garde la MÊME FORME que `school`, si bien qu'il se passe tel
// quel aux builders de documents (bulletins, cartes, relevés, certificats…) sans
// les modifier.

import { classSectionKey } from '../core/engineResolver.js';

// Champs d'identité qu'une unité pédagogique peut surcharger sur l'école.
// (`country_system`, `current_year`, `id`, `bulletin_font`, `bulletin_engine`…
//  restent TOUJOURS ceux de l'école : périmètre, année et officiels du pays.)
export const UNIT_IDENTITY_FIELDS = [
  'name', 'logo_url', 'stamp_url', 'signature_url', 'director',
  'address', 'phone', 'email', 'motto', 'establishment_no',
];

const filled = (v) => v != null && String(v).trim() !== '';

// Résout l'unité pédagogique d'une classe :
//   1) rattachement explicite `classes.unit_id` ;
//   2) sinon, unité dont `section_key` == section dérivée de la classe
//      (maternelle / primaire / premier_cycle / second_cycle / autre) ;
//   3) sinon null (⇒ identité = école, comportement historique).
export function resolveClassUnit(units, cls) {
  if (!Array.isArray(units) || units.length === 0 || !cls) return null;
  if (cls.unit_id) {
    const explicit = units.find((u) => u.id === cls.unit_id);
    if (explicit) return explicit;
  }
  const key = classSectionKey(cls);
  return units.find((u) => filled(u.section_key) && u.section_key === key) || null;
}

// Fusionne l'identité de l'unité par-dessus l'école. Renvoie un NOUVEL objet en
// forme de `school` (l'école n'est jamais mutée). `unit` null ⇒ école inchangée.
export function documentIdentity(school, unit) {
  if (!school || !unit) return school;
  const merged = { ...school };
  for (const f of UNIT_IDENTITY_FIELDS) {
    if (filled(unit[f])) merged[f] = unit[f];
  }
  // Couleurs (optionnelles) — exposées pour un éventuel thème par unité.
  if (filled(unit.color_primary))   merged.color_primary   = unit.color_primary;
  if (filled(unit.color_secondary)) merged.color_secondary = unit.color_secondary;
  // Traçabilité (utile au débogage / au thème). Non imprimé.
  merged.__unit_id   = unit.id;
  merged.__unit_name = unit.name;
  return merged;
}

// Raccourci : identité effective d'une classe (unité résolue puis fusionnée).
export function classIdentity(school, cls, units) {
  return documentIdentity(school, resolveClassUnit(units, cls));
}

// Identité effective d'un élève : passe par sa classe. `classes` = liste des
// classes chargées ; on retrouve celle de l'élève par `class_id`.
export function studentIdentity(school, student, classes, units) {
  const cls = Array.isArray(classes)
    ? classes.find((c) => c.id === student?.class_id)
    : null;
  return classIdentity(school, cls, units);
}
