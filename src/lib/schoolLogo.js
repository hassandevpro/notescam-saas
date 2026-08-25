// Logo EFFECTIF de l'établissement.
//
// Le logo peut vivre à deux endroits :
//   • schools.logo_url        — l'établissement lui-même (Paramètres → Établissement) ;
//   • school_units[].logo_url — une unité du complexe scolaire (maternelle,
//     primaire, collège…), chacune portant sa propre identité visuelle.
//
// Une école organisée en complexe téléverse souvent SON logo au niveau de
// l'unité et laisse `schools.logo_url` vide. Tout ce qui ne regardait que
// `schools.logo_url` la traitait alors comme « sans logo » : le tableau de bord
// réclamait indéfiniment un téléversement déjà fait, et n'affichait aucun logo.
//
// On retient le logo de l'établissement en priorité (c'est l'identité globale),
// sinon celui de la PREMIÈRE unité dans l'ordre d'affichage — le même ordre
// `position` que le gestionnaire du complexe (SchoolUnitsManager), pour que le
// logo montré soit celui que l'utilisateur voit en tête de sa liste.

export function resolveSchoolLogo(school, units) {
  if (school?.logo_url) return school.logo_url;
  const withLogo = (units || []).filter((u) => u?.logo_url);
  if (!withLogo.length) return null;
  // Une unité rattachée à une AUTRE école ne doit jamais fournir le logo.
  const scoped = school?.id ? withLogo.filter((u) => !u.school_id || u.school_id === school.id) : withLogo;
  if (!scoped.length) return null;
  return [...scoped].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0].logo_url;
}

export const hasSchoolLogo = (school, units) => !!resolveSchoolLogo(school, units);
