// SECTEUR DE RATTACHEMENT DU PERSONNEL — vocabulaire unique, côté interface.
//
// Une seule liste, partagée par les écrans Enseignants et Personnel. Elle existe
// pour empêcher une erreur précise : écrire « secondaire » au lieu de 'college'.
//
// Le mot « Secondaire » est un LIBELLÉ. La VALEUR stockée est 'college' — c'est
// celle que produit `class_sector()` (cloud) comme `classSector()` (LAN), et
// celle que `userSectors()` compare. Une quatrième valeur ne serait reconnue par
// aucune de ces comparaisons : la fiche deviendrait invisible de tout le monde,
// silencieusement.
//
// Ne pas confondre avec l'autre axe, `scope_cycles`, qui parle
// « fondamental | secondaire » — c'est LUI qui porte le mot « secondaire ».

export const PERSONNEL_SECTORS = ['maternelle', 'primaire', 'college'];

// `t` = fonction i18n t(fr, en, es).
export function sectorOptions(t) {
  return [
    { value: 'maternelle', label: t('Maternelle', 'Nursery', 'Preescolar') },
    { value: 'primaire',   label: t('Primaire', 'Primary', 'Primaria') },
    { value: 'college',    label: t('Secondaire', 'Secondary', 'Secundaria') },
  ];
}

export function sectorLabel(value, t) {
  return sectorOptions(t).find((o) => o.value === value)?.label
    // NULL n'est pas un secteur : c'est l'absence de secteur, et le libellé doit
    // le dire. « Transverse » laisserait croire à un rattachement volontaire.
    || t('Non affecté', 'Unassigned', 'Sin asignar');
}

// Secteurs qu'un compte peut ATTRIBUER. Le serveur tranche pour de bon
// (scopeGuard.applyPersonnelSector) ; ceci évite seulement de proposer un choix
// qu'il refuserait. Un compte à un seul secteur n'a rien à choisir.
export function assignableSectors({ isAdmin = false, sectors = [] } = {}) {
  if (isAdmin) return PERSONNEL_SECTORS;
  return PERSONNEL_SECTORS.filter((s) => sectors.includes(s));
}
