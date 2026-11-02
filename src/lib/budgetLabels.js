// Libellés complets des lignes budgétaires — fonctions PURES.
//
// Treize libellés existent en double dans un budget réel (« Salaires et Primes »
// une fois par pôle, avec des montants différents). Dans une liste déroulante qui
// n'affiche que le libellé de la ligne, on ne peut pas les distinguer. On écrit
// donc « Rubrique › Ligne », et le secteur quand il y en a un.
//
// `byId` : Map id → chapitre (rubriques et lignes). `sectorNames` : noms déjà
// résolus des secteurs de la ligne (le résultat de `unitLabel`, section comprise).
export function lineFullLabel(line, byId, { sectorNames = [] } = {}) {
  if (!line) return '';
  const parent = line.parent_id && byId?.get ? byId.get(line.parent_id) : null;
  const base = parent?.label ? `${parent.label} › ${line.label}` : String(line.label || '');
  const names = sectorNames.filter(Boolean);
  if (names.length === 1) return `${base} · ${names[0]}`;
  if (names.length > 1) return `${base} · ${names.length} secteurs`;
  return base;
}
