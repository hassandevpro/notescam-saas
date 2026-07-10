// Structure budgétaire hiérarchique par DÉFAUT (Catégorie → Chapitres).
// Inspirée des pratiques de gestion financière des établissements scolaires.
// PUR (données) — un établissement peut la générer puis la personnaliser
// librement (créer/modifier/supprimer/réorganiser) sans toucher au code.
//
// NB : les « chapitres » listés ici sont initialement des FEUILLES (donc des
// points de rattachement de dépenses). L'établissement peut les subdiviser en
// sous-chapitres à volonté (le niveau feuille = « sous-chapitre » fonctionnel).

export const DEFAULT_BUDGET_STRUCTURE = [
  { label: 'Fonctionnement', kind: 'depense', chapters: [
    'Salaires', 'Eau', 'Électricité', 'Internet', 'Téléphone',
    'Fournitures administratives', 'Assurances', 'Impôts et taxes', 'Divers',
  ] },
  { label: 'Maintenance', kind: 'depense', chapters: [
    'Véhicules', 'Carburant', 'Pannes', 'Réparations', 'Entretien bâtiments',
    'Entretien matériel informatique', 'Climatisation', 'Groupe électrogène', 'Autres maintenances',
  ] },
  { label: 'Pédagogie', kind: 'depense', chapters: [
    'Fournitures scolaires', 'Examens', 'Bulletins', 'Photocopies', 'Bibliothèque',
    'Laboratoire', 'Activités pédagogiques', 'Formation des enseignants',
  ] },
  { label: 'Vie scolaire', kind: 'depense', chapters: [
    'Discipline', 'Activités culturelles', 'Activités sportives', 'Santé scolaire',
    'Sécurité', 'Transport scolaire', 'Cantine',
  ] },
  { label: 'Investissements', kind: 'depense', chapters: [
    'Construction', 'Mobilier', 'Informatique', 'Véhicules',
    'Équipements pédagogiques', 'Immobilisations',
  ] },
];

// Transforme la structure par défaut en lignes `budget_chapters` prêtes à insérer
// (catégories niveau 0 + chapitres niveau 1). `uid` = générateur d'identifiants.
export function instantiateDefaultStructure({ schoolId, budgetId, uid }) {
  const rows = [];
  DEFAULT_BUDGET_STRUCTURE.forEach((cat, ci) => {
    const catId = uid();
    rows.push({
      id: catId, school_id: schoolId, budget_id: budgetId, parent_id: null,
      level: 'category', label: cat.label, kind: cat.kind, planned_amount: 0, position: ci,
    });
    cat.chapters.forEach((chLabel, chi) => {
      rows.push({
        id: uid(), school_id: schoolId, budget_id: budgetId, parent_id: catId,
        level: 'chapter', label: chLabel, kind: cat.kind, planned_amount: 0, position: chi,
      });
    });
  });
  return rows;
}
