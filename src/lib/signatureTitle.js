// TITRE SOUS LA SIGNATURE DU BAS DE BULLETIN.
//
// Une école « globale » (un seul chef pour tout l'établissement) signe « Chef d'établissement ».
// Une école qui a un directeur PAR SECTION (maternelle, primaire, secondaire : Genius) garde
// « Directeur / Directrice » et le nom de la section. Le drapeau est explicite sur l'école
// (`schools.director_per_section`) : rien dans les données ne distingue les deux cas (La Retraite
// renseigne un directeur à chaque unité sans être « par section » au sens de la signature).
// Le NOM, lui, vient déjà de la règle Groupe → Unité (identité de l'unité, sinon celle de l'école).

export const parSection = (school) => {
  const v = school?.director_per_section;
  return v === true || v === 1 || v === '1';
};

/** @param {object} opts { bilingue } — bulletin bilingue FR/EN (en-tête officiel bilingue). */
export function titreSignatureDirection(school, sys, { bilingue = false } = {}) {
  if (parSection(school)) {
    return sys === 'EN' ? 'The Head Teacher' : sys === 'ES' ? 'El Director / La Directora' : 'Le Directeur / La Directrice';
  }
  if (sys === 'EN') return 'Head of School';
  if (sys === 'ES') return 'El Director / La Directora';
  return bilingue ? "Chef d'établissement / Head of School" : "Le Chef d'établissement";
}
